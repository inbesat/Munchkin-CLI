import type { HookOutcome } from '../engine'

/**
 * `agent` hook handler (Phase 104): spawn a subagent to evaluate the event.
 * Blocking convention: the subagent's final summary starting with `BLOCK:`
 * blocks with the remainder as the reason. The spawner is injected at the
 * composition root (core's spawnSubagent satisfies it); the handler logic
 * here is complete.
 */
export interface AgentHookOptions {
  spawner: (task: string, signal?: AbortSignal) => Promise<string>
  timeoutMs?: number
}

export function agentHook(options: AgentHookOptions): (payload: unknown) => Promise<HookOutcome> {
  return async (payload) => {
    const task = `Evaluate this event for policy violations.\nRespond OK, or "BLOCK: <reason>" to prevent it.\n\n${JSON.stringify(payload)}`
    let summary: string
    try {
      summary = await options.spawner(task)
    } catch (error) {
      // Spawner failure = cannot evaluate → fail closed.
      return {
        block: true,
        reason: error instanceof Error ? error.message : String(error),
      }
    }
    if (summary.startsWith('BLOCK:')) return { block: true, reason: summary.slice(6).trim() }
    return undefined
  }
}
