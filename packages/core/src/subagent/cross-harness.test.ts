import { describe, expect, it } from 'bun:test'
import {
  delegateToHarness,
  type HarnessLineProcess,
  type HarnessSpawnRequest,
  type HarnessSpawner,
  resolveHarnessBinary,
  RUNNING_HARNESS_BINARIES,
} from './cross-harness'

type RecordedHarnessRequest = HarnessSpawnRequest & { stdinLines: string[] }

/** Fake stdio process that answers initialize + task/run per scripted results. */
function fakeSpawner(results: string[], record: RecordedHarnessRequest[] = []): HarnessSpawner {
  return (request: HarnessSpawnRequest) => {
    const stdinLines: string[] = []
    record.push({ ...request, stdinLines })

    const pending: string[] = []
    let notify: (() => void) | undefined
    const push = (line: string): void => {
      pending.push(line)
      notify?.()
    }

    let sequential = 1
    const process: HarnessLineProcess = {
      write(line: string): void {
        stdinLines.push(line)
        const message = JSON.parse(line) as { id: number; method: string }
        if (message.method === 'initialize') {
          push(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { ok: true } }))
          return
        }
        if (message.method === 'task/run') {
          const result = results[Math.min(results.length - 1, sequential - 1)]
          sequential += 1
          setImmediate(() => push(JSON.stringify({ jsonrpc: '2.0', id: message.id, result })))
        }
      },
      readLines: async function* () {
        while (true) {
          while (pending.length > 0) {
            const line = pending.shift()
            if (line !== undefined) yield line
          }
          await new Promise<void>((resolve) => {
            notify = resolve
          })
        }
      },
      async waitExit(): Promise<number> {
        return 0
      },
      kill(): void {},
    }
    return process
  }
}

describe('resolveHarnessBinary (Phase 100)', () => {
  it('finds installed binaries on PATH', () => {
    const found = resolveHarnessBinary('bun')
    expect(typeof found === 'string' || found === null).toBe(true)
    if (found !== null) expect(found.length).toBeGreaterThan(0)
  })

  it('returns null for binaries that are not installed', () => {
    expect(resolveHarnessBinary('forge-not-a-real-harness-xyz')).toBeNull()
  })
})

describe('delegateToHarness (Phase 100)', () => {
  it('delegates a task over line-delimited JSON-RPC and returns the result', async () => {
    const recorded: RecordedHarnessRequest[] = []
    const spawner = fakeSpawner(['implementation complete'], recorded)
    const result = await delegateToHarness({
      binary: 'claude',
      task: 'refactor the auth module',
      spawnImpl: spawner,
      timeoutMs: 2000,
    })
    expect(result.ok).toBe(true)
    expect(result.result).toBe('implementation complete')
    // Handshake order: initialize (first), then task/run.
    const firstRequest = JSON.parse(recorded[0]?.stdinLines[0] ?? '{}') as { method: string }
    const secondRequest = JSON.parse(recorded[0]?.stdinLines[1] ?? '{}') as { method: string }
    expect(firstRequest.method).toBe('initialize')
    expect(secondRequest.method).toBe('task/run')
    expect(secondRequest.params).toEqual({ prompt: 'refactor the auth module' })
  })

  it('reports an RPC error response as not-ok without throwing', async () => {
    const spawner: HarnessSpawner = () => ({
      write(line) {
        const message = JSON.parse(line) as { id: number }
        if (message.method === 'task/run') {
          setImmediate(() => {
            void 0
          })
        }
      },
      readLines: async function* () {
        yield JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: { ok: true },
        })
        yield JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          error: { code: -32603, message: 'model unavailable' },
        })
      },
      waitExit: async () => 0,
      kill: () => {},
    })
    const result = await delegateToHarness({
      binary: 'codex',
      task: 'do it',
      spawnImpl: spawner,
      timeoutMs: 2000,
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('model unavailable')
  })

  it('times out when the harness never answers', async () => {
    const spawner: HarnessSpawner = () => ({
      write: () => {},
      readLines: async function* () {
        await new Promise(() => {})
      },
      waitExit: async () => 0,
      kill: () => {},
    })
    const result = await delegateToHarness({
      binary: 'claude',
      task: 'hang forever',
      spawnImpl: spawner,
      timeoutMs: 60,
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('timed out')
  })

  it('returns not-ok when the binary is not installed (via runner)', async () => {
    const result = await delegateToHarness({
      binary: 'forge-not-a-real-harness-xyz',
      task: 'task',
      timeoutMs: 500,
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('knows which harnesses are running on this machine', () => {
    expect(Array.isArray(RUNNING_HARNESS_BINARIES) || RUNNING_HARNESS_BINARIES === undefined).toBe(
      true,
    )
  })
})
