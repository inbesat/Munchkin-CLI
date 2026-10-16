/**
 * Cross-harness delegation (Phase 100): spawn Claude Code, Codex, or any
 * ACP-compatible agent binary as a subprocess and delegate a task to it.
 *
 * Wire format: newline-delimited JSON-RPC 2.0 — the same framing the
 * Phase-80 RPC mode implements (implemented here rather than imported:
 * core must not depend on the server package).
 *
 * Handshake: `initialize` request first, then `task/run` with
 * `{ prompt }`; the harness's final RPC result (string, or object with a
 * string `result`/`text` field) is the delegated task's outcome. Failures
 * (binary missing, spawn error, RPC error, timeout) become `{ ok: false }`
 * results — this module never throws to the caller.
 */
import { spawn as nodeSpawn } from 'node:child_process'
import { createInterface } from 'node:readline'

export interface HarnessSpawnRequest {
  binary: string
  args: readonly string[]
  cwd?: string
}

export interface HarnessLineProcess {
  write(line: string): void
  readLines(): AsyncIterable<string>
  waitExit(): Promise<number>
  kill(): void
}

export type HarnessSpawner = (request: HarnessSpawnRequest) => HarnessLineProcess

export interface DelegateToHarnessOptions {
  binary: string
  task: string
  args?: readonly string[]
  cwd?: string
  timeoutMs?: number
  /** Injectable for offline tests; defaults to a real child process. */
  spawnImpl?: HarnessSpawner
}

export interface DelegateResult {
  ok: boolean
  result?: string
  error?: string
  exitCode?: number
}

/** Harnesses this integration knows how to drive. */
export const RUNNING_HARNESS_BINARIES: readonly string[] = ['claude', 'codex']

/** Resolve a harness binary from PATH, or null. */
export function resolveHarnessBinary(name: string): string | null {
  const bun = (globalThis as { Bun?: { which(name: string): string | null } }).Bun
  if (bun !== undefined) return bun.which(name)
  const result = nodeSpawn('where', [name], { shell: false, stdio: 'pipe' })
  const out = result.stdout?.toString() ?? ''
  const first = out.split(/\r?\n/).find((l) => l.trim().length > 0)
  return first && first.trim().length > 0 ? first.trim() : null
}

interface RpcResponse {
  jsonrpc: string
  id: number | string | null
  result?: unknown
  error?: { code: number; message: string }
}

/** Extract the task outcome string from an RPC result payload. */
function extractResult(payload: unknown): string {
  if (typeof payload === 'string') return payload
  if (payload !== null && typeof payload === 'object') {
    const record = payload as { result?: unknown; text?: unknown }
    if (typeof record.result === 'string') return record.result
    if (typeof record.text === 'string') return record.text
  }
  return JSON.stringify(payload)
}

/** Default process spawner: node child process with line-delimited stdio. */
function defaultSpawner(request: HarnessSpawnRequest): HarnessLineProcess {
  const child = nodeSpawn(request.binary, [...request.args], {
    cwd: request.cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const spawnError = new Promise<string>((resolve) => {
    child.on('error', (error: NodeJS.ErrnoException) => resolve(`spawn failed: ${error.message}`))
  })
  const lines: string[] = []
  const waiters: Array<(line: string) => void> = []
  const readline = createInterface({ input: child.stdout ?? process.stdin })
  readline.on('line', (line) => {
    const waiter = waiters.shift()
    if (waiter !== undefined) waiter(line)
    else lines.push(line)
  })

  async function* readLines(): AsyncIterable<string> {
    const firstError = Promise.race([spawnError])
    let spawnFailure: string | undefined
    void firstError.then((message) => {
      spawnFailure = message
      const waiter = waiters.shift()
      if (waiter !== undefined) waiter('')
    })
    while (true) {
      const queued = lines.shift()
      if (queued !== undefined) {
        yield queued
        continue
      }
      const line = await new Promise<string | undefined>((resolve) => {
        waiters.push(resolve)
      })
      if (line === undefined) return
      if (spawnFailure !== undefined) return
      yield line
    }
  }

  return {
    write: (line: string) => {
      if (child.stdin !== null && child.stdin.writable) child.stdin.write(`${line}\n`)
    },
    readLines,
    waitExit: () =>
      new Promise<number>((resolve) => {
        child.on('exit', (code) => resolve(code ?? -1))
      }),
    kill: () => child.kill(),
  }
}

/** Delegate a task to an external harness. Never throws. */
export async function delegateToHarness(
  options: DelegateToHarnessOptions,
): Promise<DelegateResult> {
  const spawner = options.spawnImpl ?? defaultSpawner
  if (options.spawnImpl === undefined && resolveHarnessBinary(options.binary) === null) {
    return { ok: false, error: `binary not found: ${options.binary}` }
  }

  const timeoutMs = options.timeoutMs ?? 120_000
  let process: HarnessLineProcess
  try {
    process = spawner({ binary: options.binary, args: [...(options.args ?? [])], cwd: options.cwd })
  } catch (error) {
    return {
      ok: false,
      error: `spawn failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  const pending = new Map<number, (response: RpcResponse) => void>()
  const timer = setTimeout(() => {
    const timeoutResponse: RpcResponse = {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32000, message: `harness timed out after ${timeoutMs}ms` },
    }
    for (const resolve of pending.values()) resolve(timeoutResponse)
    pending.clear()
    process.kill()
  }, timeoutMs)

  try {
    const lines = process.readLines()
    const reader = (async (): Promise<void> => {
      for await (const line of lines) {
        if (line.trim().length === 0) continue
        const response = JSON.parse(line) as RpcResponse
        const resolver = pending.get(Number(response.id))
        if (resolver !== undefined) {
          pending.delete(Number(response.id))
          resolver(response)
        }
      }
    })()
    void reader

    const call = (id: number, method: string, params?: unknown): Promise<RpcResponse> =>
      new Promise<RpcResponse>((resolve) => {
        pending.set(id, resolve)
        process.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
      })

    const handshake = await call(1, 'initialize', {})
    if (handshake.error !== undefined) {
      return { ok: false, error: `initialize failed: ${handshake.error.message}` }
    }

    const response = await call(2, 'task/run', { prompt: options.task })
    if (response.error !== undefined) {
      return { ok: false, error: `harness error: ${response.error.message}` }
    }
    return { ok: true, result: extractResult(response.result) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
    process.kill()
  }
}
