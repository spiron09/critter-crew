import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Agent, AgentState, Board, Step } from '../types'
import { AVATAR, CRITTERS, avatarSvg, contextOf, critterOf, elapsed, fmtTokens, modelName } from './art'

const PANE = 'crew'
const MAIN = 'main'
const LINGER = 4000 // ms the full bar stays once the batch is done

// Helpers get a first name; their critter is their kind.
const NAMES = ['Bruno', 'Miso', 'Pip', 'Juno', 'Hops', 'Olive', 'Taro', 'Fig', 'Mochi', 'Kiwi', 'Basil', 'Nori']

const board = atom({ plugin: 'critter-crew', key: 'board' } as const, emptyBoard(), { shape: 'crew-3' })
const clock = atom({ plugin: 'critter-crew', key: 'now' } as const, 0)
// Which cards are expanded to show their steps and report.
const open = atom({ plugin: 'critter-crew', key: 'open' } as const, [] as string[])
const MAX_STEPS = 40
const INK_2 = '#C3C2B7' // secondary ink, validated on the dark card
const INK_3 = '#898781' // muted ink

function emptyBoard(): Board {
  return {
    hired: 0,
    tools: 0,
    agents: [
      {
        id: MAIN,
        parent: null,
        name: 'Claude',
        critter: 'claude',
        role: 'lead',
        task: '',
        doing: '',
        state: 'idle',
        model: '',
        startedAt: 0,
        endedAt: null,
        tools: 0,
        tokens: 0,
        context: 0,
        steps: [],
        report: '',
      },
    ],
  }
}

// ---------- what a tool call means, in plain words ----------

const fileName = (p: unknown) => (typeof p === 'string' ? (p.split('/').pop() ?? p) : 'a file')
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function describe(tool: string, input: Record<string, unknown>): string {
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  switch (tool) {
    case 'Read':
      return `reading ${fileName(input.file_path)}`
    case 'Edit':
    case 'Write':
      return `editing ${fileName(input.file_path)}`
    case 'NotebookEdit':
      return `editing ${fileName(input.notebook_path)}`
    case 'Bash': {
      const d = str('description')
      if (d) return clip(d.charAt(0).toLowerCase() + d.slice(1), 40)
      return `running ${clip(str('command').split(/\s+/)[0] ?? 'a command', 24)}`
    }
    case 'Grep':
      return `searching for “${clip(str('pattern'), 24)}”`
    case 'Glob':
      return `looking for ${clip(str('pattern'), 28)}`
    case 'WebSearch':
      return 'searching the web'
    case 'WebFetch':
      return 'reading a web page'
    case 'Agent':
    case 'Task':
      return 'briefing a helper'
    case 'Skill':
      return `opening the ${str('skill') || 'skill'} playbook`
  }
  if (tool.startsWith('mcp__')) {
    const last = tool.split('__').pop() ?? tool
    return `using ${last.replace(/_/g, ' ')}`
  }
  return `using ${tool}`
}

export { elapsed }

// Live status in Claude's own voice: sentence case, trailing ellipsis.
export const activity = (doing: string) => {
  const d = doing || 'getting started'
  return `${d.charAt(0).toUpperCase()}${d.slice(1).replace(/[.…]+$/, '')}…`
}

// ---------- board edits ----------

const patch = (b: Board, id: string, fn: (a: Agent) => Agent): Board => ({
  ...b,
  agents: b.agents.map(a => (a.id === id ? fn(a) : a)),
})

const anyWorking = (b: Board) => b.agents.some(a => a.state === 'working')
const isEnded = (a: Agent) => a.state === 'done' || a.state === 'failed' || a.state === 'stopped'
const STALE_MS = 10 * 60_000 // a working card nobody can account for for this long is let go

// A name for the nth helper: the roster, then numbered once it wraps ("Bruno 2").
const nameFor = (n: number) => `${NAMES[n % NAMES.length]}${n >= NAMES.length ? ` ${Math.floor(n / NAMES.length) + 1}` : ''}`

// Where the engine says an agent stands, as a card state; undefined = still working.
function stateOfStatus(status: string): AgentState | undefined {
  if (status === 'completed') return 'done'
  if (status === 'failed') return 'failed'
  if (status === 'killed') return 'stopped'
  if (status === 'idle') return 'resting'
  return undefined // pending, running, waiting
}

