export type AgentState = 'working' | 'idle' | 'done' | 'failed'

export type Step = { at: number; what: string; ok: boolean | null }

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
