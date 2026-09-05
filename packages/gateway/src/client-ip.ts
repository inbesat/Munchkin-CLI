import type { Context } from 'hono'

export type ClientIp = (c: Context) => string

/**
 * Best-effort client address. Trusts `x-forwarded-for` (first hop) set by
 * reverse proxies, falls back to `x-real-ip`, then `unknown`. In a fleet
 * deployment operators should pin `trustProxyHosts` so spoofed headers can't
 * rotate quota keys — noted for the Phase 32 ops pass.
 */
export function clientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return c.req.header('x-real-ip') ?? 'unknown'
}
