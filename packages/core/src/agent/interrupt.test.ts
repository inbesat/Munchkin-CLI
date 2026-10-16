import { beforeEach, describe, expect, it } from 'bun:test'
import {
  InterruptController,
  type InterruptReason,
  createLinkedAbortSignal,
  interruptReasonFromSignal,
  withInterrupt,
  withInterruptIterator,
} from './interrupt'

describe('InterruptController', () => {
  let controller: InterruptController

  beforeEach(() => {
    controller = new InterruptController()
  })

  describe('basic state', () => {
    it('starts in non-interrupted state', () => {
      expect(controller.isInterrupted()).toBe(false)
      expect(controller.getState().requested).toBe(false)
    })

    it('provides an abort signal', () => {
      const signal = controller.signal
      expect(signal).toBeInstanceOf(AbortSignal)
      expect(signal.aborted).toBe(false)
    })

    it('resets to initial state', () => {
      controller.requestInterrupt('user-cancel')
      controller.reset()
      expect(controller.isInterrupted()).toBe(false)
      expect(controller.getState().reason).toBeUndefined()
    })
  })

  describe('requestInterrupt', () => {
    it('sets interrupted state and reason', () => {
      controller.requestInterrupt('user-cancel')
      expect(controller.isInterrupted()).toBe(true)
      expect(controller.getState().reason).toBe('user-cancel')
      expect(controller.signal.aborted).toBe(true)
      expect(controller.signal.reason).toBe('user-cancel')
    })

    it('calls onInterrupt callback', () => {
      const reasons: InterruptReason[] = []
      controller = new InterruptController({
        onInterrupt: (r) => reasons.push(r),
      })
      controller.requestInterrupt('timeout')
      expect(reasons).toEqual(['timeout'])
    })

    it('is idempotent', () => {
      controller.requestInterrupt('user-cancel')
      controller.requestInterrupt('timeout')
      expect(controller.getState().reason).toBe('user-cancel')
    })
  })

  describe('tool tracking', () => {
    it('tracks active tools', () => {
      expect(controller.getState().activeTools).toBe(0)
      controller.registerToolStart()
      expect(controller.getState().activeTools).toBe(1)
      controller.registerToolStart()
      expect(controller.getState().activeTools).toBe(2)
      controller.registerToolEnd()
      expect(controller.getState().activeTools).toBe(1)
      controller.registerToolEnd()
      expect(controller.getState().activeTools).toBe(0)
    })

    it('does not go below zero', () => {
      controller.registerToolEnd()
      expect(controller.getState().activeTools).toBe(0)
    })
  })

  describe('waitForTools', () => {
    it('resolves immediately when no active tools', async () => {
      const result = await controller.waitForTools()
      expect(result.interrupted).toBe(false)
      expect(result.toolsCompleted).toBe(true)
    })

    it('waits for tools to complete when waitForTools=true', async () => {
      controller = new InterruptController({ waitForTools: true, toolWaitTimeout: 100 })
      controller.registerToolStart()

      const promise = controller.waitForTools()
      controller.registerToolEnd()
      const result = await promise

      expect(result.toolsCompleted).toBe(true)
    })

    it('returns toolsCompleted=false when waitForTools=false', async () => {
      controller = new InterruptController({ waitForTools: false })
      controller.registerToolStart()
      const result = await controller.waitForTools()
      expect(result.toolsCompleted).toBe(false)
    })

    it('calls onToolsWaiting and onToolsCompleted callbacks', async () => {
      const events: string[] = []
      controller = new InterruptController({
        waitForTools: true,
        toolWaitTimeout: 50,
        onToolsWaiting: (count) => events.push(`waiting:${count}`),
        onToolsCompleted: () => events.push('completed'),
      })
      controller.registerToolStart()
      await controller.waitForTools()
      expect(events).toEqual(['waiting:1', 'completed'])
    })

    it('times out and returns toolsCompleted=false', async () => {
      controller = new InterruptController({ waitForTools: true, toolWaitTimeout: 10 })
      controller.registerToolStart()
      const result = await controller.waitForTools()
      expect(result.toolsCompleted).toBe(false)
    })
  })

  describe('withInterrupt', () => {
    it('runs operation and returns result', async () => {
      controller = new InterruptController()
      const { result, interrupt } = await withInterrupt(controller, async (signal) => {
        return 'success'
      })
      expect(result).toBe('success')
      expect(interrupt.toolsCompleted).toBe(true)
    })

    it('handles interrupt during operation', async () => {
      controller = new InterruptController()
      const { result, interrupt } = await withInterrupt(controller, async (signal) => {
        controller.requestInterrupt('user-cancel')
        await new Promise((r) => setTimeout(r, 10))
        return 'should not reach'
      })
      expect(result).toBeNull()
      expect(interrupt.interrupted).toBe(true)
    })

    it('handles thrown errors', async () => {
      controller = new InterruptController()
      await expect(
        withInterrupt(controller, async () => {
          throw new Error('operation failed')
        }),
      ).rejects.toThrow('operation failed')
    })
  })

  describe('withInterruptIterator', () => {
    it('yields items from async iterable', async () => {
      controller = new InterruptController()
      const items = [1, 2, 3]
      const iterable = {
        async *[Symbol.asyncIterator]() {
          for (const item of items) yield item
        },
      }

      const results: number[] = []
      for await (const item of withInterruptIterator(controller, iterable)) {
        results.push(item)
      }
      expect(results).toEqual([1, 2, 3])
    })

    it('stops iteration on interrupt', async () => {
      controller = new InterruptController()
      const iterable = {
        async *[Symbol.asyncIterator]() {
          for (let i = 0; i < 10; i++) {
            yield i
          }
        },
      }

      const results: number[] = []
      for await (const item of withInterruptIterator(controller, iterable)) {
        results.push(item)
        if (item === 2) controller.requestInterrupt('user-cancel')
      }
      expect(results).toEqual([0, 1, 2])
    })
  })

  describe('interruptReasonFromSignal', () => {
    it('extracts known reasons', () => {
      const c1 = new AbortController()
      c1.abort('timeout')
      expect(interruptReasonFromSignal(c1.signal)).toBe('timeout')

      const c2 = new AbortController()
      c2.abort('user-cancel')
      expect(interruptReasonFromSignal(c2.signal)).toBe('user-cancel')

      const c3 = new AbortController()
      c3.abort('context-overflow')
      expect(interruptReasonFromSignal(c3.signal)).toBe('context-overflow')
    })

    it('defaults to user-cancel for unknown reasons', () => {
      const controller = new AbortController()
      controller.abort('unknown-reason')
      expect(interruptReasonFromSignal(controller.signal)).toBe('user-cancel')
    })

    it('defaults to user-cancel when no reason', () => {
      const controller = new AbortController()
      controller.abort()
      expect(interruptReasonFromSignal(controller.signal)).toBe('user-cancel')
    })
  })
})

