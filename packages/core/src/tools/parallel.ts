import { ErrorCode, ToolError } from '../errors'
import type { ToolResult } from './types'

/** A tool call to execute in parallel. */
export interface ParallelToolCall {
  /** Tool name to execute. */
  name: string
  /** Input arguments for the tool. */
  input: Record<string, unknown>
  /** Optional abort signal for this specific call. */
  signal?: AbortSignal
}

/** Result of a parallel tool call execution. */
export interface ParallelToolResult {
  /** The tool name that was executed. */
  name: string
  /** The tool result, or error if failed. */
  result: ToolResult
  /** Whether the call failed. */
  error?: boolean
}

/** Options for parallel execution. */
export interface ParallelExecutionOptions {
  /** Maximum number of concurrent tool executions. */
  maxConcurrency: number
  /** Whether to continue executing remaining calls if one fails. */
  continueOnError: boolean
  /** Timeout for each individual tool call (ms). */
  callTimeout?: number
}

/** Default execution options. */
const DEFAULT_OPTIONS: ParallelExecutionOptions = {
  maxConcurrency: 32,
  continueOnError: true,
  callTimeout: 120_000,
}

/**
 * Semaphore for limiting concurrent operations.
 */
export class Semaphore {
  private permits: number
  private waiters: Array<() => void> = []

  constructor(permits: number) {
    if (permits <= 0) {
      throw new Error('Semaphore permits must be positive')
    }
    this.permits = permits
  }

  /** Acquire a permit, waiting if necessary. */
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--
      return
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve)
    })
  }

  /** Release a permit, potentially unblocking a waiter. */
  release(): void {
    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift()!
      waiter()
    } else {
      this.permits++
    }
  }

  /** Current number of available permits. */
  get available(): number {
    return this.permits
  }

  /** Number of waiters. */
  get waiting(): number {
    return this.waiters.length
  }
}

/**
 * Execute multiple tool calls in parallel with bounded concurrency.
 *
 * @param calls - Array of tool calls to execute
 * @param executeFn - Function to execute a single tool call (e.g., registry.execute)
 * @param options - Parallel execution options
 * @returns Array of results in the same order as input calls
 */
export async function executeParallel(
  calls: ParallelToolCall[],
  executeFn: (
    name: string,
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<ToolResult>,
  options: Partial<ParallelExecutionOptions> = {},
): Promise<ParallelToolResult[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const semaphore = new Semaphore(opts.maxConcurrency)
  const results: ParallelToolResult[] = new Array(calls.length)

  // Track if we've hit a fatal error (for continueOnError=false)
  let fatalError: Error | null = null

  async function executeOne(index: number): Promise<void> {
    const call = calls[index]
    await semaphore.acquire()

    // Check for fatal error before starting
    if (fatalError) {
      semaphore.release()
      return
    }

    // Create timeout controller if needed
    const timeoutController = opts.callTimeout ? new AbortController() : null
    const timeoutId = timeoutController
      ? setTimeout(() => timeoutController!.abort(), opts.callTimeout)
      : null

    // Combine external abort signal with timeout
    const combinedSignal = call.signal
      ? (() => {
          const controller = new AbortController()
          call.signal!.addEventListener('abort', () => controller.abort())
          timeoutController?.signal.addEventListener('abort', () => controller.abort())
          return controller.signal
        })()
      : (timeoutController?.signal ?? undefined)

    try {
      // Check if we should stop due to fatal error
      if (fatalError) {
        semaphore.release()
        return
      }

      const result = await executeFn(call.name, call.input, combinedSignal)
      const isError = !result.success
      results[index] = { name: call.name, result, error: isError }

      if (!opts.continueOnError && isError && !fatalError) {
        fatalError = new Error(`Tool ${call.name} failed: ${result.error ?? 'Unknown error'}`)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      const isAbort =
        err instanceof Error && (err.name === 'AbortError' || errorMessage.includes('Aborted'))
      results[index] = {
        name: call.name,
        result: {
          success: false,
          error: errorMessage,
        },
        error: true,
      }
      if (!opts.continueOnError || isAbort) {
        if (!fatalError) {
          fatalError = isAbort
            ? new Error('Execution aborted')
            : err instanceof Error
              ? err
              : new Error(errorMessage)
        }
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
      semaphore.release()
    }
  }

  // Start all executions concurrently
  const promises = calls.map((_, i) => executeOne(i))
  await Promise.all(promises)

  // If there was a fatal error, throw it after all results are collected
  if (fatalError) {
    const err: Error = fatalError
    const message = String(err.message)
    throw new ToolError(
      ErrorCode.TOOL_EXECUTION_FAILED,
      `Parallel execution stopped: ${message}`,
      'parallel',
      { cause: err },
    )
  }

  return results
}

/**
 * Execute tool calls in parallel using the registry's execute method.
 * Convenience wrapper for registry-based execution.
 */
export async function executeParallelWithRegistry(
  calls: ParallelToolCall[],
  registry: {
    execute: (
      name: string,
      input: Record<string, unknown>,
      signal?: AbortSignal,
    ) => Promise<ToolResult>
  },
  options: Partial<ParallelExecutionOptions> = {},
): Promise<ParallelToolResult[]> {
  return executeParallel(
    calls,
    (name, input, signal) => registry.execute(name, input, signal),
    options,
  )
}

/** Create a default parallel executor with the registry. */
export function createParallelExecutor(
  registry: {
    execute: (
      name: string,
      input: Record<string, unknown>,
      signal?: AbortSignal,
    ) => Promise<ToolResult>
  },
  defaultOptions?: Partial<ParallelExecutionOptions>,
) {
  return {
    execute: (calls: ParallelToolCall[], options?: Partial<ParallelExecutionOptions>) =>
      executeParallelWithRegistry(calls, registry, { ...defaultOptions, ...options }),
  }
}

/** Result summary for parallel execution. */
export interface ParallelExecutionSummary {
  total: number
  succeeded: number
  failed: number
  results: ParallelToolResult[]
}

/** Summarize parallel execution results. */
export function summarizeParallelResults(results: ParallelToolResult[]): ParallelExecutionSummary {
  return {
    total: results.length,
    succeeded: results.filter((r) => !r.error).length,
    failed: results.filter((r) => r.error).length,
    results,
  }
}
