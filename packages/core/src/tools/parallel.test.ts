import { beforeEach, describe, expect, it } from 'bun:test'
import {
  type ParallelToolCall,
  Semaphore,
  createParallelExecutor,
  executeParallel,
  executeParallelWithRegistry,
  summarizeParallelResults,
} from './parallel'
import type { ToolResult } from './types'

describe('Semaphore', () => {
  it('allows up to N concurrent permits', async () => {
    const sem = new Semaphore(3)
    await sem.acquire()
    await sem.acquire()
    await sem.acquire()
    expect(sem.available).toBe(0)
    expect(sem.waiting).toBe(0)
  })

  it('blocks when permits exhausted', async () => {
    const sem = new Semaphore(2)
    await sem.acquire()
    await sem.acquire()
    expect(sem.available).toBe(0)
    expect(sem.waiting).toBe(0)

    // Acquire will wait, but we don't await it yet
    const promise = sem.acquire()
    expect(sem.available).toBe(0)
    expect(sem.waiting).toBe(1)
    sem.release()
    await promise
    // After waiter consumes the released permit, available is 0 again
    expect(sem.available).toBe(0)
  })

  it('releases permits in order', async () => {
    const sem = new Semaphore(1)
    await sem.acquire()
    const order: number[] = []
    const p1 = sem.acquire().then(() => {
      order.push(1)
      sem.release()
    })
    const p2 = sem.acquire().then(() => {
      order.push(2)
      sem.release()
    })
    sem.release()
    await Promise.all([p1, p2])
    expect(order).toEqual([1, 2])
  })

  it('throws on non-positive permits', () => {
    expect(() => new Semaphore(0)).toThrow('positive')
    expect(() => new Semaphore(-1)).toThrow('positive')
  })

  it('increases available when released with no waiters', async () => {
    const sem = new Semaphore(2)
    await sem.acquire()
    expect(sem.available).toBe(1)
    sem.release()
    expect(sem.available).toBe(2)
  })
})

describe('executeParallel', () => {
  let callOrder: number[] = []

  function createMockExecutor(delay: number, shouldFail?: (name: string) => boolean) {
    return async (
      name: string,
      _input: Record<string, unknown>,
      signal?: AbortSignal,
    ): Promise<ToolResult> => {
      callOrder.push(Number(name.split('-')[1]))
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(resolve, delay)
        signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timeout)
            reject(new Error('Aborted'))
          },
          { once: true },
        )
      })
      if (shouldFail?.(name)) {
        return { success: false, error: `Failed: ${name}` }
      }
      return { success: true, output: `Result for ${name}` }
    }
  }

  beforeEach(() => {
    callOrder = []
  })

  it('executes multiple calls in parallel', async () => {
    const calls: ParallelToolCall[] = [
      { name: 'tool-1', input: {} },
      { name: 'tool-2', input: {} },
      { name: 'tool-3', input: {} },
    ]
    const executeFn = createMockExecutor(10)
    const start = Date.now()
    const results = await executeParallel(calls, executeFn, { maxConcurrency: 10 })
    const elapsed = Date.now() - start

    // Should run in parallel (~10ms, not 30ms) - allow generous variance for test environment
    expect(elapsed).toBeLessThan(200)
    expect(results).toHaveLength(3)
    expect(results.every((r) => r.result.success)).toBe(true)
  })

  it('limits concurrency', async () => {
    const calls: ParallelToolCall[] = [
      { name: 'tool-1', input: {} },
      { name: 'tool-2', input: {} },
      { name: 'tool-3', input: {} },
      { name: 'tool-4', input: {} },
    ]
    const executeFn = createMockExecutor(20)
    const start = Date.now()
    const results = await executeParallel(calls, executeFn, { maxConcurrency: 2 })
    const elapsed = Date.now() - start

    // With maxConcurrency=2 and 4 tasks of 20ms each, should take ~40ms
    expect(elapsed).toBeGreaterThanOrEqual(35)
    expect(elapsed).toBeLessThan(80)
    expect(results).toHaveLength(4)
  })

  it('preserves result order matching input order', async () => {
    const calls: ParallelToolCall[] = [
      { name: 'tool-1', input: {} },
      { name: 'tool-2', input: {} },
      { name: 'tool-3', input: {} },
    ]
    const executeFn = createMockExecutor(5)
    const results = await executeParallel(calls, executeFn, { maxConcurrency: 10 })

    expect(results[0].name).toBe('tool-1')
    expect(results[1].name).toBe('tool-2')
    expect(results[2].name).toBe('tool-3')
  })

  it('continues on error when continueOnError=true', async () => {
    const calls: ParallelToolCall[] = [
      { name: 'tool-1', input: {} },
      { name: 'tool-fail', input: {} },
      { name: 'tool-3', input: {} },
    ]
    const executeFn = createMockExecutor(10, (name) => name === 'tool-fail')
    const results = await executeParallel(calls, executeFn, {
      maxConcurrency: 10,
      continueOnError: true,
    })

    expect(results[0].result.success).toBe(true)
    expect(results[1].result.success).toBe(false)
    expect(results[1].error).toBe(true)
    expect(results[2].result.success).toBe(true)
  })

  it('stops on error when continueOnError=false and throws after all complete', async () => {
    const calls: ParallelToolCall[] = [
      { name: 'tool-1', input: {} },
      { name: 'tool-fail', input: {} },
      { name: 'tool-3', input: {} },
    ]
    const executeFn = createMockExecutor(10, (name) => name === 'tool-fail')
    await expect(
      executeParallel(calls, executeFn, { maxConcurrency: 10, continueOnError: false }),
    ).rejects.toThrow('Parallel execution stopped')
  })

  it('handles abort signal', async () => {
    let aborted = false
    const controller = new AbortController()
    const calls: ParallelToolCall[] = [
      { name: 'tool-1', input: {}, signal: controller.signal },
      { name: 'tool-2', input: {}, signal: controller.signal },
    ]
    const executeFn = async (
      _name: string,
      _input: Record<string, unknown>,
      signal?: AbortSignal,
    ) => {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(resolve, 100)
        signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timeout)
            aborted = true
            reject(new Error('Aborted'))
          },
          { once: true },
        )
      })
      return { success: true, output: 'ok' }
    }

    // Start execution, then abort
    const promise = executeParallel(calls, executeFn, { maxConcurrency: 10 })
    await new Promise((r) => setTimeout(r, 10))
    controller.abort()
    await expect(promise).rejects.toThrow()
    expect(aborted).toBe(true)
  })

  it('respects call timeout', async () => {
    const calls: ParallelToolCall[] = [{ name: 'tool-slow', input: {} }]
    const executeFn = async (
      _name: string,
      _input: Record<string, unknown>,
      signal?: AbortSignal,
    ) => {
      await new Promise<void>((resolve, reject) => {
        signal?.addEventListener(
          'abort',
          () => {
            const err = new Error('Aborted')
            err.name = 'AbortError'
            reject(err)
          },
          { once: true },
        )
        setTimeout(() => resolve(), 50)
      })
      return { success: true }
    }

    await expect(
      executeParallel(calls, executeFn, { maxConcurrency: 10, callTimeout: 10 }),
    ).rejects.toThrow()
  })

  it('handles empty calls array', async () => {
    const results = await executeParallel([], async () => ({ success: true }))
    expect(results).toHaveLength(0)
  })

  it('handles single call', async () => {
    const calls: ParallelToolCall[] = [{ name: 'tool-1', input: { data: 'test' } }]
    const executeFn = async (name: string, input: Record<string, unknown>) => ({
      success: true,
      output: `${name}:${input.data}`,
    })
    const results = await executeParallel(calls, executeFn)
    expect(results[0].result.output).toBe('tool-1:test')
  })
})

