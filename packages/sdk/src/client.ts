import { ForgeApiError, ForgeTransportError } from './errors'
import { type SSEFrameHandler, streamSSE } from './stream'
import type {
  ActiveSessionsResponse,
  AttachRequest,
  AttachResponse,
  AuthStatus,
  BroadcastRequest,
  CreateKeyRequest,
  CreateKeyResponse,

  BroadcastResponse,
  ConfigScope,
  ConfigSetRequest,
  ConfigValue,
  DetachResponse,
  ForgeErrorResponse,
  HealthResponse,
  OkResponse,
  PromptRequest,
  PromptResponse,
  ReadyResponse,
  ReplayRequest,
  ReplayResponse,
  SSEStats,
  Session,
  SessionCreateRequest,
  SessionEventsQuery,
  SessionListQuery,
  SessionPresence,
  SessionSearchQuery,
  ToolDefinition,
  ToolExecuteRequest,
  ToolExecuteResponse,
  ListKeysResponse,
  RevokeKeyResponse,
  UsageResponse,
} from './types'

export interface ForgeClientOptions {
  /** Base URL of the forge server (no trailing slash). */
  baseUrl: string
  /** Optional bearer token (sent as `Authorization: Bearer ...`). */
  token?: string
  /** Optional extra headers (added to every request). */
  headers?: Record<string, string>
  /** Request timeout in ms (default 30_000). */
  timeoutMs?: number
  /** Custom fetch implementation (used by tests). */
  fetchImpl?: typeof fetch
}

interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>
  body?: unknown
  signal?: AbortSignal
}

/**
 * Typed HTTP client for the Forge server. Generated from the OpenAPI 3.1
 * spec at `/api/openapi.json` (Phase 74). All methods are async and either
 * resolve with the typed payload or reject with a {@link ForgeApiError} /
 * {@link ForgeTransportError}.
 */
export class ForgeClient {
  readonly baseUrl: string
  readonly token?: string
  readonly defaultHeaders: Record<string, string>
  readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(options: ForgeClientOptions) {
    if (!options.baseUrl) {
      throw new ForgeTransportError('ForgeClient requires `baseUrl`')
    }
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.token = options.token
    this.defaultHeaders = {
      Accept: 'application/json',
      ...(options.headers ?? {}),
    }
    this.timeoutMs = options.timeoutMs ?? 30_000
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    if (typeof this.fetchImpl !== 'function') {
      throw new ForgeTransportError('No fetch implementation available')
    }
  }

  // ── System ───────────────────────────────────────────────────────

