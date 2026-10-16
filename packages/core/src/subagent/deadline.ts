/**
 * Orchestration test utility: resolve `promise` normally, but reject with a
 * "possible deadlock" error if it has not settled within `ms`. Ensures a
 * hung orchestration primitive fails a stress test instead of hanging it.
 */

export async function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let watchdog: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    watchdog = setTimeout(() => {
      reject(new Error(`possible deadlock: "${label}" did not settle within ${ms}ms`))
    }, ms)
  })
  try {
    return await Promise.race([promise, deadline])
  } finally {
    if (watchdog !== undefined) clearTimeout(watchdog)
  }
}
