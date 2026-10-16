/**
 * Forge chat client for the VS Code extension (Phase 141).
 *
 * Uses plain fetch rather than the @forge/sdk client: the SDK compiles to
 * ESM while the VS Code extension host loads CommonJS, so requiring it at
 * runtime would fail. The SDK's response types are imported type-only, which
 * keeps the wire contract single-sourced and is erased at compile time.
 */

import type { PromptResponse, Session } from '@forge/sdk'

export interface ChatSessionOptions {
  /** Base URL of the forge server (no trailing slash required). */
  baseUrl: string
  /** Working directory recorded on the session. */
  cwd: string
  /** Optional bearer token. */
  token?: string
  /** Optional model override. */
  model?: string
  /** Custom fetch implementation (used by tests). */
  fetchImpl?: typeof fetch
}

export type ChatResult =
  | { ok: true; sessionId: string; response: string; turns: number }
  | { ok: false; error: string }

export class ForgeChatSession {
  private readonly baseUrl: string
  private readonly cwd: string
  private readonly token: string | undefined
  private readonly model: string | undefined
  private readonly fetchImpl: typeof fetch
  private sessionId: string | undefined

  constructor(options: ChatSessionOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.cwd = options.cwd
    this.token = options.token
    this.model = options.model
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
  }

  get currentSessionId(): string | undefined {
    return this.sessionId
  }

  /** Send a prompt through the server; creates one session lazily. Never throws. */
  async sendPrompt(prompt: string): Promise<ChatResult> {
    const text = prompt.trim()
    if (text.length === 0) return { ok: false, error: 'empty prompt' }
    try {
      const sessionId = await this.ensureSession()
      const result = await this.post<PromptResponse>(
        `/api/prompts/${encodeURIComponent(sessionId)}`,
        {
          prompt: text,
        },
      )
      if (result.reason === 'error') {
        return { ok: false, error: result.error ?? 'agent loop failed' }
      }
      return {
        ok: true,
        sessionId: result.sessionId,
        response: result.response,
        turns: result.turns,
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  private async ensureSession(): Promise<string> {
    if (this.sessionId !== undefined) return this.sessionId
    const session = await this.post<Session>('/api/sessions', {
      cwd: this.cwd,
      ...(this.model !== undefined && this.model.length > 0 ? { model: this.model } : {}),
    })
    this.sessionId = session.id
    return session.id
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(this.token !== undefined && this.token.length > 0
            ? { Authorization: `Bearer ${this.token}` }
            : {}),
        },
        body: JSON.stringify(body),
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`cannot reach forge server at ${this.baseUrl}: ${detail}`)
    }
    if (!response.ok) {
      throw new Error(`forge server error [${response.status}]${await errorDetail(response)}`)
    }
    return (await response.json()) as T
  }
}

async function errorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: unknown } }
    const message = body.error?.message
    return typeof message === 'string' ? `: ${message}` : ''
  } catch {
    return ''
  }
}
