import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ErrorCode, ToolError } from '../errors'

/** Shell session state. */
export interface ShellSession {
  readonly id: string
  readonly createdAt: number
  lastUsedAt: number
  /** Environment variables for this session. */
  env: Record<string, string | undefined>
  /** Working directory for this session. */
  cwd: string
  /** Scratch directory for env/cwd capture files (created per session). */
  readonly scratchDir: string
}

/** Options for creating a shell session. */
export interface CreateSessionOptions {
  /** Session ID (auto-generated if not provided). */
  id?: string
  /** Initial environment variables. */
  env?: Record<string, string>
  /** Initial working directory. */
  cwd?: string
}

/** Result of executing a command in a shell session. */
export interface ShellExecutionResult {
  /** Exit code (null if timeout/killed). */
  exitCode: number | null
  /** Standard output. */
  stdout: string
  /** Standard error. */
  stderr: string
  /** Whether the command timed out. */
  timedOut: boolean
  /** Duration in milliseconds. */
  durationMs: number
}

/**
 * BashManager — manages persistent shell sessions.
 *
 * Each session maintains its own environment state (env vars, cwd) across
 * multiple command executions. Sessions are identified by ID and can be
 * reused or created fresh.
 */
export class BashManager {
  private readonly sessions = new Map<string, ShellSession>()
  private readonly defaultTimeout = 120_000 // 120 seconds
  private readonly maxSessions = 50

  /** Get or create a shell session. */
  getOrCreateSession(options: CreateSessionOptions = {}): ShellSession {
    const id = options.id ?? this.generateId()

    let session = this.sessions.get(id)
    if (!session) {
      // Enforce max sessions limit
      if (this.sessions.size >= this.maxSessions) {
        this.evictOldestSession()
      }

      session = {
        id,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        env: { ...process.env, ...options.env },
        cwd: options.cwd ?? process.cwd(),
        scratchDir: join(tmpdir(), `forge-shell-${id}-${randomUUID().slice(0, 8)}`),
      }
      mkdirSync(session.scratchDir, { recursive: true })
      this.sessions.set(id, session)
    } else {
      // Update last used time
      session.lastUsedAt = Date.now()
      // Merge new env vars if provided
      if (options.env) {
        session.env = { ...session.env, ...options.env }
      }
      // Update cwd if provided
      if (options.cwd) {
        session.cwd = options.cwd
      }
    }

    return session
  }

  /** Get an existing session by ID. */
  getSession(id: string): ShellSession | undefined {
    return this.sessions.get(id)
  }

  /** Delete a session. */
  deleteSession(id: string): boolean {
    return this.sessions.delete(id)
  }

  /** List all active sessions. */
  listSessions(): readonly ShellSession[] {
    return [...this.sessions.values()]
  }

  /**
   * Execute a command in a shell session.
   * Returns stdout, stderr, exit code, and timing info.
   */
  async execute(
    sessionId: string,
    command: string,
    options?: { timeout?: number; cwd?: string; env?: Record<string, string> },
  ): Promise<ShellExecutionResult> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new ToolError(
        ErrorCode.TOOL_INVALID_INPUT,
        `Shell session not found: ${sessionId}`,
        'bash',
      )
    }

    const timeout = options?.timeout ?? this.defaultTimeout
    const cwd = options?.cwd ?? session.cwd
    const env = { ...session.env, ...(options?.env as Record<string, string | undefined>) }

    const startTime = Date.now()
    let timedOut = false

    // Wrap the command so the resulting environment + working directory are
    // persisted to the session scratch dir. This is what makes the session
    // actually persistent: `export FOO=…` / `cd …` survive across execute()
    // calls, because each call re-reads the captured state.
    const envFile = join(session.scratchDir, 'env.dump')
    const cwdFile = join(session.scratchDir, 'cwd.txt')
    // bash single-quoted literal; backslashes stay literal inside quotes
    const envArg = envFile.replaceAll("'", "'\\''")
    const cwdArg = cwdFile.replaceAll("'", "'\\''")
    const wrapped = `${command}\n__forge_ec=$?\nenv -0 > '${envArg}' 2>/dev/null\npwd > '${cwdArg}' 2>/dev/null\nexit $__forge_ec`

    try {
      const proc = Bun.spawn(['bash', '-c', wrapped], {
        cwd,
        env,
        stdout: 'pipe',
        stderr: 'pipe',
      })

      // Race between process completion and timeout
      const [stdout, stderr, exitCode] = await Promise.race([
        (async () => {
          const [out, err] = await Promise.all([
            new TextDecoder().decode(await new Response(proc.stdout).arrayBuffer()),
            new TextDecoder().decode(await new Response(proc.stderr).arrayBuffer()),
          ])
          const code = await proc.exited
          return [out, err, code] as const
        })(),
        new Promise<[string, string, null]>((resolve) => {
          setTimeout(() => {
            proc.kill()
            timedOut = true
            resolve(['', 'Command timed out', null])
          }, timeout)
        }),
      ])

      const durationMs = Date.now() - startTime

      // Update session state from the capture files (env exports, `cd`).
      session.lastUsedAt = Date.now()
      if (!timedOut) {
        if (existsSync(envFile)) {
          const dump = readFileSync(envFile, 'utf8')
          const captured: Record<string, string | undefined> = {}
          for (const entry of dump.split('\0')) {
            const eq = entry.indexOf('=')
            if (eq > 0) captured[entry.slice(0, eq)] = entry.slice(eq + 1)
          }
          session.env = captured
        }
        if (existsSync(cwdFile)) {
          const capturedCwd = readFileSync(cwdFile, 'utf8').trim()
          if (capturedCwd !== '') session.cwd = capturedCwd
        }
      }

      return {
        exitCode: timedOut ? null : exitCode,
        stdout,
        stderr,
        timedOut,
        durationMs,
      }
    } catch (err) {
      Date.now() - startTime
      throw new ToolError(
        ErrorCode.TOOL_EXECUTION_FAILED,
        `Shell execution failed: ${err instanceof Error ? err.message : String(err)}`,
        'bash',
        { cause: err },
      )
    }
  }

  /** Execute a command in the background (non-blocking). */
  executeBackground(
    sessionId: string,
    command: string,
    options?: { cwd?: string; env?: Record<string, string> },
  ): { pid: number; abort: () => void } {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new ToolError(
        ErrorCode.TOOL_INVALID_INPUT,
        `Shell session not found: ${sessionId}`,
        'bash',
      )
    }

    const cwd = options?.cwd ?? session.cwd
    const env = { ...session.env, ...(options?.env as Record<string, string | undefined>) }

    const proc = Bun.spawn(['bash', '-c', command], {
      cwd,
      env,
      stdout: 'inherit',
      stderr: 'inherit',
    })

    return {
      pid: proc.pid,
      abort: () => proc.kill(),
    }
  }

  /** Clean up all sessions. */
  clear(): void {
    this.sessions.clear()
  }

  /** Get session count. */
  get size(): number {
    return this.sessions.size
  }

  private generateId(): string {
    return `shell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  private evictOldestSession(): void {
    let oldestId: string | null = null
    let oldestTime = Number.POSITIVE_INFINITY

    for (const [id, session] of this.sessions) {
      if (session.lastUsedAt < oldestTime) {
        oldestTime = session.lastUsedAt
        oldestId = id
      }
    }

    if (oldestId) {
      this.sessions.delete(oldestId)
    }
  }
}

/** Default singleton instance. */
export const bashManager = new BashManager()
