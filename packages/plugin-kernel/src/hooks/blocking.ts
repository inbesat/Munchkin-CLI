/**
 * Blocking hook semantics (Phase 105): a blocking hook that rejects an
 * action (exit code 2 for command hooks) prevents the action and turns
 * stderr/its reason into feedback for the LLM, so the agent can adjust its
 * approach. Blueprint example: "never edit .env files" = a PreToolUse hook
 * blocking Write calls that target `.env`.
 */
import type { HookEmitResult } from './engine'
import type { HookEventName } from './events'
import { type CommandHookOptions, commandHook } from './handlers/command'

export interface PolicyDecision {
  allowed: boolean
  /** LLM-facing feedback when blocked; null when allowed. */
  feedback: string | null
}

/**
 * Map an emit result into LLM-facing feedback. Returns null when the action
 * was allowed; otherwise a string like:
 * `[BLOCKED by hook 'name' during PreToolUse] reason — adjust your approach.`
 */
export function feedbackFrom(result: HookEmitResult, eventName: HookEventName): string | null {
  if (!result.blocked) return null
  const parts = [`[BLOCKED during ${eventName} hook]`]
  const entry = result.results.find((r) => r.blocked === true)
  const hookName = entry?.name !== undefined ? ` by hook '${entry.name}'` : ''
  parts[0] = `[BLOCKED${hookName} during ${eventName} hook]`
  parts.push(entry?.reason ?? result.reason ?? 'policy violation')
  parts.push('— adjust your approach.')
  return parts.join(' ')
}

export interface PolicyGate {
  /** Run all registered blocking hooks for the event; returns the decision. */
  evaluate(payload: unknown): Promise<PolicyDecision>
}

/** Wrap the engine with a boolean-decision + feedback gate for one event. */
export function createPolicyGate(
  engine: {
    emit(event: HookEventName, payload: unknown): Promise<HookEmitResult>
  },
  eventName: HookEventName,
): PolicyGate {
  return {
    async evaluate(payload: unknown): Promise<PolicyDecision> {
      const result = await engine.emit(eventName, payload)
      const feedback = feedbackFrom(result, eventName)
      return { allowed: !result.blocked, feedback }
    },
  }
}

export interface ToolPolicyOptions extends Omit<CommandHookOptions, 'cwd'> {
  /** Only apply to this tool name (e.g. 'write'). */
  matchToolName?: string
  /** stdin JSON whose `args.path` must match this substring. */
  matchPath?: string
  cwd?: string
}

/**
 * Blueprint example made real: register a command-based PreToolUse policy
 * that blocks matching tool calls (e.g. Write on `.env` files). Handlers
 * short-circuit to undefined for non-matching tools so the command only
 * sees relevant events.
 */
export function registerToolPolicy(
  engine: {
    on(
      event: HookEventName,
      handler: (payload: Record<string, unknown>) => unknown,
      options?: { priority?: number },
    ): () => void
  },
  options: ToolPolicyOptions,
): () => void {
  const handler = commandHook({
    command: options.command,
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
    runner: options.runner,
  })
  return engine.on(
    'PreToolUse',
    (payload: Record<string, unknown>) => {
      const toolName = typeof payload.toolName === 'string' ? payload.toolName : undefined
      if (options.matchToolName !== undefined && toolName !== options.matchToolName) {
        return undefined
      }
      if (options.matchPath !== undefined) {
        const args = payload.args as { path?: string } | undefined
        const path = typeof args?.path === 'string' ? args.path : ''
        if (!path.includes(options.matchPath)) return undefined
      }
      return handler(payload)
    },
    { priority: -10 },
  )
}
