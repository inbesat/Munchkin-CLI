import type { Model } from '../model/types'
import { withFallback } from './fallback'

/**
 * Model routing: turn preference tokens ("claude-sonnet-4-6", "gpt-4o",
 * "ollama") and an optional provider order into an ordered chain of models
 * that `withFallback` can run transparently.
 */

export interface RouterConfig {
  /** Model refs to put first, most preferred first. */
  preferred?: readonly string[]
  /** Force provider ordering for the fallback tail (e.g. ["openai-compatible", "ollama"]). */
  providerOrder?: readonly string[]
}

export interface RoutedModel {
  /** The ordered fallback chain after applying preferred + providerOrder. */
  chain: Model[]
  /** Transparent fallback Model over `chain`. */
  model: Model
  /** Resolve a single ref to the models it matches, in input order. */
  resolve(ref: string): Model[]
}

/** Does `ref` select `model`? Matches provider/model, provider, name, or id substring. */
export function matchModelRef(ref: string, model: Model): boolean {
  const token = ref.trim().toLowerCase()
  if (!token) return false
  const slash = token.indexOf('/')
  if (slash > 0) {
    const providerPart = token.slice(0, slash)
    const modelPart = token.slice(slash + 1)
    const providerMatches = model.provider.toLowerCase() === providerPart
    if (!providerMatches) return false
    return (
      model.name.toLowerCase() === modelPart ||
      model.id.toLowerCase().includes(modelPart) ||
      modelPart.length === 0
    )
  }
  return (
    model.id.toLowerCase().includes(token) ||
    model.provider.toLowerCase().includes(token) ||
    model.name.toLowerCase().includes(token)
  )
}

/** Models that match `ref`, preserving the input order of `models`. */
export function resolveModelRefs(models: readonly Model[], ref: string): Model[] {
  return models.filter((model) => matchModelRef(ref, model))
}

function dedupe(models: readonly Model[]): Model[] {
  const seen = new Set<string>()
  const out: Model[] = []
  for (const model of models) {
    if (seen.has(model.id)) continue
    seen.add(model.id)
    out.push(model)
  }
  return out
}

/**
 * Build the ordered chain: preferred refs first (in declared order), then any
 * remaining models whose provider matches `providerOrder` (in that order),
 * then every leftover model in input order.
 */
export function resolveChain(
  models: readonly Model[],
  config: RouterConfig = {},
  preferred = config.preferred ?? [],
): Model[] {
  const chain: Model[] = []
  const used = new Set<string>()

  for (const ref of preferred) {
    for (const model of resolveModelRefs(models, ref)) {
      if (used.has(model.id)) continue
      used.add(model.id)
      chain.push(model)
    }
  }

  const providers = (config.providerOrder ?? []).map((p) => p.trim().toLowerCase())
  if (providers.length > 0) {
    for (const providerToken of providers) {
      for (const model of models) {
        if (used.has(model.id)) continue
        if (model.provider.toLowerCase().includes(providerToken)) {
          used.add(model.id)
          chain.push(model)
        }
      }
    }
  }

  for (const model of models) {
    if (used.has(model.id)) continue
    used.add(model.id)
    chain.push(model)
  }

  return dedupe(chain)
}

/**
 * Create a routing Model: resolve a user-facing ref ("claude-sonnet-4-6",
 * "gpt-4o", "ollama/qwen2.5-coder") plus a fallback setup into a transparent
 * `Model` that the agent loop can call without knowing about the chain.
 */
export function createRouter(models: readonly Model[], config: RouterConfig = {}): RoutedModel {
  const chain = resolveChain(models, config)
  if (chain.length === 0) {
    throw new Error('createRouter requires at least one model')
  }
  return {
    chain,
    model: withFallback(chain),
    resolve: (ref: string) => resolveModelRefs(models, ref),
  }
}
