export interface Upstream {
  /** Base URL of the upstream OpenAI-compatible API, e.g. `https://api.groq.com/openai/v1` */
  baseURL: string
  /** Static bearer token, or resolve lazily from an env var name */
  apiKey?: string
  apiKeyEnv?: string
  /** Extra headers applied on every outbound request */
  headers?: Record<string, string>
}

export interface ResolvedUpstream extends Upstream {
  apiKey?: string
}

export type ModelRewrite = 'identity' | 'strip-prefix' | 'append-free'

export interface Route {
  upstream: ResolvedUpstream
  /** Model id sent to the upstream (after rewrite) */
  outboundModel: string
  /** Deterministic fallback upstreams tried in order on 5xx */
  alternates: readonly ResolvedUpstream[]
}

export interface UpstreamResolver {
  resolve(model: string): Route
  /** Advertised model ids (or prefixes when no allowlist is given) */
  list(): string[]
}

export class RouterError extends Error {
  readonly status: number

  constructor(message: string, status = 404) {
    super(message)
    this.name = 'RouterError'
    this.status = status
  }
}

export interface PrefixEntryArgs {
  /** Curated advertised model ids; when empty, the prefix itself is advertised */
  models?: readonly string[]
  /** How to rewrite the advertised model id before forwarding upstream */
  modelRewrite?: ModelRewrite
  /** Upstreams to try in order if the primary returns a 5xx */
  fallbacks?: readonly Upstream[]
}

function applyRewrite(model: string, rewrite: ModelRewrite | undefined): string {
  switch (rewrite) {
    case 'strip-prefix': {
      const slash = model.indexOf('/')
      return slash === -1 ? model : model.slice(slash + 1)
    }
    case 'append-free':
      return `${model}:free`
    default:
      return model
  }
}

function resolveKey(upstream: Upstream): ResolvedUpstream {
  const { apiKey, apiKeyEnv, baseURL, headers } = upstream
  const key = apiKey ?? (apiKeyEnv ? process.env[apiKeyEnv] : undefined)
  return { baseURL, apiKey: key, headers }
}

interface Entry {
  prefix: string
  upstream: Upstream
  models?: readonly string[]
  modelRewrite?: ModelRewrite
  fallbacks?: readonly Upstream[]
}

/**
 * Longest-prefix model router. Advertised ids advertise a curated allowlist;
 * outbound ids are rewritten per entry (`strip-prefix` for Groq/Cerebras,
 * `append-free` for OpenRouter `:free`). Phase 30 layers presets and the
 * models.dev free catalog on top; Phase 31 adds quota/ratelimit enforcement.
 */
export class PrefixRouter implements UpstreamResolver {
  #entries: Entry[] = []

  add(prefix: string, upstream: Upstream, args: PrefixEntryArgs = {}): this {
    this.#entries.push({
      prefix,
      upstream,
      models: args.models ? [...args.models] : undefined,
      modelRewrite: args.modelRewrite,
      fallbacks: args.fallbacks ? [...args.fallbacks] : undefined,
    })
    return this
  }

  resolve(model: string): Route {
    let best: Entry | null = null
    for (const entry of this.#entries) {
      if (model !== entry.prefix && !model.startsWith(`${entry.prefix}/`)) continue
      if (!best || entry.prefix.length > best.prefix.length) best = entry
    }
    if (!best) throw new RouterError(`Unknown model: ${model}`)

    const upstream = resolveKey(best.upstream)
    const outboundModel = applyRewrite(model, best.modelRewrite)
    const alternates = (best.fallbacks ?? []).map(resolveKey)
    return { upstream, outboundModel, alternates }
  }

  list(): string[] {
    const advertised = new Set<string>()
    for (const entry of this.#entries) {
      if (entry.models && entry.models.length > 0) {
        for (const id of entry.models) advertised.add(id)
      } else {
        advertised.add(entry.prefix)
      }
    }
    return Array.from(advertised).sort()
  }
}
