/**
 * Hook engine (Phase 103): pub/sub that fires registered handlers at
 * lifecycle events. Handlers run in priority order (ascending); a BLOCKING
 * handler may prevent the default action (and stops later handlers); a
 * non-blocking one observes only. Handler failures are captured as failed
 * results — emitting never throws to the caller.
 */
import { type GenericHookPayload, type HookEventName, LIFECYCLE_EVENTS } from './events'

/** Sentinel helper: block the default action with a reason. */
export function BLOCK(reason: string): { block: true; reason: string } {
  return { block: true, reason }
}

export type HookOutcome = undefined | { block: true; reason: string }

export interface HookRegistration {
  priority?: number
  /** Blocking handlers may block (default true). */
  blocking?: boolean
  name?: string
}

interface RegisteredHandler {
  id: number
  name?: string
  priority: number
  blocking: boolean
  handler: (payload: GenericHookPayload) => HookOutcome | Promise<HookOutcome>
}

export interface HookResultEntry {
  name?: string
  ok: boolean
  blocked?: boolean
  reason?: string
  error?: string
}

export interface HookEmitResult {
  blocked: boolean
  reason?: string
  results: readonly HookResultEntry[]
}

export class HookEngine {
  private handlers = new Map<HookEventName, RegisteredHandler[]>()
  private counter = 0

  /** Register a handler; returns an unsubscribe function. */
  on(
    event: HookEventName,
    handler: (payload: GenericHookPayload) => HookOutcome | Promise<HookOutcome>,
    options: HookRegistration = {},
  ): () => void {
    this.counter += 1
    const registered: RegisteredHandler = {
      id: this.counter,
      name: options.name,
      priority: options.priority ?? 0,
      blocking: options.blocking ?? true,
      handler,
    }
    const list = this.handlers.get(event) ?? []
    list.push(registered)
    this.handlers.set(event, list)
    return () => {
      const list = this.handlers.get(event)
      if (list === undefined) return
      const index = list.findIndex((h) => h.id === registered.id)
      if (index >= 0) list.splice(index, 1)
    }
  }

  /** Emit an event: run matching handlers in priority order. Never throws. */
  async emit(event: HookEventName, payload: GenericHookPayload = {}): Promise<HookEmitResult> {
    const list = [...(this.handlers.get(event) ?? [])].sort((a, b) => a.priority - b.priority)
    const results: HookResultEntry[] = []
    for (const registered of list) {
      try {
        const outcome = await registered.handler(payload)
        if (outcome !== undefined && outcome !== null && outcome.block === true) {
          if (registered.blocking) {
            results.push({
              name: registered.name,
              ok: true,
              blocked: true,
              reason: outcome.reason,
            })
            return { blocked: true, reason: outcome.reason, results }
          }
          results.push({
            name: registered.name,
            ok: true,
            blocked: false,
            reason: 'non-blocking hook cannot block',
          })
          continue
        }
        results.push({ name: registered.name, ok: true })
      } catch (error) {
        results.push({
          name: registered.name,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return { blocked: false, results }
  }

  /** Names of events that currently have handlers (introspection). */
  coveredEvents(): HookEventName[] {
    return LIFECYCLE_EVENTS.filter((event) => (this.handlers.get(event)?.length ?? 0) > 0)
  }

  /** Remove all handlers. */
  reset(): void {
    this.handlers.clear()
  }
}
