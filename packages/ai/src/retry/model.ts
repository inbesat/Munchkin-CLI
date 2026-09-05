import type { GenerateOptions, GenerateResult, Model, StreamChunk } from '../model/types'
import { type BackoffOptions, computeBackoffDelay, sleep, withRetry } from './backoff'
import { type NormalizedProviderError, isRetryable, normalizeProviderError } from './normalize'

export interface ModelRetryOptions extends BackoffOptions {
  /** Overrides the retry predicate (default: `isRetryable(normalized)`). */
  retryOn?: (error: unknown) => boolean
  abortSignal?: AbortSignal
}

/**
 * Wrap a `Model` so failed provider calls are normalized into ForgeError
 * subtypes and retryable failures (429, overload, timeout, 5xx) are retried
 * with exponential backoff. Streaming only restarts the request when the
 * failure happens before the first chunk — a mid-stream drop is rethrown as a
 * normalized `PROVIDER_STREAM_ERROR`/`PROVIDER_REQUEST_FAILED` without
 * duplicating a partial response.
 */
export function withModelRetry(model: Model, opts: ModelRetryOptions = {}): Model {
  const provider = model.provider
  const normalize = (error: unknown): NormalizedProviderError =>
    normalizeProviderError(error, provider)
  const retryOn = opts.retryOn ?? ((error: unknown) => isRetryable(normalize(error)))

  async function generate(options: GenerateOptions): Promise<GenerateResult> {
    try {
      return await withRetry(() => model.generate(options), {
        ...opts,
        retryOn,
      })
    } catch (error) {
      throw normalize(error)
    }
  }

  async function* stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const maxAttempts = opts.maxAttempts ?? 3
    let attempt = 0
    for (;;) {
      let yielded = false
      try {
        for await (const chunk of model.stream(options)) {
          yielded = true
          yield chunk
        }
        return
      } catch (error) {
        if (opts.abortSignal?.aborted) throw error
        const normalized = normalize(error)
        const canRetry =
          (opts.retryOn ? opts.retryOn(error) : isRetryable(normalized)) &&
          !yielded &&
          attempt + 1 < maxAttempts
        if (!canRetry) throw normalized
        attempt += 1
        await sleep(computeBackoffDelay(attempt, opts), opts.abortSignal)
      }
    }
  }

  return {
    id: model.id,
    provider: model.provider,
    name: model.name,
    config: model.config,
    generate,
    stream,
    supportsFeature: (feature) => model.supportsFeature(feature),
    getCapabilities: () => model.getCapabilities(),
  }
}
