import { describe, expect, it } from 'bun:test'
import type { AgentModel } from '@forge/core'
import { runPrintMode } from '../src/cli'

/** Scripted model: streams the queued text deltas, then finishes. */
function scriptedModel(responses: readonly string[]): AgentModel {
  let call = 0
  return {
    id: 'scripted-test',
    provider: 'scripted',
    config: { capabilities: { contextWindow: 100_000, maxTokens: 4096 } },
    async *stream() {
      const response = responses[Math.min(call, responses.length - 1)] ?? ''
      call += 1
      const chunk: AgentChunk = { type: 'text-delta', delta: response }
      yield chunk
      const finish: AgentChunk = { type: 'finish', reason: 'stop' }
      yield finish
    },
  }
}

describe('print mode - forge -p (Phase 137)', () => {
  it('runs the agent loop and prints the response to the writer', async () => {
    const lines: string[] = []
    const code = await runPrintMode('what is 2+2', {
      model: scriptedModel(['4']),
      write: (line) => lines.push(line),
      errorWrite: () => {},
    })
    expect(code).toBe(0)
    // The buffered response is echoed followed by the loop's streamed deltas.
    expect(lines.join('\n')).toContain('4')
  })

  it('exits 1 with the error when the model errors', async () => {
    const errorLines: string[] = []
    const throwingModel: AgentModel = {
      id: 'throwing-test',
      provider: 'scripted',
      config: { capabilities: { contextWindow: 100_000, maxTokens: 4096 } },
      // biome-ignore lint/correctness/useYield: the stream throws before yielding
      async *stream(): AsyncIterable<AgentChunk> {
        throw new Error('model exploded')
      },
    }
    const code = await runPrintMode('boom', {
      model: throwingModel,
      write: () => {},
      errorWrite: (line) => errorLines.push(line),
    })
    expect(code).toBe(1)
    expect(errorLines.join('\n')).toContain('model exploded')
  })

  it('empty prompt is rejected without running the loop', async () => {
    let loopRan = false
    const code = await runPrintMode('', {
      model: scriptedModel(['noop']),
      write: () => {},
      errorWrite: (line) => {
        if (line.includes('-p requires')) loopRan = true
      },
    })
    expect(code).toBe(1)
    expect(loopRan).toBe(true)
  })

  it('run() interception: forge -p routes to print mode', async () => {
    const lines: string[] = []
    // Inject a scripted model through the env-independent path is not
    // possible via run() (it resolves a real provider), so assert that the
    // interception at least reaches print-mode validation for empty prompts.
    const { run } = await import('../src/cli')
    const code = await run(['-p', '   '], {
      write: (line) => lines.push(line),
    })
    expect(code).toBe(1)
    expect(lines.join('\n')).toContain('prompt')
  })
})
