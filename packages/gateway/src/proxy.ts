import type { KillSwitch } from './killswitch'
import { type ResolvedUpstream, type Route, RouterError, type UpstreamResolver } from './router'

export interface ChatCompletionBody {
  model?: unknown
  stream?: unknown
  [key: string]: unknown
}

export interface UsageAdd {
  tokens: number
  costUsd?: number
}

export interface RelayDeps {
  /** Skip candidates whose upstream key is hard-disabled */
  killSwitch?: KillSwitch
  /** Called after a non-stream response with usage parsed from the payload */
  onUsage?: (usage: UsageAdd) => void
  /** Per-token cost table ($/1M tokens) used to estimate costUsd */
  costRatio?: { inputPerM: number; outputPerM: number }
}

export interface UsageInfo {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export function parseUsage(payload: unknown): UsageInfo | null {
  if (!payload || typeof payload !== 'object') return null
  const usage = (
    payload as {
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    }
  ).usage
  if (!usage || typeof usage !== 'object') return null
  const promptTokens = usage.prompt_tokens ?? 0
  const completionTokens = usage.completion_tokens ?? 0
  return {
    promptTokens,
    completionTokens,
    totalTokens: usage.total_tokens ?? promptTokens + completionTokens,
  }
}

export function jsonError(message: string, type: string, status: number): Response {
  return new Response(JSON.stringify({ error: { message, type } }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function joinURL(baseURL: string, path: string): string {
  return `${baseURL.replace(/\/+$/, '')}${path}`
}

export function parseBody(text: string): ChatCompletionBody | null {
  try {
    return JSON.parse(text) as ChatCompletionBody
  } catch {
    return null
  }
}

function applyAuth(headers: Record<string, string>, upstream: ResolvedUpstream): void {
  if (upstream.apiKey) headers.authorization = `Bearer ${upstream.apiKey}`
}

function outboundHeaders(upstream: ResolvedUpstream): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  applyAuth(headers, upstream)
  if (upstream.headers) {
    for (const [key, value] of Object.entries(upstream.headers)) headers[key] = value
  }
  return headers
}

async function forward(
  baseURL: string,
  headers: Record<string, string>,
  rawBody: string,
): Promise<Response> {
  return fetch(joinURL(baseURL, '/chat/completions'), {
    method: 'POST',
    headers,
    body: rawBody,
  })
}

function rewrittenPayload(rawBody: string, outboundModel: string): string {
  if (outboundModel === undefined) return rawBody
  const body = parseBody(rawBody)
  if (!body || typeof body.model !== 'string') return rawBody
  try {
    return JSON.stringify({ ...body, model: outboundModel })
  } catch {
    return rawBody
  }
}

/**
 * Relay a `/chat/completions` request to the routed upstream. Streaming
 * (`stream: true`) passes upstream SSE through untouched so tool_call chunks
 * and reasoning blocks arrive verbatim. On a 5xx, deterministic alternates in
 * route order are tried before giving up. Hard-disabled upstreams (kill
 * switch) are skipped. Usage from non-stream responses is reported to
 * `onUsage` for quota accounting.
 */
export async function relayChatCompletion(
  resolver: UpstreamResolver,
  rawBody: string,
  deps: RelayDeps = {},
): Promise<Response> {
  const body = parseBody(rawBody)
  if (!body) return jsonError('Invalid JSON body', 'invalid_request_error', 400)

  if (typeof body.model !== 'string' || body.model.length === 0) {
    return jsonError('model is required', 'invalid_request_error', 400)
  }
  if (typeof body.stream !== 'boolean' && body.stream !== undefined) {
    return jsonError('stream must be a boolean', 'invalid_request_error', 400)
  }

  let route: Route
  try {
    route = resolver.resolve(body.model)
  } catch (err) {
    if (err instanceof RouterError) {
      return jsonError(err.message, 'invalid_request_error', err.status)
    }
    throw err
  }

  const payload = rewrittenPayload(rawBody, route.outboundModel)
  const candidates = [route.upstream, ...route.alternates].filter(
    (candidate) => !deps.killSwitch?.isDisabled(candidate.baseURL),
  )
  if (candidates.length === 0) {
    return jsonError('All upstreams for this model are disabled', 'upstream_disabled', 502)
  }

  let resp: Response | null = null
  let lastError: unknown = null
  for (const candidate of candidates) {
    const headers = outboundHeaders(candidate)
    try {
      const attempt = await forward(candidate.baseURL, headers, payload)
      if (!attempt.ok && attempt.status >= 500 && attempt.status < 600) {
        lastError = new Error(`upstream returned ${attempt.status}`)
        continue
      }
      resp = attempt
      break
    } catch (err) {
      lastError = err
    }
  }

  if (!resp) {
    const reason = lastError instanceof Error ? lastError.message : String(lastError)
    return jsonError(`Upstream unreachable: ${reason}`, 'upstream_error', 502)
  }

  if (!resp.ok) {
    const text = await resp.text()
    return new Response(text, {
      status: resp.status,
      headers: { 'content-type': resp.headers.get('content-type') ?? 'application/json' },
    })
  }

  if (body.stream === true) {
    // Streaming usage lands on the final `[DONE]` chunk; capturing it would
    // require teeing the SSE stream. Phase 31 pre-request quota plus the
    // per-minute rate limit bound streaming abuse; non-stream charges exactly.
    return new Response(resp.body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })
  }

  const text = await resp.text()
  if (deps.onUsage) {
    const usage = parseUsage(parseBody(text))
    if (usage) {
      const costPerM = deps.costRatio ?? { inputPerM: 0, outputPerM: 0 }
      const costUsd =
        (usage.promptTokens / 1_000_000) * costPerM.inputPerM +
        (usage.completionTokens / 1_000_000) * costPerM.outputPerM
      deps.onUsage({ tokens: usage.totalTokens, costUsd })
    }
  }
  return new Response(text, {
    status: 200,
    headers: { 'content-type': resp.headers.get('content-type') ?? 'application/json' },
  })
}
