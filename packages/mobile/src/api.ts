/**
 * Server-bound API layer for the mobile companion app (Phase 155).
 *
 * Mirrors the Phase 141 VS Code client: plain fetch (RN ships fetch),
 * type-only imports from @forge/sdk so the wire contract is single-sourced,
 * and result-shaped returns so no screen needs try/catch.
 */

import type { HealthResponse, PromptResponse, Session } from '@forge/sdk'

export interface MobileApiOptions {
  /** Base URL of the forge server (no trailing slash required). */
  baseUrl: string
  /** Optional bearer token (`forge auth create`). */
  token?: string
  /** Custom fetch implementation (used by tests). */
  fetchImpl?: typeof fetch
  /** Request timeout in ms (default 10s — mobile networks are slow). */
  timeoutMs?: number
}

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: string }

export interface ConnectInfo {
  status?: string
  version?: string
  uptime?: number
}

type JsonRecord = Record<string, unknown>

function isTimeout(signal: AbortSignal | undefined, error: unknown): boolean {
  if (signal?.reason instanceof Error && signal.reason.name === 'TimeoutError') return true
  return error instanceof Error && error.name === 'TimeoutError'
}

export class ForgeMobileApi {
  readonly baseUrl: string
  readonly token: string | undefined
  readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(options: MobileApiOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.token = options.token
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<ApiResult<T>> {
    const signal = AbortSignal.timeout(this.timeoutMs)
    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        signal,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(this.token !== undefined && this.token.length > 0
            ? { Authorization: `Bearer ${this.token}` }
            : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      })
    } catch (error) {
      if (isTimeout(signal, error)) return { ok: false, error: 'request timed out' }
      const detail = error instanceof Error ? error.message : String(error)
      return { ok: false, error: `cannot reach forge server at ${this.baseUrl}: ${detail}` }
    }
    if (!response.ok) {
      let detail = ''
      try {
        const parsed = (await response.json()) as { error?: { message?: unknown } }
        const message = parsed.error?.message
        if (typeof message === 'string') detail = `: ${message}`
      } catch {
        // non-JSON error body — status alone is the message
      }
      return { ok: false, error: `forge server error [${response.status}]${detail}` }
    }
    try {
      return { ok: true, value: (await response.json()) as T }
    } catch (error) {
      return {
        ok: false,
        error: `invalid JSON from forge server: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  /** Probe the server (GET /health). */
  async connect(): Promise<ApiResult<ConnectInfo>> {
    const result = await this.request<HealthResponse>('GET', '/health')
    if (!result.ok) return result
    return {
      ok: true,
      value: {
        status: result.value.status,
        version: result.value.version,
        uptime: result.value.uptime,
      },
    }
  }

  /** List sessions (GET /api/sessions). */
  async listSessions(): Promise<ApiResult<Session[]>> {
    return this.request<Session[]>('GET', '/api/sessions')
  }

  /** Read a session's event log (GET /api/sessions/:id/events). */
  async listEvents(sessionId: string): Promise<ApiResult<Array<JsonRecord>>> {
    return this.request<Array<JsonRecord>>(
      'GET',
      `/api/sessions/${encodeURIComponent(sessionId)}/events`,
    )
  }

  /**
   * Send a prompt, creating the session lazily. `cwd` is required by the
   * server on session creation — a placeholder keeps the phone-side simple.
   */
  async sendPrompt(
    prompt: string,
    options?: { sessionId?: string; cwd?: string },
  ): Promise<ApiResult<{ sessionId: string; response: string; turns: number }>> {
    const text = prompt.trim()
    if (text.length === 0) return { ok: false, error: 'empty prompt' }
    const sessionId = options?.sessionId
    if (sessionId !== undefined && sessionId !== '') {
      return this.postPrompt(sessionId, text)
    }
    const created = await this.request<Session>('POST', '/api/sessions', {
      cwd: options?.cwd ?? '~',
    })
    if (!created.ok) return created
    return this.postPrompt(created.value.id, text)
  }

  private async postPrompt(
    sessionId: string,
    text: string,
  ): Promise<ApiResult<{ sessionId: string; response: string; turns: number }>> {
    const result = await this.request<PromptResponse>(
      'POST',
      `/api/prompts/${encodeURIComponent(sessionId)}`,
      { prompt: text },
    )
    if (!result.ok) return result
    if (result.value.reason === 'error') {
      return { ok: false, error: result.value.error ?? 'agent loop failed' }
    }
    return {
      ok: true,
      value: {
        sessionId: result.value.sessionId,
        response: result.value.response,
        turns: result.value.turns,
      },
    }
  }
}
