import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { clientIp } from './client-ip'
import { PrefixRouter } from './router'
import { createApp } from './server'

describe('client IP trust boundary', () => {
  function app(trustProxy?: (peer: string) => boolean) {
    const app = new Hono()
    app.get('/', (c) => c.text(clientIp(c, { trustProxy })))
    return app
  }

  const env = { incoming: { socket: { remoteAddress: '192.0.2.1' } } }
  const headers = { 'x-forwarded-for': '198.51.100.2', 'x-real-ip': '198.51.100.3' }

  it('uses the transport peer and ignores forwarded headers by default', async () => {
    expect(await (await app().request('/', { headers }, env)).text()).toBe('192.0.2.1')
  })

  it('uses a stable unknown key without transport bindings', async () => {
    expect(await (await app().request('/', { headers })).text()).toBe('unknown')
  })

  it('only trusts forwarding from an explicitly trusted peer', async () => {
    expect(await (await app(() => false).request('/', { headers }, env)).text()).toBe('192.0.2.1')
    expect(
      await (await app((ip) => ip === '192.0.2.1').request('/', { headers }, env)).text(),
    ).toBe('198.51.100.2')
  })

  it('walks forwarding right to left and stops at the first untrusted hop', async () => {
    const res = await app((ip) => ip === '192.0.2.1').request(
      '/',
      {
        headers: { 'x-forwarded-for': '203.0.113.99, 198.51.100.2' },
      },
      env,
    )
    expect(await res.text()).toBe('198.51.100.2')
  })

  it('rejects malformed forwarded addresses instead of rotating keys', async () => {
    const res = await app(() => true).request(
      '/',
      {
        headers: { 'x-forwarded-for': 'arbitrary-quota-key' },
      },
      env,
    )
    expect(await res.text()).toBe('192.0.2.1')
  })

  it('cannot rotate the default server limiter using spoofed headers', async () => {
    const app = createApp({ router: new PrefixRouter(), limits: { ipRequestsPerMinute: 1 } })
    const request = (ip: string) =>
      app.request(
        '/v1/chat/completions',
        {
          method: 'POST',
          headers: { 'x-forwarded-for': ip },
          body: '{}',
        },
        env,
      )
    expect((await request('198.51.100.1')).status).toBe(400)
    expect((await request('198.51.100.2')).status).toBe(429)
  })
})
