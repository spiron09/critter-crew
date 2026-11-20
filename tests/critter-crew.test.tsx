import { expect, test } from 'claude-code/testing'

import { avatarSvg } from '../hooks/art'
import { describe as say, elapsed } from '../hooks/register'

const PANE = {
  plugin: 'critter-crew',
  component: 'Pane',
  requestId: 'crew',
  props: {
    title: 'Crew',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('tool calls read as plain words', () => {
  expect(say('Read', { file_path: '/a/b/register.tsx' })).toBe('reading register.tsx')
  expect(say('Bash', { command: 'npm test', description: 'Run the tests' })).toBe('run the tests')
  expect(say('Grep', { pattern: 'agent.spawn' })).toBe('searching for “agent.spawn”')
  expect(say('mcp__abc__firecrawl_search', {})).toBe('using firecrawl search')
  expect(elapsed(41_000)).toBe('0:41')
  expect(elapsed(134_000)).toBe('2:14')
})

test('avatars are text-free, fixed-size svg', () => {
  const a = {
    id: 'a1', parent: 'main', name: 'Bruno', critter: 'fox', role: 'explore', task: 'Find the API',
    doing: 'reading x.ts', state: 'working' as const, model: 'claude-haiku-5-5', startedAt: 0, endedAt: null,
    tools: 3, tokens: 12_400, context: 50_000, steps: [], report: '',
  }
  const svg = avatarSvg(a)
  expect(svg.startsWith('<svg')).toBe(true)
  expect(svg.includes('<text')).toBe(false)
  expect(svg.includes('width="56" height="56"')).toBe(true)
  expect(svg.includes('stroke-dasharray="')).toBe(true)
  expect(avatarSvg({ ...a, state: 'done' }).includes('class="zz"')).toBe(true)
  expect(avatarSvg(a, 24).includes('stroke-dasharray="')).toBe(false)
})

test('the board tracks who works on what, then who finished or failed', async ($, on) => {
  on('command.register', () => ({ value: { command: 'crew' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  let t = 1_000
  on('clock.now', () => ({ value: (t += 500) }))
  on('clock.every', () => ({ value: undefined }))
  on('clock.after', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => e)
  let spawned = 0
  on('agent.spawn', () => ({ model: 'haiku', agentId: `a${++spawned}` }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', () => ({ text: '' }))
  let killed = false
  on('agent.list', () => ({ value: killed ? [{ id: 'a3', status: 'killed', taskStatus: 'killed' }] : [] }) as never)

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'find the bug' } as never)
  await $.agent.spawn({ prompt: 'look', description: 'Find the subagent API', subagentType: 'Explore' } as never)
  await $.tool.call({ tool: 'Grep', pattern: 'agent.spawn', agentId: 'a1' } as never)

  const desk = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await desk.find({ type: 'Text', text: /bruno · explore · haiku/ })) !== undefined).toBe(true)
  expect((await desk.find({ type: 'Text', text: /Find the subagent API/ })) !== undefined).toBe(true)
  await desk.unmount()

  const band = await $.ui.mount({
    plugin: 'critter-crew', component: 'AbovePrompt', surface: 'desktop',
    props: { hasSurvey: false, isCollapsed: false, isWorking: true, maxRows: 3, bodyColumns: 100, scroll: { offset: 0, bodyRows: 3 }, view: {} },
  })
  expect((await band.find({ type: 'Text', text: /^Bruno/ })) !== undefined).toBe(true)
  expect((await band.find({ type: 'Text', text: /^0\/1$/ })) !== undefined).toBe(true)
  await band.unmount()

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^Bruno$/ })) !== undefined).toBe(true)
  expect((await ui.find({ type: 'Text', text: /Find the subagent API/ })) !== undefined).toBe(true)
  expect((await ui.find({ type: 'Text', text: /Searching for “agent.spawn”…/ })) !== undefined).toBe(true)
  await ui.unmount()

  // A second helper joins the same batch; a hand-back starts a new turn mid-batch.
  await $.agent.spawn({ prompt: 'try', description: 'Break something', subagentType: 'general-purpose' } as never)
  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'Found **agent.spawn** in the types.', durationMs: 1, isAborted: false, turnId: 't' } as never)

  // Details opens a finished helper's steps and report.
  const det = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await det.press({ key: 'd-a1' })
  expect((await det.find({ type: 'Text', text: /Activity · 1/ })) !== undefined).toBe(true)
  expect((await det.find({ type: 'Text', text: /Searching for “agent.spawn”/ })) !== undefined).toBe(true)
  expect((await det.find({ type: 'Markdown' })) !== undefined).toBe(true)
  await det.unmount()
  await $.prompt.submit({ text: 'helper reported back' } as never)

  const mid = await $.ui.mount({
    plugin: 'critter-crew', component: 'AbovePrompt', surface: 'desktop',
    props: { hasSurvey: false, isCollapsed: false, isWorking: true, maxRows: 3, bodyColumns: 100, scroll: { offset: 0, bodyRows: 3 }, view: {} },
  })
  expect((await mid.find({ type: 'Text', text: /^1\/2$/ })) !== undefined).toBe(true)
  await mid.unmount()

  await $.turn.complete({ agentId: 'a2', reason: 'error', answer: '', durationMs: 1, isAborted: false, turnId: 't2' } as never)

  const after = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await after.find({ type: 'Text', text: /Pounced on it in/ })) !== undefined).toBe(true)
  expect((await after.find({ type: 'Text', text: /Got stuck after/ })) !== undefined).toBe(true)
  await after.unmount()

  // A helper killed without its own turn.complete is closed from the engine's agent list.
  await $.agent.spawn({ prompt: 'x', description: 'Vanish quietly', subagentType: 'general-purpose' } as never)
  killed = true
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 't3' } as never)
  const last = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await last.find({ type: 'Text', text: /Vanish quietly/ })) !== undefined).toBe(true)
  expect((await last.find({ type: 'Text', text: /…$/ })) === undefined).toBe(true)
  await last.unmount()
})

test('a helper still waiting on background work stays working, then closes when it ends', async ($, on) => {
  on('command.register', () => ({ value: { command: 'crew' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  let t = 1_000
  on('clock.now', () => ({ value: (t += 500) }))
  on('clock.every', () => ({ value: undefined }))
  on('clock.after', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => e)
  on('turn.complete', () => ({ text: '' }))
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'w1' }))
  // The task record says completed as soon as the turn ends; the live status says waiting.
  let status = 'waiting'
  on('agent.list', () => ({ value: [{ id: 'w1', status, taskStatus: 'completed' }] }) as never)

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'watch the build' } as never)
  await $.agent.spawn({ prompt: 'watch', description: 'Watch the build', subagentType: 'general-purpose' } as never)
  await $.turn.complete({ agentId: 'w1', reason: 'answer', answer: 'watching', durationMs: 1, isAborted: false, turnId: 'w' } as never)

  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /Waiting on background work…/ })) !== undefined).toBe(true)
  expect((await ui.find({ type: 'Text', text: /Got stuck/ })) === undefined).toBe(true)
  await ui.unmount()

  // Once the engine says it has ended, the next check closes the card.
  status = 'completed'
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 'm' } as never)
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /Waiting on background work/ })) === undefined).toBe(true)
  await ui.unmount()
})
