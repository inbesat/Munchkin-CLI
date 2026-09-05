// AbortSignal is a global type in TypeScript/DOM

/** Reason for interruption. */
export type InterruptReason =
  | 'user-cancel'          // User pressed Escape/Ctrl+C
  | 'timeout'              // Operation exceeded time limit
  | 'tool-limit'           // Max tool calls exceeded
  | 'context-overflow'     // Context window exceeded
  | 'error'                // Unexpected error
  | 'shutdown'             // System shutdown

/** Result of an interrupted operation. */
export interface InterruptResult {
  /** Whether the operation was interrupted. */
  interrupted: boolean
  /** Reason for interruption. */
  reason?: InterruptReason
  /** Partial data saved before interruption. */
  partialData?: unknown
  /** Whether in-progress tools were allowed to complete. */
  toolsCompleted: boolean
  /** Timestamp of interruption. */
  timestamp: number
}

/** Options for interrupt handling. */
export interface InterruptOptions {
  /** Whether to wait for in-progress tools to complete before fully stopping. */
  waitForTools?: boolean
  /** Maximum time to wait for tools to complete (ms). */
  toolWaitTimeout?: number
  /** Callback when interrupt is triggered. */
  onInterrupt?: (reason: InterruptReason) => void
  /** Callback when tools are being waited on. */
  onToolsWaiting?: (count: number) => void
  /** Callback when tools have completed. */
  onToolsCompleted?: () => void
}

/** Default interrupt options. */
const DEFAULT_OPTIONS: Required<InterruptOptions> = {
  waitForTools: true,
  toolWaitTimeout: 30_000,
  onInterrupt: () => {},
  onToolsWaiting: () => {},
  onToolsCompleted: () => {},
}

/** State of an interruptible operation. */
export interface InterruptState {
  /** Whether an interrupt has been requested. */
  requested: boolean
  /** Reason for the interrupt request. */
  reason?: InterruptReason
  /** Whether we're currently waiting for tools to complete. */
  waitingForTools: boolean
  /** Number of in-progress tools. */
  activeTools: number
  /** Abort signal linked to this interrupt. */
  signal: AbortSignal
}

/**
 * Manages interrupt/cancel semantics for agent operations.
 *
 * Provides a way to gracefully interrupt an agent turn:
 * - Stops LLM streaming via abort signal
 * - Optionally waits for in-progress tools to complete
 * - Saves partial progress
 * - Returns control to user
 */
export class InterruptController {
  private state: InterruptState
  private options: Required<InterruptOptions>
  private abortController: AbortController
  private toolWaitPromise: Promise<void> | null = null

  constructor(options: InterruptOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.abortController = new AbortController()

    this.state = {
      requested: false,
      reason: undefined,
      waitingForTools: false,
      activeTools: 0,
      signal: this.abortController.signal,
    }
  }

  /** Get the abort signal linked to this interrupt. */
  get signal(): AbortSignal {
    return this.state.signal
  }

  /** Get current interrupt state. */
  getState(): Readonly<InterruptState> {
    return { ...this.state }
  }

  /** Check if an interrupt has been requested. */
  isInterrupted(): boolean {
    return this.state.requested
  }

  /** Request an interrupt with the given reason. */
  requestInterrupt(reason: InterruptReason = 'user-cancel'): void {
    if (this.state.requested) return

    this.state.requested = true
    this.state.reason = reason
    this.options.onInterrupt(reason)

    // Abort the signal to stop LLM streaming
    this.abortController.abort(reason)
  }

  /** Register a tool as starting (increments active tool count). */
  registerToolStart(): void {
    this.state.activeTools++
  }

  /** Register a tool as finished (decrements active tool count). */
  registerToolEnd(): void {
    this.state.activeTools = Math.max(0, this.state.activeTools - 1)
    this.checkToolWaitCompletion()
  }

