import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

// Every way an agent's run can go, as the engine documents it, and what the
// board must show for each. Each test drives the engine's events by hand.

const PANE = {
  plugin: 'critter-crew',
  component: 'Pane',
  requestId: 'crew',
  props: {
    title: 'Crew',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const BAND = {
  plugin: 'critter-crew',
  component: 'AbovePrompt',
  surface: 'desktop',
  props: { hasSurvey: false, isCollapsed: false, isWorking: true, maxRows: 3, bodyColumns: 100, scroll: { offset: 0, bodyRows: 3 }, view: {} },
} as const

type Listed = { id: string; status: string; taskStatus?: string; type?: string; description?: string; name?: string }

// The engine beneath the mod: a clock the test can move, spawns that hand out
// ids (or reuse one for a resume), and an agent list the test controls.
function engine(on: On, opts: { frozenClock?: boolean; failCall?: number } = {}) {
  const world = { now: 1_000, listed: [] as Listed[], nextId: 0 }
  let call = 0
  on('command.register', () => ({ value: { command: 'crew' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.now', () => ({ value: opts.frozenClock ? world.now : (world.now += 100) }))
  on('clock.every', () => ({ value: undefined }))
  on('clock.after', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => e)
  on('turn.start', (_, e) => e)
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', () => (++call === opts.failCall ? { result: {}, isError: true as const } : { result: {} }))
  on('agent.spawn', (_, e) => ({ model: 'haiku', agentId: (e as { resume?: { agentId: string } }).resume?.agentId ?? `h${++world.nextId}` }))
  on('agent.list', () => ({ value: world.listed.map(l => ({ taskStatus: 'running', type: 'general-purpose', description: '', ...l })) }) as never)
  return world
}

const end = (agentId: string | undefined, reason: string) =>
  ({ ...(agentId ? { agentId } : {}), reason, answer: 'report', durationMs: 1, isAborted: reason === 'aborted', turnId: 't' }) as never

async function has($: Engine, re: RegExp, surface: 'terminal' | 'desktop' = 'terminal') {
  const ui = await $.ui.mount({ ...PANE, surface })
  const found = (await ui.find({ type: 'Text', text: re })) !== undefined
  await ui.unmount()
  return found
}

async function start($: Engine) {
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'go' } as never)
}

test('waiting on a plan approval or background work: still working', async ($, on) => {
  const w = engine(on)
  await start($)
  await $.agent.spawn({ prompt: 'p', description: 'Plan the migration', subagentType: 'Plan' } as never)
  w.listed = [{ id: 'h1', status: 'waiting', taskStatus: 'completed' }]
  await $.turn.complete(end('h1', 'answer'))
  expect(await has($, /Waiting on background work…/)).toBe(true)
})

test('a teammate between turns rests, and is left out of the band count', async ($, on) => {
  const w = engine(on)
  await start($)
  await $.agent.spawn({ prompt: 'a', description: 'Review the API', subagentType: 'general-purpose' } as never)
  await $.agent.spawn({ prompt: 'b', description: 'Be on call', subagentType: 'general-purpose', name: 'scout' } as never)
  w.listed = [{ id: 'h2', status: 'idle' }]
  await $.turn.complete(end('h2', 'answer'))
  expect(await has($, /Resting until it gets a message/)).toBe(true)
  const band = await $.ui.mount(BAND)
  expect((await band.find({ type: 'Text', text: /^0\/1$/ })) !== undefined).toBe(true)
  await band.unmount()
  // A message wakes it: it gets back to work.
  w.listed = [{ id: 'h2', status: 'running' }]
  await $.tool.call({ tool: 'Read', file_path: '/x/inbox.md', agentId: 'h2', tool_use_id: 'w1' } as never)
  expect(await has($, /Resting until/)).toBe(false)
})

test('a resumed helper wakes its own card, same name, no new card', async ($, on) => {
  const w = engine(on)
  await start($)
  await $.agent.spawn({ prompt: 'a', description: 'Find the bug', subagentType: 'general-purpose' } as never)
  await $.turn.complete(end('h1', 'answer'))
  expect(await has($, /Pounced on it in/)).toBe(true)
  w.listed = [{ id: 'h1', status: 'running' }]
  await $.agent.spawn({ prompt: 'more', description: 'Find the bug', subagentType: 'general-purpose', resume: { agentId: 'h1' } } as never)
  expect(await has($, /Picking up where it left off…/)).toBe(true)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.findAll({ type: 'Text', text: /^Bruno$/ })).length).toBe(1)
  expect((await ui.findAll({ type: 'Text', text: /^Miso$/ })).length).toBe(0)
  await ui.unmount()
})

test('interrupted or killed reads as stopped, not as stuck', async ($, on) => {
  const w = engine(on)
  await start($)
  await $.agent.spawn({ prompt: 'a', description: 'Long scan', subagentType: 'general-purpose' } as never)
  await $.agent.spawn({ prompt: 'b', description: 'Other scan', subagentType: 'general-purpose' } as never)
  await $.turn.complete(end('h1', 'aborted'))
  expect(await has($, /Stopped after/)).toBe(true)
  // Killed with no turn of its own ending: the agent list says so.
  w.listed = [{ id: 'h2', status: 'killed' }]
  await $.turn.complete(end(undefined, 'answer'))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.findAll({ type: 'Text', text: /Stopped after/ })).length).toBe(2)
  expect((await ui.findAll({ type: 'Text', text: /Got stuck/ })).length).toBe(0)
  await ui.unmount()
})

