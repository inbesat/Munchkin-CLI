import type { HookOutcome } from '../engine'

/**
 * `http` hook handler (Phase 104): POST the event payload as JSON.
 * Blocking convention: 403 blocks with the response body as reason;
 * 2xx observes; other statuses are error results.
 */
export interface HttpHookOptions {
  url: string
  timeoutMs?: number
  headers?: Record<string, string>
  /** Injectable fetch for offline tests; defaults to global fetch. */
  fetchImpl?: typeof fetch
}

export function httpHook(options: HttpHookOptions): (payload: unknown) => Promise<HookOutcome> {
  const fetchImpl = options.fetchImpl ?? fetch
  return async (payload) => {
    try {
      const response = await fetchImpl(options.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
        body: JSON.stringify(payload),
        signal: options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined,
      })
      if (response.status === 403) {
        return { block: true, reason: (await response.text()).trim() || 'blocked by http hook' }
      }
      if (response.ok) return undefined
      return undefined
    } catch (error) {
      return {
        block: true,
        reason: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
