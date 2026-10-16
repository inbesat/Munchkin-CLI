import type { HookOutcome } from '../engine'

/**
 * `prompt` hook handler (Phase 104): a single-turn LLM call that reviews the
 * event payload. Blocking convention: output starting with `BLOCK:` blocks
 * with the remainder as the reason.
 */
export interface PromptHookOptions {
  /** Single-turn generator (injected: the composition root supplies an ai Model). */
  generate: (prompt: string) => Promise<string>
  maxOutputChars?: number
}

export function promptHook(options: PromptHookOptions): (payload: unknown) => Promise<HookOutcome> {
  return async (payload) => {
    let review: string
    try {
      review = await options.generate(
        `Review this event payload for policy violations.\nRespond "OK" if allowed, or "BLOCK: <reason>" to prevent it.\n\n${JSON.stringify(payload)}`,
      )
    } catch (error) {
      // Generator failure = cannot verify → fail closed.
      return {
        block: true,
        reason: error instanceof Error ? error.message : String(error),
      }
    }
    const output = review.slice(0, options.maxOutputChars ?? 4000).trim()
    if (output.startsWith('BLOCK:')) return { block: true, reason: output.slice(6).trim() }
    return undefined
  }
}