// A helper the board never saw start (started before the mod loaded, or after a
// reload): find it in the engine's list and give it a card.
const unlisted = new Set<string>() // ids the engine doesn't list (workflow, engine forks): ask once

async function adopt($: EngineInterface, id: string): Promise<boolean> {
  if (unlisted.has(id)) return false
  const info = (await $.agent.list()).find(i => i.id === id)
  if (!info) {
    unlisted.add(id)
    return false
  }
  const t = await $.clock.now()
  await update($, board, b => {
    if (b.agents.some(a => a.id === id)) return b
    const n = b.hired
    const helper: Agent = {
      id,
      parent: info.parentId ?? MAIN,
      name: info.name ?? nameFor(n),
      critter: CRITTERS[n % CRITTERS.length]!.key,
      role: info.type === 'general-purpose' ? 'helper' : info.type.toLowerCase(),
      task: info.description,
      doing: 'working',
      state: stateOfStatus(info.status) ?? 'working',
      model: '',
      startedAt: t,
      endedAt: null,
      tools: 0,
      tokens: 0,
      context: 0,
      steps: [],
      report: '',
    }
    return { ...b, hired: n + 1, agents: [...b.agents, helper] }
  })
  return true
}

let ticker: { cancel: () => void } | null = null

// Ticks the timers once a second while anyone works; the sprites move in CSS.
async function syncTicker($: EngineInterface) {
  const b = await read($, board)
  if (anyWorking(b) && !ticker) {
    ticker = $.clock.every(1000, () => {
      void $.clock.now().then(n => update($, clock, () => n))
      if (++ticks % 5 === 0) void reconcile($)
    })
  } else if (!anyWorking(b) && ticker) {
    ticker.cancel()
    ticker = null
  }
  const n = await $.clock.now()
  await update($, clock, () => n)
}

let ticks = 0

// A helper that is interrupted or dies may never send its own turn.complete.
// The engine's agent list is the truth: close any card it says has ended, rest
// a teammate gone idle, and let go of a card nothing can account for.
async function reconcile($: EngineInterface) {
  const b = await read($, board)
  const open = b.agents.filter(a => a.id !== MAIN && a.state === 'working')
  if (open.length === 0) return
  const live = await $.agent.list()
  const t = await $.clock.now()
  const next = new Map<string, AgentState>()
  for (const a of open) {
    const info = live.find(i => i.id === a.id)
    if (info) {
      // `status`, not `taskStatus`: the task record says completed as soon as a
      // turn ends, even while the agent still waits on background work it owns.
      const s = stateOfStatus(info.status)
      if (s) next.set(a.id, s)
      continue
    }
    // Not listed (a workflow's or remote agent) and silent for a long while.
    const lastSeen = Math.max(a.startedAt, ...a.steps.map(st => st.at))
    if (t - lastSeen > STALE_MS) next.set(a.id, 'stopped')
  }
  if (next.size === 0) return
  await update($, board, bb => ({
    ...bb,
    agents: bb.agents.map(a => {
      const s = next.get(a.id)
      if (!s || a.state !== 'working') return a
      return s === 'resting' ? { ...a, state: s, doing: '' } : { ...a, state: s, endedAt: t, doing: '' }
    }),
  }))
  await syncTicker($)
}

