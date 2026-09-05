import type { GenerateOptions, GenerateResult, Model, StreamChunk } from '../model/types'
import { type NormalizedProviderError, normalizeProviderError } from '../retry/normalize'

export interface FallbackOptions {
  /**
   * Decide whether a failed model attempt should move to the next model in the
   * chain. Receives the *normalized* error plus the model that failed. Defaults
   * to true — any failure of the primary provider advances the chain.
   */
  shouldFallback?: (error: unknown, model: Model) => boolean
  /** Called when switching from `from` to `to` after `error`. */
  onFallback?: (from: Model, to: Model, error: unknown) => void
  abortSignal?: AbortSignal
}

/**
 * Builds a single transparent `Model` over an ordered chain of models: each
 * call is attempted on the first model, and if it fails (and `shouldFallback`
 * allows), the next model in the chain is tried. The agent loop holds one
 * `Model` reference and never sees intermediate failures — the final error is
 * normalized into the ForgeError hierarchy.
 *
 * Streaming mirrors `withModelRetry`: a fallback happens only when the failure
 * occurs before the first chunk, so a partially-delivered response is never
 * repeated.
 */
export function withFallback(models: readonly Model[], opts: FallbackOptions = {}): Model {
  const chain = [...models]
  if (chain.length === 0) {
    throw new Error('withFallback requires at least one model in the chain')
  }

  const [primary] = chain
  const shouldFallback = opts.shouldFallback ?? (() => true)

  function moveToNext(current: Model): Model | undefined {
    const idx = chain.indexOf(current)
    return idx >= 0 && idx + 1 < chain.length ? chain[idx + 1] : undefined
  }

  async function generate(options: GenerateOptions): Promise<GenerateResult> {
    let current = primary
    for (;;) {
      try {
        return await current.generate(options)
      } catch (error) {
        if (opts.abortSignal?.aborted) throw error
        const normalized = normalizeProviderError(error, current.provider)
        const next = moveToNext(current)
        if (!next || !shouldFallback(normalized, current)) throw normalized
        opts.onFallback?.(current, next, normalized)
        current = next
      }
    }
  }

  async function* stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    let current = primary
    for (;;) {
      let yielded = false
      try {
        for await (const chunk of current.stream(options)) {
          yielded = true
          yield chunk
        }
        return
      } catch (error) {
        if (opts.abortSignal?.aborted) throw error
        const normalized = normalizeProviderError(error, current.provider)
        const next = moveToNext(current)
        if (yielded || !next || !shouldFallback(normalized, current)) throw normalized
        opts.onFallback?.(current, next, normalized)
        current = next
      }
    }
  }

  return {
    id: primary.id,
    provider: primary.provider,
    name: primary.name,
    config: primary.config,
    generate,
    stream,
    supportsFeature: (feature) => primary.supportsFeature(feature),
    getCapabilities: () => primary.getCapabilities(),
  }
}

export type { NormalizedProviderError }