describe('createLinkedAbortSignal', () => {
  it('links multiple signals', () => {
    const s1 = new AbortController().signal
    const s2 = new AbortController().signal
    const linked = createLinkedAbortSignal(s1, s2)

    expect(linked.aborted).toBe(false)
  })

  it('aborts when any source aborts', () => {
    const c1 = new AbortController()
    const c2 = new AbortController()
    const linked = createLinkedAbortSignal(c1.signal, c2.signal)

    c1.abort('test')
    expect(linked.aborted).toBe(true)
    expect(linked.reason).toBe('test')

    const c3 = new AbortController()
    const c4 = new AbortController()
    const linked2 = createLinkedAbortSignal(c3.signal, c4.signal)
    c4.abort('other')
    expect(linked2.aborted).toBe(true)
    expect(linked2.reason).toBe('other')
  })

  it('handles undefined signals', () => {
    const s1 = new AbortController().signal
    const linked = createLinkedAbortSignal(s1, undefined, null as any)
    expect(linked.aborted).toBe(false)
  })

  it('immediately aborts if source already aborted', () => {
    const c1 = new AbortController()
    c1.abort('already')
    const linked = createLinkedAbortSignal(c1.signal)
    expect(linked.aborted).toBe(true)
    expect(linked.reason).toBe('already')
  })
})
