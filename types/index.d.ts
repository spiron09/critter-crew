// working: on a turn, or waiting on background work it owns.
// resting: a teammate between turns, until a message wakes it.
// done / failed / stopped: ended (stopped = interrupted or killed, not an error).
export type AgentState = 'working' | 'idle' | 'resting' | 'done' | 'failed' | 'stopped'

export type Step = { at: number; what: string; ok: boolean | null; id?: string }

export type Agent = {
  id: string
  parent: string | null
  name: string
  critter: string
  role: string
  task: string
  doing: string
  state: AgentState
  model: string
  startedAt: number
  endedAt: number | null
  tools: number
  tokens: number
  context: number
  steps: Step[]
  report: string
}

export type Board = { agents: Agent[]; hired: number; tools: number }

declare module 'claude-code' {
  interface PluginState {
    'critter-crew': { board: Shaped<Board>; now: number; open: string[] }
  }
}