test('an error or a refusal is a failure', async ($, on) => {
  engine(on)
  await start($)
  await $.agent.spawn({ prompt: 'a', description: 'Risky job', subagentType: 'general-purpose' } as never)
  await $.turn.complete(end('h1', 'error'))
  expect(await has($, /Got stuck after/)).toBe(true)
})

test('a helper the board never saw start is adopted from the agent list', async ($, on) => {
  const w = engine(on)
  await start($)
  w.listed = [{ id: 'early', status: 'running', description: 'Started before the mod', type: 'Explore' }]
  await $.tool.call({ tool: 'Read', file_path: '/x/notes.md', agentId: 'early', tool_use_id: 'u1' } as never)
  expect(await has($, /Started before the mod/)).toBe(true)
  expect(await has($, /Reading notes\.md…/)).toBe(true)
  // An id the engine doesn't list (a workflow's agent) gets no card.
  await $.tool.call({ tool: 'Read', file_path: '/x/a.md', agentId: 'ghost', tool_use_id: 'u2' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.findAll({ type: 'Text', text: /Reading a\.md/ })).length).toBe(0)
  await ui.unmount()
})

test('a working card nothing can account for is let go after ten quiet minutes', async ($, on) => {
  const w = engine(on)
  await start($)
  await $.agent.spawn({ prompt: 'a', description: 'Remote job', subagentType: 'general-purpose' } as never)
  w.now += 11 * 60_000
  await $.turn.complete(end(undefined, 'answer'))
  expect(await has($, /Stopped after/)).toBe(true)
})

test('steps pair with their own result even in the same millisecond', async ($, on) => {
  engine(on, { frozenClock: true, failCall: 2 }) // every step at one instant; the second fails
  await start($)
  await $.agent.spawn({ prompt: 'a', description: 'Two reads', subagentType: 'general-purpose' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/x/one.md', agentId: 'h1', tool_use_id: 'a' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/x/two.md', agentId: 'h1', tool_use_id: 'b' } as never)
  await $.turn.complete(end('h1', 'answer'))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'd-h1' })
  expect((await ui.find({ type: 'Text', text: /Reading two\.md · failed/ })) !== undefined).toBe(true)
  expect((await ui.find({ type: 'Text', text: /Reading one\.md · failed/ })) === undefined).toBe(true)
  await ui.unmount()
})

test('names stay unique past the roster', async ($, on) => {
  engine(on)
  await start($)
  for (let i = 0; i < 13; i++) {
    await $.agent.spawn({ prompt: 'x', description: `Job ${i}`, subagentType: 'general-purpose' } as never)
  }
  expect(await has($, /^Bruno 2$/)).toBe(true)
})
