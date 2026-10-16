import { describe, expect, it } from 'bun:test'
import type { AgentChunk } from '@forge/core'
import { type AgentModel, assemblePrintPrompt, runPrintMode } from '../src/cli'

/** Scripted model: streams the queued text deltas, then finishes. */
function scriptedModel(responses: readonly string[]): AgentModel {
  let call = 0
  return {
    id: 'scripted-test',
    provider: 'scripted',
    config: { capabilities: { contextWindow: 100_000, maxTokens: 4096 } },
    async *stream(options: { messages: readonly unknown[] }): AsyncIterable<AgentChunk> {
      const response = responses[Math.min(call, responses.length - 1)] ?? ''
      call += 1
      const lastMessage = options.messages[options.messages.length - 1] as
        | { content?: string }
        | undefined
      void lastMessage
      const chunk: AgentChunk = { type: 'text-delta', delta: response }
      yield chunk
      const finish: AgentChunk = { type: 'finish', reason: 'stop' }
      yield finish
    },
  }
}

describe('assemblePrintPrompt (Phase 138)', () => {
  it('combines prompt + piped stdin with a separator', () => {
    const combined = assemblePrintPrompt('explain this code', 'const x = 1')
    expect(combined.ok).toBe(true)
    if (combined.ok) {
      expect(combined.prompt.startsWith('explain this code')).toBe(true)
      expect(combined.prompt).toContain('---')
      expect(combined.prompt).toContain('const x = 1')
    }
  })

  it('uses stdin as the prompt when no prompt is provided', () => {
    const fromStdin = assemblePrintPrompt('', 'piped source code')
    expect(fromStdin.ok).toBe(true)
    if (fromStdin.ok) expect(fromStdin.prompt).toBe('piped source code')
  })

  it('passes the prompt through when no stdin exists', () => {
    const promptOnly = assemblePrintPrompt('just this', undefined)
    expect(promptOnly.ok).toBe(true)
    if (promptOnly.ok) expect(promptOnly.prompt).toBe('just this')
  })

  it('rejects when both are empty', () => {
    expect(assemblePrintPrompt('', '').ok).toBe(false)
  })
})

describe('print mode - forge -p (Phase 137/138)', () => {
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

  it('piped stdin reaches the model as part of the effective prompt', async () => {
    let receivedPrompt = ''
    const model: AgentModel = {
      ...scriptedModel(['explained']),
      async *stream(options: { messages: readonly unknown[] }): AsyncIterable<AgentChunk> {
        const last = options.messages[options.messages.length - 1] as
          | { content?: string }
          | undefined
        receivedPrompt = last?.content ?? ''
        const chunk: AgentChunk = { type: 'text-delta', delta: 'explained' }
        yield chunk
        const finish: AgentChunk = { type: 'finish', reason: 'stop' }
        yield finish
      },
    }
    const code = await runPrintMode('explain this code', {
      model,
      stdin: 'const x = 1',
      write: () => {},
      errorWrite: () => {},
    })
    expect(code).toBe(0)
    expect(receivedPrompt).toContain('explain this code')
    expect(receivedPrompt).toContain('const x = 1')
  })

  it('piped-only input (empty prompt) becomes the prompt itself', async () => {
    let receivedPrompt = ''
    const model: AgentModel = {
      ...scriptedModel(['ok']),
      async *stream(options: { messages: readonly unknown[] }): AsyncIterable<AgentChunk> {
        const last = options.messages[options.messages.length - 1] as
          | { content?: string }
          | undefined
        receivedPrompt = last?.content ?? ''
        const chunk: AgentChunk = { type: 'text-delta', delta: 'ok' }
        yield chunk
        const finish: AgentChunk = { type: 'finish', reason: 'stop' }
        yield finish
      },
    }
    const code = await runPrintMode('', {
      model,
      stdin: 'the whole file',
      write: () => {},
      errorWrite: () => {},
    })
    expect(code).toBe(0)
    expect(receivedPrompt).toBe('the whole file')
  })

  it('--json emits parseable structured output (Phase 139)', async () => {
    const lines: string[] = []
    const code = await runPrintMode('what is 2+2', {
      model: scriptedModel(['4']),
      json: true,
      write: (line) => lines.push(line),
      errorWrite: () => {},
    })
    expect(code).toBe(0)
    expect(lines).toHaveLength(1)
    const parsed = JSON.parse(lines[0] ?? '{}') as {
      prompt: string
      response: string
      ok: boolean
      turns: number
      usage: { total: number }
    }
    expect(parsed.ok).toBe(true)
    expect(parsed.response).toBe('4')
    expect(parsed.prompt).toBe('what is 2+2')
    expect(typeof parsed.turns).toBe('number')
    expect(parsed.usage.total).toBe(0)
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

  it('empty prompt without stdin is rejected without running the loop', async () => {
    let loopRan = false
    const code = await runPrintMode('', {
      model: scriptedModel(['noop']),
      write: () => {},
      errorWrite: (line) => {
        if (line.includes('requires a prompt string')) loopRan = true
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
