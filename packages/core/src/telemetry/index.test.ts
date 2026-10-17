import { describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type TelemetryPayload, createTelemetryClient, loadOrCreateInstallId } from './index'

function recorder() {
  const payloads: TelemetryPayload[] = []
  return {
    payloads,
    transport: async (payload: TelemetryPayload) => {
      payloads.push(payload)
    },
  }
}

describe('createTelemetryClient (Phase 147)', () => {
  it('sends nothing when telemetry is disabled', async () => {
    const { payloads, transport } = recorder()
    const client = createTelemetryClient({ enabled: false }, 'test-install', { transport })
    client.track({ name: 'command.run', properties: { command: 'eval' } })
    expect(client.pending).toBe(0)
    expect(await client.flush()).toBe(true)
    expect(payloads).toHaveLength(0)
  })

  it('buffers valid events and flushes one anonymous payload', async () => {
    const { payloads, transport } = recorder()
    const client = createTelemetryClient({ enabled: true }, 'test-install', { transport })
    client.track({ name: 'command.run', properties: { command: 'eval', durationMs: 12 } })
    client.track({
      name: 'session.start',
      properties: { model: 'claude-sonnet-4-6', provider: 'anthropic' },
    })
    expect(client.pending).toBe(2)
    expect(await client.flush()).toBe(true)
    expect(client.pending).toBe(0)
    expect(payloads).toHaveLength(1)
    expect(payloads[0]).toEqual({
      schemaVersion: 1,
      installId: 'test-install',
      events: [
        { name: 'command.run', properties: { command: 'eval', durationMs: 12 } },
        {
          name: 'session.start',
          properties: { model: 'claude-sonnet-4-6', provider: 'anthropic' },
        },
      ],
    })
  })

  it('never transmits prompts, file paths, code, or long text', async () => {
    const { payloads, transport } = recorder()
    const client = createTelemetryClient({ enabled: true }, 'test-install', { transport })
    client.track({
      name: 'error',
      properties: {
        kind: 'provider',
        prompt: 'write me a poem about kittens',
        path: 'C:\\Users\\Lenovo\\secret-project\\notes.txt',
        unixPath: '/home/lenovo/.ssh/id_rsa',
        email: 'someone@example.com',
        snippet: 'const apiKey = "sk-live-123"',
        long: 'x'.repeat(200),
      },
    })
    expect(await client.flush()).toBe(true)
    const sent = JSON.stringify(payloads[0])
    for (const secret of [
      'kittens',
      'secret-project',
      'id_rsa',
      'example.com',
      'apiKey',
      'sk-live',
    ]) {
      expect(sent).not.toContain(secret)
    }
    expect(payloads[0]?.events).toEqual([{ name: 'error', properties: { kind: 'provider' } }])
  })

  it('rejects invalid event names and non-finite numbers', async () => {
    const { payloads, transport } = recorder()
    const client = createTelemetryClient({ enabled: true }, 'test-install', { transport })
    client.track({ name: 'Bad Name' })
    client.track({
      name: 'ok.event',
      properties: { ms: Number.NaN, total: Number.POSITIVE_INFINITY, ok: true },
    })
    expect(client.dropped).toBe(1)
    await client.flush()
    expect(payloads[0]?.events).toEqual([{ name: 'ok.event', properties: { ok: true } }])
  })

  it('keeps events when a flush fails and retries them on the next flush', async () => {
    const { payloads, transport } = recorder()
    let fail = true
    const client = createTelemetryClient({ enabled: true }, 'test-install', {
      transport: async (payload) => {
        if (fail) throw new Error('network down')
        await transport(payload)
      },
    })
    client.track({ name: 'session.end', properties: { turns: 3 } })
    expect(await client.flush()).toBe(false)
    expect(client.pending).toBe(1)
    fail = false
    expect(await client.flush()).toBe(true)
    expect(payloads).toHaveLength(1)
  })

  it('caps the buffer at maxEvents', () => {
    const client = createTelemetryClient({ enabled: true }, 'test-install', {
      transport: async () => {},
      maxEvents: 2,
    })
    client.track({ name: 'a.one' })
    client.track({ name: 'a.two' })
    client.track({ name: 'a.three' })
    expect(client.pending).toBe(2)
  })

  it('rejects an unsafe install id', () => {
    expect(() =>
      createTelemetryClient({ enabled: true }, 'bad install id', { transport: async () => {} }),
    ).toThrow('invalid telemetry install id')
  })
})

describe('loadOrCreateInstallId (Phase 147)', () => {
  it('creates a random id once and reuses it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-telemetry-'))
    const file = join(dir, 'telemetry-id')
    const first = loadOrCreateInstallId(file)
    expect(first).toMatch(/^[0-9a-f-]{36}$/)
    expect(loadOrCreateInstallId(file)).toBe(first)
    expect(readFileSync(file, 'utf8').trim()).toBe(first)
    writeFileSync(file, 'not a valid id!!')
    const second = loadOrCreateInstallId(file)
    expect(second).not.toBe('not a valid id!!')
    expect(second).toMatch(/^[0-9a-f-]{36}$/)
    rmSync(dir, { recursive: true, force: true })
  })
})
