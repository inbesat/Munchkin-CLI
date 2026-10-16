import type { GenerateOptions, GenerateResult, Model, StreamChunk } from '../model/types'
import { combineAbortSignals } from '../retry/cancellation'
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

  async function generate(options: GenerateOptions): Promise<GenerateResult> {
    const abortSignal = combineAbortSignals(options.abortSignal, opts.abortSignal)
    let index = 0
    let current = primary
    for (;;) {
      abortSignal?.throwIfAborted()
      try {
        return await current.generate({ ...options, abortSignal })
      } catch (error) {
        abortSignal?.throwIfAborted()
        const normalized = normalizeProviderError(error, current.provider)
        const next = chain[++index]
        if (!next || !shouldFallback(normalized, current)) throw normalized
        opts.onFallback?.(current, next, normalized)
        current = next
      }
    }
  }

  async function* stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const abortSignal = combineAbortSignals(options.abortSignal, opts.abortSignal)
    let index = 0
    let current = primary
    for (;;) {
      abortSignal?.throwIfAborted()
      let yielded = false
      try {
        for await (const chunk of current.stream({ ...options, abortSignal })) {
          abortSignal?.throwIfAborted()
          yielded = true
          yield chunk
        }
        return
      } catch (error) {
        abortSignal?.throwIfAborted()
        const normalized = normalizeProviderError(error, current.provider)
        const next = chain[++index]
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