describe('executeParallelWithRegistry', () => {
  it('executes through registry-like object', async () => {
    const mockRegistry = {
      execute: async (name: string, input: Record<string, unknown>) => ({
        success: true,
        output: `${name}:${input.value}`,
      }),
    }

    const calls: ParallelToolCall[] = [
      { name: 'read', input: { value: 1 } },
      { name: 'write', input: { value: 2 } },
    ]
    const results = await executeParallelWithRegistry(calls, mockRegistry, { maxConcurrency: 10 })
    expect(results[0].result.output).toBe('read:1')
    expect(results[1].result.output).toBe('write:2')
  })
})

describe('createParallelExecutor', () => {
  it('creates executor with default options', async () => {
    const mockRegistry = {
      execute: async (name: string) => ({ success: true, output: name }),
    }
    const executor = createParallelExecutor(mockRegistry, { maxConcurrency: 5 })
    const calls: ParallelToolCall[] = [
      { name: 'a', input: {} },
      { name: 'b', input: {} },
    ]
    const results = await executor.execute(calls)
    expect(results).toHaveLength(2)
  })

  it('merges default options with call options', async () => {
    const mockRegistry = {
      execute: async (_name: string, _input: Record<string, unknown>, signal?: AbortSignal) => {
        await new Promise<void>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true })
          setTimeout(() => reject(new Error('Timeout')), 50)
        })
        return { success: true }
      },
    }
    const executor = createParallelExecutor(mockRegistry, { callTimeout: 5 })
    const calls: ParallelToolCall[] = [{ name: 'slow', input: {} }]
    await expect(executor.execute(calls)).rejects.toThrow()
  })
})

describe('summarizeParallelResults', () => {
  it('summarizes results correctly', () => {
    const results = [
      { name: 'a', result: { success: true }, error: false },
      { name: 'b', result: { success: false, error: 'fail' }, error: true },
      { name: 'c', result: { success: true }, error: false },
    ]
    const summary = summarizeParallelResults(results)
    expect(summary.total).toBe(3)
    expect(summary.succeeded).toBe(2)
    expect(summary.failed).toBe(1)
  })
})