  /**
   * Wait for all active tools to complete (or timeout).
   * Returns an InterruptResult with the outcome.
   */
  async waitForTools(): Promise<InterruptResult> {
    const wasInterrupted = this.state.requested

    if (this.state.activeTools === 0) {
      return this.createResult(wasInterrupted, this.state.reason, undefined, true)
    }

    if (!this.options.waitForTools) {
      return this.createResult(wasInterrupted, this.state.reason, undefined, false)
    }

    this.state.waitingForTools = true
    this.options.onToolsWaiting(this.state.activeTools)

    // Create a promise that resolves when all tools complete or timeout
    this.toolWaitPromise = new Promise((resolve) => {
      const check = () => {
        if (this.state.activeTools === 0) {
          this.state.waitingForTools = false
          this.options.onToolsCompleted()
          resolve()
        }
      }

      // Check immediately in case tools finished synchronously
      check()

      // Set up timeout
      setTimeout(() => {
        this.state.waitingForTools = false
        this.options.onToolsCompleted()
        resolve()
      }, this.options.toolWaitTimeout)

      // We can't easily hook into the check without a more complex system,
      // so we'll just use the timeout as a fallback
    })

    await this.toolWaitPromise
    this.toolWaitPromise = null

    return this.createResult(
      wasInterrupted,
      this.state.reason,
      undefined,
      this.state.activeTools === 0,
    )
  }

  /** Check if tool wait completion condition is met. */
  private checkToolWaitCompletion(): void {
    if (this.state.waitingForTools && this.state.activeTools === 0) {
      this.state.waitingForTools = false
      this.options.onToolsCompleted()
    }
  }

  /** Create an interrupt result object. */
  private createResult(
    interrupted: boolean,
    reason: InterruptReason | undefined,
    partialData: unknown,
    toolsCompleted: boolean,
  ): InterruptResult {
    return {
      interrupted,
      reason,
      partialData,
      toolsCompleted,
      timestamp: Date.now(),
    }
  }

  /** Reset the interrupt controller for reuse. */
  reset(): void {
    this.abortController = new AbortController()
    this.state = {
      requested: false,
      reason: undefined,
      waitingForTools: false,
      activeTools: 0,
      signal: this.abortController.signal,
    }
    this.toolWaitPromise = null
  }

  /** Cancel any pending tool wait. */
  cancelToolWait(): void {
    this.state.waitingForTools = false
    this.toolWaitPromise = null
  }
}

/** Create a linked abort signal from multiple sources. */
export function createLinkedAbortSignal(...signals: (AbortSignal | undefined | null)[]): AbortSignal {
  const controller = new AbortController()
  const validSignals = signals.filter((s): s is AbortSignal => s != null)

  for (const signal of validSignals) {
    if (signal.aborted) {
      controller.abort(signal.reason)
    } else {
      signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true })
    }
  }

  return controller.signal
}

/** Run an async operation with interrupt support. */
export async function withInterrupt<T>(
  controller: InterruptController,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<{ result: T | null; interrupt: InterruptResult }> {
  try {
    const result = await operation(controller.signal)
    // Check if interrupt was requested during operation
    if (controller.signal.aborted) {
      const interrupt = await controller.waitForTools()
      return { result: null, interrupt }
    }
    const interrupt = await controller.waitForTools()
    return { result, interrupt }
  } catch (err) {
    const interrupt = await controller.waitForTools()
    if (controller.isInterrupted() || controller.signal.aborted) {
      return { result: null, interrupt }
    }
    throw err
  }
}

/** Wrap an async iterator to support interrupt. */
export async function* withInterruptIterator<T>(
  controller: InterruptController,
  iterator: AsyncIterable<T>,
): AsyncGenerator<T, void, unknown> {
  for await (const item of iterator) {
    if (controller.isInterrupted()) {
      break
    }
    yield item
  }
}

/** Interrupt reason from abort signal. */
export function interruptReasonFromSignal(signal: AbortSignal): InterruptReason {
  const reason = signal.reason
  if (typeof reason === 'string') {
    const reasons: InterruptReason[] = [
      'user-cancel',
      'timeout',
      'tool-limit',
      'context-overflow',
      'error',
      'shutdown',
    ]
    if (reasons.includes(reason as InterruptReason)) {
      return reason as InterruptReason
    }
  }
  return 'user-cancel'
}