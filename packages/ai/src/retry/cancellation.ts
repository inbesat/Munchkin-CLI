/** Combine per-request and wrapper cancellation without losing either signal. */
export function combineAbortSignals(
  request?: AbortSignal,
  wrapper?: AbortSignal,
): AbortSignal | undefined {
  if (!request) return wrapper
  if (!wrapper || request === wrapper) return request
  return AbortSignal.any([request, wrapper])
}
