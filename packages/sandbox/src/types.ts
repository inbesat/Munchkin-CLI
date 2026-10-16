/**
 * SandboxProvider platform abstraction (Phase 125): the contract every
 * sandbox backend implements so the host runs sandboxed commands the same
 * way on every platform. Dependencies: none - platform implementations
 * stay dependency-free too.
 *
 * No-throw convention: implementations report failures through result
 * objects (`timedOut`, `error`) instead of throwing.
 */

export interface SandboxCommandRequest {
  command: string
  args: readonly string[]
  cwd?: string
  env?: Record<string, string>
  timeoutMs?: number
}

export interface SandboxExecutionResult {
  /** Null when the process was killed by a timeout or could not spawn. */
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  /** Set when the command never ran (spawn failure), with the reason. */
  error?: string
  durationMs: number
}

export interface SandboxInfo {
  /** Provider id, e.g. 'windows-restricted-token', 'macos-seatbelt'. */
  id: string
  platform: string
  capabilities: readonly string[]
  available: boolean
  /** Why the provider is unavailable (populated when available === false). */
  unsupportedReason?: string
}

export interface IsolationCheck {
  name: string
  passed: boolean
  details?: string
}

export interface IsolationReport {
  /** True only when every check passed. */
  isolated: boolean
  checks: readonly IsolationCheck[]
}

export interface SandboxProvider {
  readonly id: string
  /** Provider metadata (id/platform/capabilities/availability). */
  info(): SandboxInfo
  /** Cheap availability probe (platform support, tooling present). */
  isAvailable(): Promise<boolean>
  /** Execute a command inside the sandbox. */
  execute(request: SandboxCommandRequest): Promise<SandboxExecutionResult>
  /** Verify the isolation actually applies (e.g. writes to blocked paths fail). */
  checkIsolation(): Promise<IsolationReport>
}

/**
 * Identity helper giving implementers a compile-time error when their
 * provider drifts from the interface.
 */
export function defineSandboxProvider(provider: SandboxProvider): SandboxProvider {
  return provider
}

/**
 * Mock provider (Phase 125 test contract + downstream stubs): replays a
 * scripted queue of execution results and isolation reports.
 */
export class MockSandboxProvider implements SandboxProvider {
  readonly id: string
  private readonly queue: SandboxExecutionResult[]
  private readonly isolationReport: IsolationReport
  private readonly infoOverride: Partial<SandboxInfo>
  public executedRequests: SandboxCommandRequest[] = []

  constructor(
    options: {
      id?: string
      queue?: SandboxExecutionResult[]
      isolationReport?: IsolationReport
      info?: Partial<SandboxInfo>
    } = {},
  ) {
    this.id = options.id ?? 'mock'
    this.queue = options.queue ?? []
    this.isolationReport =
      options.isolationReport ??
      ({
        isolated: true,
        checks: [{ name: 'mock-isolation', passed: true, details: 'mock always isolated' }],
      } satisfies IsolationReport)
    this.infoOverride = options.info ?? {}
  }

  info(): SandboxInfo {
    return {
      id: this.id,
      platform: 'mock',
      capabilities: ['execute', 'check-isolation'],
      available: true,
      ...this.infoOverride,
    }
  }

  async isAvailable(): Promise<boolean> {
    return this.info().available
  }

  async execute(request: SandboxCommandRequest): Promise<SandboxExecutionResult> {
    this.executedRequests.push(request)
    const next = this.queue.shift()
    if (next !== undefined) {
      return { ...next, durationMs: next.durationMs ?? 0 }
    }
    return {
      exitCode: 0,
      stdout: `mock executed: ${request.command} ${request.args.join(' ')}`.trim(),
      stderr: '',
      timedOut: false,
      durationMs: 0,
    }
  }

  async checkIsolation(): Promise<IsolationReport> {
    return {
      isolated: this.isolationReport.checks.every((c) => c.passed),
      checks: this.isolationReport.checks,
    }
  }
}