// Helpers first by state (working, then finished), newest first; nested ones follow their parent.
function ordered(b: Board): Agent[] {
  const helpers = b.agents.filter(a => a.id !== MAIN)
  const rank = (a: Agent) => (a.state === 'working' ? 0 : 1)
  const out: Agent[] = []
  const walk = (parent: string) =>
    helpers
      .filter(h => h.parent === parent)
      .sort((x, y) => rank(x) - rank(y) || y.startedAt - x.startedAt)
      .forEach(h => {
        out.push(h)
        walk(h.id)
      })
  walk(MAIN)
  helpers.filter(h => !out.includes(h)).forEach(h => out.push(h))
  return out
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'crew', description: 'Open the crew board: who is working on what' })
    void $.ui.open({ id: PANE, title: 'Crew' })
    // A reload keeps the board but not the timer: start it again if anyone works.
    await syncTicker($)
    return next(e)
  })

  on('command.run', { command: 'crew' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Crew' })
    return { text: 'Crew board opened.' }
  })

  on('prompt.submit', async ($, e, next) => {
    await reconcile($)
    const t = await $.clock.now()
    await update($, board, b => {
      // Finished helpers stay: a hand-back from a helper starts a turn too, and
      // clearing here emptied the crew's progress mid-batch. A new batch clears them.
      return patch(b, MAIN, a => ({ ...a, state: 'working', doing: 'thinking', startedAt: t, endedAt: null }))
    })
    await syncTicker($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny !== undefined || started.agentId === undefined) return started
    const id = started.agentId
    const t = await $.clock.now()
    // A resumed run continues under the same id: wake the same card, same critter.
    const resumed = (await read($, board)).agents.find(a => a.id === id)
    if (resumed) {
      await update($, board, b =>
        patch(b, id, a => ({ ...a, state: 'working', doing: 'picking up where it left off', endedAt: null, model: started.model || a.model })),
      )
      await syncTicker($)
      return started
    }
    await update($, board, b => {
      const n = b.hired
      const helper: Agent = {
        id,
        parent: e.parentAgentId ?? MAIN,
        name: e.name ?? nameFor(n),
        critter: CRITTERS[n % CRITTERS.length]!.key,
        role: e.subagentType === 'general-purpose' ? 'helper' : e.subagentType.toLowerCase(),
        task: e.description,
        doing: 'reading the brief',
        state: 'working',
        model: started.model,
        startedAt: t,
        endedAt: null,
        tools: 0,
        tokens: 0,
        context: 0,
        steps: [],
        report: '',
      }
      // The first helper out while nobody works starts a new batch: the last
      // batch's finished helpers go home, so the bar counts this batch alone.
      const isNewBatch = !b.agents.some(a => a.id !== MAIN && a.state === 'working')
      const kept = b.agents.filter(a => a.id !== id && (a.id === MAIN || !isNewBatch || a.state === 'working'))
      return { ...b, hired: n + 1, agents: [...kept, helper] }
    })
    await syncTicker($)
    return started
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const id = e.agentId ?? MAIN
    const doing = describe(e.tool, e as unknown as Record<string, unknown>)
    const at = await $.clock.now()
    let known = (await read($, board)).agents.some(a => a.id === id)
    if (!known && id !== MAIN) known = await adopt($, id)
    const stepId = e.tool_use_id
    if (known) {
      const step: Step = { at, what: doing, ok: null, id: stepId }
      await update($, board, b => ({
        // Any tool call means it's working, whatever the card said before.
        ...patch(b, id, a => ({ ...a, state: 'working', endedAt: null, doing, tools: a.tools + 1, steps: [...a.steps, step].slice(-MAX_STEPS) })),
        tools: b.tools + 1,
      }))
    }
    const ran = await next(e)
    if (known) {
      const ok = ran.deny === undefined && ran.isError !== true
      await update($, board, b =>
        patch(b, id, a => ({
          ...a,
          steps: a.steps.map(st => ((stepId ? st.id === stepId : st.at === at) && st.ok === null ? { ...st, ok } : st)),
        })),
      )
    }
    return ran
  }).catch(($, e, next) => next(e))

  // A new turn in a helper's loop (a resumed helper, a teammate woken by a
  // message, a waiting helper back at work): it is working again.
  on('turn.start', async ($, e, next) => {
    const id = e.agentId
    if (id) {
      let known = (await read($, board)).agents.some(a => a.id === id)
      if (!known) known = await adopt($, id)
      if (known) {
        await update($, board, b =>
          patch(b, id, a => (a.state === 'working' ? a : { ...a, state: 'working', doing: 'thinking', endedAt: null })),
        )
        await syncTicker($)
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Each model request reports its tokens: the running total and how full the context is.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const u = result.usage
    if (!u) return result
    const id = e.agentId ?? MAIN
    const context =
      (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.output_tokens || 0)
    await update($, board, b =>
      patch(b, id, a => ({
        ...a,
        model: u.model || e.model || a.model,
        tokens: a.tokens + (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0),
        context,
      })),
    )
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId ?? MAIN
    const t = await $.clock.now()
    const before = (await read($, board)).agents.find(a => a.id === id)
    if (before && id !== MAIN) {
      const report = (e.answer || '').trim().slice(0, 4000) || before.report
      const info = (await $.agent.list()).find(i => i.id === id)
      // Turn over, run not over: still waiting on background work it owns (a
      // monitor, a watched program, a plan's approval). Keep it working.
      if (info && (info.status === 'waiting' || info.status === 'running' || info.status === 'pending')) {
        await update($, board, b => patch(b, id, a => ({ ...a, doing: 'waiting on background work', report })))
        await syncTicker($)
        return next(e)
      }
      // A teammate between turns: resting until a message wakes it.
      if (info && info.status === 'idle') {
        await update($, board, b => patch(b, id, a => ({ ...a, state: 'resting', doing: '', report })))
        await syncTicker($)
        return next(e)
      }
      // Ended. Interrupted or killed is 'stopped' (not an error); an error or a
      // refusal is 'failed'; otherwise done.
      const state: AgentState =
        info && stateOfStatus(info.status)
          ? stateOfStatus(info.status)!
          : e.reason === 'answer'
            ? 'done'
            : e.reason === 'aborted'
              ? 'stopped'
              : 'failed'
      await update($, board, b => patch(b, id, a => ({ ...a, state, endedAt: t, doing: '', report })))
    } else if (before) {
      await update($, board, b => patch(b, id, a => ({ ...a, state: 'idle', endedAt: t, doing: '' })))
    }
    if (id === MAIN) await reconcile($)
    // When the last helper is done, the band holds the full bar a moment, then
    // a tick past the linger redraws it away.
    if (id !== MAIN && !(await read($, board)).agents.some(a => a.id !== MAIN && a.state === 'working')) {
      $.clock.after(LINGER + 200, () => void $.clock.now().then(n => update($, clock, () => n)))
    }
    await syncTicker($)
    return next(e)
  }).catch(($, e, next) => next(e))

  // ---------- the board ----------
  // Text is the app's own (size, weight, wrapping, light and dark); only the
  // fixed-size avatars are drawn, so nothing is rescaled or set in a stand-in font.

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    const b = await read($, board)
    const now = Math.max(await read($, clock), ...b.agents.map(a => a.startedAt))
    const main = b.agents.find(a => a.id === MAIN)!
    const helpers = ordered(b)
    const working = helpers.filter(h => h.state === 'working')
    const isDesktop = e.surface !== 'terminal' && 'Svg' in ui
    const expanded = await read($, open)

    const status = (a: Agent) => {
      const time = elapsed((a.endedAt ?? now) - a.startedAt)
      if (a.state === 'working') return activity(a.doing)
      // Each critter says it its own way: 'Sniffed it out in 0:41'.
      if (a.state === 'done') return `${critterOf(a.critter).verb} in ${time}`
      if (a.state === 'failed') return `Got stuck after ${time}`
      if (a.state === 'stopped') return `Stopped after ${time}`
      if (a.state === 'resting') return 'Resting until it gets a message'
      return 'Waiting for your next ask'
    }

    const card = (a: Agent, depth = 0, kids: unknown[] = []) => {
      const c = critterOf(a.critter)
      const live = a.state === 'working'
      const isMain = a.id === MAIN
      const who = isMain ? 'Claude' : `${a.name} the ${c.name.toLowerCase()}`
      const meta = [isMain ? '' : a.role, modelName(a.model)].filter(Boolean).join(' · ')
      const title = isMain ? (live ? 'Leading the work' : 'Ready when you are') : a.task || a.role
      const time = isMain && !live ? '' : elapsed((a.endedAt ?? now) - a.startedAt)
      // One quiet byline: who, which model, how far in. The ring on the avatar
      // already shows context, so the card carries no second row of numbers.
      // Metadata in the mono face, lower case: Claude Code's terminal accent.
      // Identity colour on the name only; the rest wears the neutral ink family
      // (dataviz: text wears text tokens): role secondary, model and tokens muted.
      const nameTag = (isMain ? 'claude' : a.name).toLowerCase()
      // 'helper' is the default role, so it says nothing; specific roles still show.
      const roleTag = isMain || a.role === 'helper' ? '' : a.role.toLowerCase()
      const modelTag = modelName(a.model).toLowerCase()
      const tokTag = a.tokens ? `${fmtTokens(a.tokens)} tok` : ''
      const hirer = a.parent && a.parent !== MAIN ? b.agents.find(x => x.id === a.parent) : undefined

      if (isDesktop) {
        const { Svg, Button, Markdown } = ui as typeof ui & {
          Svg: NonNullable<(typeof ui)['Svg']>
          Markdown: NonNullable<(typeof ui)['Markdown']>
        }
        const isOpen = expanded.includes(a.id)
        const hasDetails = a.steps.length > 0 || a.report !== ''
        const toggle = () => update($, open, ids => (ids.includes(a.id) ? ids.filter(x => x !== a.id) : [...ids, a.id]))
        const outline = live ? { borderColor: c.color } : { borderDimColor: true as const }
        const details = isOpen && (
          <Box flexDirection="column" gap="md" marginTop="xs">
            {a.steps.length > 0 && (
              <Box flexDirection="column" gap="xs">
                <Text size="caption" weight="medium" dimColor>{`Activity · ${a.tools}`}</Text>
                {a.steps.map((st, i) => {
                  const isFailed = st.ok === false
                  const isRunning = st.ok === null && live
                  return (
                    <Box key={`s-${a.id}-${i}`} flexDirection="row" justifyContent="space-between" gap="md">
                      <Text size="footnote" color={isFailed ? 'error' : isRunning ? c.color : undefined} dimColor={!isFailed && !isRunning} wrap="truncate-end">
                        {`${st.what.charAt(0).toUpperCase()}${st.what.slice(1)}${isRunning ? '…' : ''}${isFailed ? ' · failed' : ''}`}
                      </Text>
                      <Text size="caption" mono dimColor>{elapsed(st.at - a.startedAt)}</Text>
                    </Box>
                  )
                })}
              </Box>
            )}
            {a.report !== '' && (
              <Box flexDirection="column" gap="xs">
                <Text size="caption" weight="medium" dimColor>Report</Text>
                <Markdown text={a.report} />
              </Box>
            )}
          </Box>
        )

        // Nested helpers are compact rows: the indent already says who hired
        // them, so they carry just the critter, the task, what it's doing, the time.
        if (depth > 0) {
          return (
            <Box key={a.id} flexDirection="column" gap="xs">
              <Box flexDirection="row" alignItems="center" gap="sm">
                <Svg source={avatarSvg(a, 32)} alt={`${a.name}, ${a.state}`} width={32} height={32} />
                <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
                  <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap="sm">
                    <Text size="footnote" weight="semibold" dimColor={!live} wrap="truncate-end">{title}</Text>
                    {time ? <Text size="caption" mono dimColor>{time}</Text> : null}
                  </Box>
                  <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap="sm">
                    <Text size="caption" wrap="truncate-end">
                      <Text size="caption" mono color={c.color}>{nameTag}</Text>
                      <Text size="caption" color={a.state === 'failed' ? 'error' : undefined} dimColor={a.state !== 'failed'}>{`  ${status(a)}`}</Text>
                    </Text>
                    {hasDetails && <Button key={`d-${a.id}`} label={isOpen ? 'Hide' : 'Activity'} plain dimColor onPress={() => void toggle()} />}
                  </Box>
                </Box>
              </Box>
              {details}
            </Box>
          )
        }

        return (
          // A working card carries its critter's colour on its outline; finished ones go quiet.
          <Box key={a.id} flexDirection="column" gap="sm" paddingX="md" paddingY="md" borderStyle="round" {...outline}>
            <Box flexDirection="row" alignItems="center" gap="md">
              <Svg source={avatarSvg(a)} alt={`${who}, ${a.state}, ${Math.round(contextOf(a) * 100)}% context`} width={AVATAR} height={AVATAR} />
              <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} gap="xs">
                <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap="md">
                  <Text size="body" weight="semibold" dimColor={!live && !isMain} wrap="truncate-end">
                    {title}
                  </Text>
                  {time ? <Text size="footnote" mono dimColor>{time}</Text> : null}
                </Box>
                <Text size="footnote" color={a.state === 'failed' ? 'error' : undefined} dimColor={!live && a.state !== 'failed'} wrap="truncate-end">
                  {status(a)}
                </Text>
                <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap="md">
                  <Text size="caption" mono wrap="truncate-end">
                    <Text size="caption" mono color={c.color}>{nameTag}</Text>
                    {roleTag ? <Text size="caption" mono dimColor>{' · '}</Text> : null}
                    {roleTag ? <Text size="caption" mono color={INK_2}>{roleTag}</Text> : null}
                    {modelTag ? <Text size="caption" mono dimColor>{' · '}</Text> : null}
                    {modelTag ? <Text size="caption" mono color={INK_3}>{modelTag}</Text> : null}
                    {tokTag ? <Text size="caption" mono dimColor>{` · ${tokTag}`}</Text> : null}
                  </Text>
                  {hasDetails && (
                    <Button key={`d-${a.id}`} label={isOpen ? 'Hide' : 'Activity'} plain onPress={() => void toggle()} />
                  )}
                </Box>
              </Box>
            </Box>
            {details}
          </Box>
        )
      }

      // Terminal: the same card as text rows.
      const mark = live ? '●' : a.state === 'done' ? '✓' : a.state === 'failed' ? '✗' : a.state === 'stopped' ? '■' : '○'
      return (
        <Box key={a.id} flexDirection="column" marginBottom={1}>
          <Box flexDirection="row" gap={1}>
            <Text color={a.state === 'failed' ? 'error' : a.state === 'done' ? 'success' : c.color}>{mark}</Text>
            <Text bold color={c.color}>{isMain ? 'Claude' : a.name}</Text>
            <Text dimColor>{meta}</Text>
            {hirer ? <Text color={critterOf(hirer.critter).color}>{`via ${hirer.name}`}</Text> : null}
            <Text dimColor>{time}</Text>
          </Box>
          {!isMain && <Text wrap="truncate-end">{'  '}{title}</Text>}
          <Text dimColor={!live} wrap="truncate-end">{'  '}{status(a)}</Text>
        </Box>
      )
    }

    const section = (label: string, n: number) => (
      <Box key={`h-${label}`} flexDirection="row" gap="xs" marginTop="lg" paddingX="xs">
        <Text size="footnote" weight="semibold">{label}</Text>
        <Text size="footnote" dimColor>{String(n)}</Text>
      </Box>
    )

    // The one figure worth scanning for gets Claude's colour; the words stay plain.
    const [headNum, headRest] =
      working.length > 0
        ? [String(working.length), ' on the job']
        : helpers.length > 0
          ? ['', `All ${helpers.length} done`]
          : main.state === 'working'
            ? ['', "Claude's on it"]
            : ['', 'All quiet']
    const totals = (() => {
      const tokens = b.agents.reduce((n, a) => n + a.tokens, 0)
      const crew = helpers.length ? `${working.length} of ${helpers.length} working` : main.state === 'working' ? 'Claude is working solo' : 'Everyone is resting'
      return [crew, tokens ? `${fmtTokens(tokens)} tokens` : ''].filter(Boolean).join(' · ')
    })()

    return (
      <Box flexDirection="column" gap="sm" paddingX={isDesktop ? 'xs' : 1}>
        {isDesktop ? (
          // The crew header: one headline for the state, the whole crew lined up.
          <Box flexDirection="row" alignItems="center" justifyContent="space-between" gap="md" paddingX="xs" marginBottom="sm">
            <Box flexDirection="column" gap="xs" flexShrink={1} minWidth={0}>
              <Text size="title" weight="bold" wrap="truncate-end">
                {headNum ? <Text size="title" weight="bold" color={critterOf('claude').color}>{headNum}</Text> : null}
                {headRest}
              </Text>
              <Text size="footnote" mono dimColor wrap="truncate-end">{totals.toLowerCase()}</Text>
            </Box>
            <Box flexDirection="row" alignItems="center" gap="xs" flexShrink={0}>
              {[main, ...helpers].slice(0, 6).map(mate => {
                const { Svg } = ui as typeof ui & { Svg: NonNullable<(typeof ui)['Svg']> }
                return <Svg key={`h-${mate.id}`} source={avatarSvg(mate, 32, isEnded(mate))} alt={mate.name} width={32} height={32} />
              })}
            </Box>
          </Box>
        ) : (
          <Box paddingX="xs" marginBottom="xs">
            <Text size="footnote" mono dimColor>{totals.toLowerCase()}</Text>
          </Box>
        )}
        {card(main)}
        {helpers.length > 0 && section('Helpers', helpers.length)}
        {[...helpers]
          .sort((x, y) => Number(y.state === 'working') - Number(x.state === 'working') || y.startedAt - x.startedAt)
          .map(h => card(h))}
        {helpers.length === 0 && (
          <Text size="footnote" dimColor>
            No helpers yet. When Claude hands work to a subagent, it shows up here.
          </Text>
        )}
      </Box>
    )
  })

  // Above the prompt, while helpers are out: one bar for the whole crew's work
  // on this ask. The pane holds the detail; the band only says how far along.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const b = await read($, board)
    // Resting teammates aren't part of a batch's progress.
    const helpers = b.agents.filter(a => a.id !== MAIN && a.state !== 'resting')
    const out = helpers.filter(a => a.state === 'working')
    // Read the clock only once the batch is done: a read subscribes this band,
    // and a once-a-second redraw while helpers work would replay its images.
    const lastEnd = Math.max(0, ...helpers.map(a => a.endedAt ?? 0))
    const isLingering = out.length === 0 && helpers.length > 0 && (await read($, clock)) - lastEnd < LINGER
    if (out.length === 0 && !isLingering) return next(e)
    const done = helpers.length - out.length
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    // One working helper: say what it's on. Several: name the first, count the rest.
    // The sentence in two weights: who (medium) and what (regular, grey).
    const [lead, rest] =
      out.length === 0
        ? [`${helpers.length} helper${helpers.length === 1 ? '' : 's'}`, ' finished']
        : out.length === 1
          ? [out[0]!.name, ` is ${out[0]!.doing ? activity(out[0]!.doing).replace(/^./, ch => ch.toLowerCase()) : 'getting started…'}`]
          : [`${out[0]!.name} and ${out.length - 1} other${out.length > 2 ? 's' : ''}`, ' working']
    const who = `${lead}${rest}`
    // Done: the left already says how many, so the right says how long.
    const since = Math.min(...helpers.map(a => a.startedAt))
    const tally = out.length === 0 ? `in ${elapsed(lastEnd - since)}` : `${done}/${helpers.length}`
    // The critters are the progress: one per helper in the order they started,
    // each with its own badge, so nothing depends on how wide the band draws.
    const roster = [...helpers].sort((x, y) => x.startedAt - y.startedAt)
    const SHOWN = 6

    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui as typeof ui & { Svg: NonNullable<(typeof ui)['Svg']> }
      return (
        <Box flexDirection="row" alignItems="center" gap="md">
          <Box flexDirection="row" alignItems="center" gap="xs" flexShrink={0}>
            {roster.slice(0, SHOWN).map(mate => (
              <Svg key={mate.id} source={avatarSvg(mate, 28, isEnded(mate))} alt={`${mate.name}, ${mate.state}`} width={28} height={28} />
            ))}
            {roster.length > SHOWN && <Text size="footnote" dimColor>{`+${roster.length - SHOWN}`}</Text>}
          </Box>
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text size="footnote" wrap="truncate-end">
              <Text size="footnote" weight="medium" color={out.length === 1 ? critterOf(out[0]!.critter).color : undefined}>{lead}</Text>
              <Text size="footnote" dimColor>{rest}</Text>
            </Text>
          </Box>
          {/* One dot per helper, in hire order: filled in its colour once done,
              hollow while it works. Counts at a glance; nothing to stretch. */}
          <Box flexDirection="row" gap="xs" flexShrink={0}>
            {roster.map(mate => (
              <Text key={`dot-${mate.id}`} size="footnote" color={mate.state === 'failed' ? '#FB7C7F' : mate.state === 'stopped' ? INK_3 : critterOf(mate.critter).color}>
                {mate.state === 'working' ? '○' : '●'}
              </Text>
            ))}
          </Box>
          <Text size="caption" mono dimColor>{tally}</Text>
        </Box>
      )
    }

    const width = Math.max(6, Math.min(30, (e.props.bodyColumns || 80) - 50))
    const filled = Math.round((done / helpers.length) * width)
    return (
      <Box flexDirection="row" gap={2}>
        <Text>{who}</Text>
        <Text color={critterOf('claude').color}>{'▰'.repeat(filled)}<Text dimColor>{'▱'.repeat(width - filled)}</Text></Text>
        <Text dimColor>{tally}</Text>
      </Box>
    )
  })
}