  /** Liveness probe (`GET /health`). */
  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('GET', '/health')
  }

  /** Readiness probe (`GET /health/ready`). */
  async ready(): Promise<ReadyResponse> {
    return this.request<ReadyResponse>('GET', '/health/ready')
  }

  /** Fetch the OpenAPI 3.1 spec (`GET /api/openapi.json`). */
  async openAPISpec(): Promise<unknown> {
    return this.request<unknown>('GET', '/api/openapi.json')
  }

  // ── Sessions ─────────────────────────────────────────────────────

  sessions = {
    list: (query: SessionListQuery = {}): Promise<Session[]> =>
      this.request<Session[]>('GET', '/api/sessions', { query: pickQuery(query) }),
    search: (query: SessionSearchQuery = {}): Promise<Session[]> =>
      this.request<Session[]>('GET', '/api/sessions/search', { query: pickQuery(query) }),
    get: (id: string): Promise<Session> =>
      this.request<Session>('GET', `/api/sessions/${encode(id)}`),
    create: (req: SessionCreateRequest): Promise<Session> =>
      this.request<Session>('POST', '/api/sessions', { body: req }),
    delete: (id: string): Promise<OkResponse> =>
      this.request<OkResponse>('DELETE', `/api/sessions/${encode(id)}`),
    events: (id: string, query: SessionEventsQuery = {}): Promise<unknown[]> =>
      this.request<unknown[]>('GET', `/api/sessions/${encode(id)}/events`, {
        query: pickQuery(query),
      }),
  }

  // ── Prompts ──────────────────────────────────────────────────────

  prompts = {
    /** Submit a prompt; runs the full agent loop synchronously. */
    submit: (sessionId: string, req: PromptRequest): Promise<PromptResponse> =>
      this.request<PromptResponse>('POST', `/api/prompts/${encode(sessionId)}`, { body: req }),
  }

  // ── Tools ────────────────────────────────────────────────────────

  tools = {
    list: (): Promise<ToolDefinition[]> => this.request<ToolDefinition[]>('GET', '/api/tools'),
    get: (name: string): Promise<ToolDefinition> =>
      this.request<ToolDefinition>('GET', `/api/tools/${encode(name)}`),
    execute: (req: ToolExecuteRequest): Promise<ToolExecuteResponse> =>
      this.request<ToolExecuteResponse>('POST', '/api/tools/execute', { body: req }),
  }

  // ── Config ───────────────────────────────────────────────────────

  configConfig = {
    all: (): Promise<Record<string, unknown>> =>
      this.request<Record<string, unknown>>('GET', '/api/config'),
    defaults: (): Promise<Record<string, unknown>> =>
      this.request<Record<string, unknown>>('GET', '/api/config/default'),
    get: (key: string): Promise<ConfigValue> =>
      this.request<ConfigValue>('GET', `/api/config/${encodeKey(key)}`),
    set: (req: ConfigSetRequest): Promise<ConfigValue> =>
      this.request<ConfigValue>('POST', '/api/config', {
        body: { key: req.key, value: req.value },
        query: req.scope ? { scope: req.scope } : undefined,
      }),
    delete: (key: string, scope?: ConfigScope): Promise<OkResponse> =>
      this.request<OkResponse>('DELETE', `/api/config/${encodeKey(key)}`, {
        query: scope ? { scope } : undefined,
      }),
  }

  // ── Auth ─────────────────────────────────────────────────────────

  auth = {
    status: (): Promise<AuthStatus> => this.request<AuthStatus>('GET', '/api/auth'),
    listKeys: (): Promise<ListKeysResponse> => this.request<ListKeysResponse>('GET', '/api/auth/keys'),
    createKey: (req: CreateKeyRequest): Promise<CreateKeyResponse> =>
      this.request<CreateKeyResponse>('POST', '/api/auth/keys', { body: req }),
    revokeKey: (id: string): Promise<RevokeKeyResponse> =>
      this.request<RevokeKeyResponse>('DELETE', '/api/auth/keys/' + encode(id)),
    usage: (): Promise<UsageResponse> => this.request<UsageResponse>('GET', '/api/auth/keys/usage'),
  }

  // ── SSE ──────────────────────────────────────────────────────────

  sse = {
    stats: (): Promise<SSEStats> => this.request<SSEStats>('GET', '/api/sse/stats'),
    broadcast: (req: BroadcastRequest): Promise<BroadcastResponse> =>
      this.request<BroadcastResponse>('POST', '/api/sse/broadcast', { body: req }),
    /**
     * Open a typed SSE stream. Yields parsed frames until the caller breaks
     * (or the server closes). Each frame carries the event name and the raw
     * payload (parsed if JSON).
     */
    stream: (
      opts: { sessionIds?: string[]; signal?: AbortSignal; handler?: SSEFrameHandler } = {},
    ) =>
      streamSSE(this.baseUrl, {
        sessionIds: opts.sessionIds,
        signal: opts.signal,
        headers: this.authHeader(),
        fetchImpl: this.fetchImpl,
        handler: opts.handler,
      }),

    // ── Phase 78: multi-client session attach ────────────────────

    /** Attach an open stream (by its `clientId`) to another session. */
    attach: (sessionId: string, req: AttachRequest): Promise<AttachResponse> =>
      this.request<AttachResponse>('POST', `/api/sse/sessions/${encode(sessionId)}/attach`, { body: req }),
    /** Drop a session from an open stream. */
    detach: (sessionId: string, req: AttachRequest): Promise<DetachResponse> =>
      this.request<DetachResponse>('POST', `/api/sse/sessions/${encode(sessionId)}/detach`, { body: req }),
    /** Clients currently watching a session. */
    presence: (sessionId: string): Promise<SessionPresence> =>
      this.request<SessionPresence>('GET', `/api/sse/sessions/${encode(sessionId)}/presence`),
    /** All sessions with at least one attached client. */
    activeSessions: (): Promise<ActiveSessionsResponse> =>
      this.request<ActiveSessionsResponse>('GET', '/api/sse/sessions'),
    /** Replay recent session events to every attached client. */
    replay: (req: ReplayRequest): Promise<ReplayResponse> =>
      this.request<ReplayResponse>('POST', '/api/sse/replay', { body: req }),
  }

  // ── HTTP core ────────────────────────────────────────────────────

  private async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const url = new URL(stripLeadingSlash(path), `${this.baseUrl}/`)
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v === undefined || v === null) continue
        url.searchParams.set(k, String(v))
      }
    }

    const headers: Record<string, string> = { ...this.defaultHeaders, ...this.authHeader() }
    let body: string | undefined
    if (opts.body !== undefined) {
      headers['Content-Type'] = headers['Content-Type'] ?? 'application/json'
      body = JSON.stringify(opts.body)
    }

    const timeoutSignal = AbortSignal.timeout(this.timeoutMs)
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeoutSignal]) : timeoutSignal

    let res: Response
    try {
      res = await this.fetchImpl(url.toString(), {
        method,
        headers,
        body,
        signal,
      })
    } catch (err) {
      throw new ForgeTransportError(
        err instanceof Error ? err.message : 'Network request failed',
        err,
      )
    }

    if (!res.ok) {
      let parsed: ForgeErrorResponse | undefined
      try {
        parsed = (await res.json()) as ForgeErrorResponse
      } catch {
        throw new ForgeApiError(res.status, {
          error: { code: 'UNKNOWN_ERROR', message: res.statusText || 'Request failed' },
        })
      }
      throw new ForgeApiError(res.status, parsed)
    }

    if (res.status === 204) return undefined as T
    const ct = res.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) {
      return (await res.json()) as T
    }
    return (await res.text()) as unknown as T
  }

  private authHeader(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {}
  }
}

function pickQuery(q: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null) continue
    out[k] = typeof v === 'boolean' || typeof v === 'number' ? v : String(v)
  }
  return out
}

function stripLeadingSlash(p: string): string {
  return p.startsWith('/') ? p.slice(1) : p
}

function encode(segment: string): string {
  return encodeURIComponent(segment)
}

function encodeKey(key: string): string {
  // Config keys may be dotted paths ("theme.colors") — encode each segment
  // independently so the dot survives.
  return key
    .split('.')
    .map((s) => encodeURIComponent(s))
    .join('.')
}
