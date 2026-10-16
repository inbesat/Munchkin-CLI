import { isIP } from 'node:net'
import type { Context } from 'hono'

export type ClientIp = (c: Context) => string

export interface ClientIpOptions {
  /** Opt-in allowlist for transport peers/proxy hops, never request headers. */
  trustProxy?: (address: string) => boolean
}

/** Default to the node adapter's transport peer, never client-supplied headers. */
export function clientIp(c: Context, options: ClientIpOptions = {}): string {
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined
  const peer = env?.incoming?.socket?.remoteAddress
  if (!peer || !isIP(peer)) return 'unknown'
  if (!options.trustProxy?.(peer)) return peer

  const forwarded = c.req.header('x-forwarded-for')
  if (forwarded) {
    const hops = forwarded.split(',').map((hop) => hop.trim())
    if (hops.some((hop) => !isIP(hop))) return peer
    let address = peer
    for (let i = hops.length - 1; i >= 0 && options.trustProxy(address); i--) {
      address = hops[i]
    }
    return address
  }
  const real = c.req.header('x-real-ip')?.trim()
  return real && isIP(real) ? real : peer
}
