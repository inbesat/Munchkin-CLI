import { describe, expect, it } from 'bun:test'
import type { AgentChunk, AgentGenerateOptions, AgentModel, AgentTool } from '../agent/types'
import { spawnSubagent } from './spawn'

const PARENT_SECRET = 'PARENT_CONTEXT_MUST_NOT_LEAK'

/** Scripted model: yields the queued chunks per stream() call, records requests. */
function scriptedModel(turns: AgentChunk[][]): {
  model: AgentModel
  requests: AgentGenerateOptions[]
} {
  const requests: AgentGenerateOptions[] = []
  let call = 0
  const model: AgentModel = {
    id: 'test/model',
    provider: 'test',
    config: { capabilities: { contextWindow: 100000, maxTokens: 4096 } },
    stream(options) {
      const chunks = turns[Math.min(call, turns.length - 1)] ?? []
      call += 1
      requests.push(options)
      return (async function* () {
        for (const chunk of chunks) yield chunk
      })()
    },
  }
  return { model, requests }
}

const text = (delta: string): AgentChunk => ({ type: 'text-delta', delta })
const finishStop = (): AgentChunk => ({ type: 'finish', reason: 'stop' })
const toolCall = (id: string, name: string): AgentChunk => ({
  type: 'tool-call',
  toolCall: { id, name, args: {} },
})
const finishToolCall = (): AgentChunk => ({ type: 'finish', reason: 'tool-call' })

const readTool: AgentTool = {
  name: 'read',
  description: 'read a file',
  execute: async () => 'file body',
}

describe('spawnSubagent (Phase 93)', () => {
  it('runs an isolated loop and returns a single summary to the parent', async () => {
    const { model } = scriptedModel([[text('Task complete: found 3 files.'), finishStop()]])
    const result = await spawnSubagent({
      model,
      task: 'Count the files in /tmp.',
      systemPrompt: 'You are a focused subagent.',
    })
    expect(result.summary).toBe('Task complete: found 3 files.')
    expect(result.stopReason).toBe('complete')
    expect(result.turns).toBeGreaterThanOrEqual(1)
  })

  it('does not leak parent context into the child request', async () => {
    const { model, requests } = scriptedModel([[text('ok'), finishStop()]])
    await spawnSubagent({
      model,
      task: 'Child task.',
      systemPrompt: 'Child system prompt.',
    })
    const request = requests[0]
    expect(request).toBeDefined()
    // Isolation: the child sees its task and nothing else — no parameter
    // even exists to pass parent messages through.
    const serialized = JSON.stringify(request)
    expect(serialized).not.toContain(PARENT_SECRET)
    expect(request?.system).toBe('Child system prompt.')
    expect(request?.messages).toEqual([{ role: 'user', content: 'Child task.' }])
  })

  it('enforces the tool allowlist: only allowlisted tools are offered and executed', async () => {
    const { model, requests } = scriptedModel([
      [toolCall('t1', 'shared_secret_tool'), finishToolCall()],
      [text('Could not use the forbidden tool.'), finishStop()],
    ])
    const executed: string[] = []
    const spyTool: AgentTool = {
      name: 'shared_secret_tool',
      description: 'must never reach the child',
      execute: async () => {
        executed.push('shared_secret_tool')
        return 'LEAKED'
      },
    }
    const result = await spawnSubagent({
      model,
      task: 'Try the forbidden tool.',
      tools: [readTool, spyTool],
      allowedTools: ['read'],
    })
    expect(executed).toEqual([])
    for (const request of requests) {
      for (const definition of request.tools ?? []) {
        expect(definition.name).not.toBe('shared_secret_tool')
      }
    }
    expect(result.summary).toContain('Could not use')
  })

  it('only allowlisted tool definitions reach the model request', async () => {
    const { model, requests } = scriptedModel([[text('done'), finishStop()]])
    await spawnSubagent({ model, task: 'x', tools: [readTool], allowedTools: ['read'] })
    expect(requests[0]?.tools?.map((t) => t.name)).toEqual(['read'])
  })

  it('aborts a runaway subagent when maxIterations is exhausted', async () => {
    const { model } = scriptedModel([[toolCall('t1', 'read'), finishToolCall()]])
    const result = await spawnSubagent({
      model,
      task: 'Endless tool loop.',
      tools: [readTool],
      maxIterations: 2,
    })
    expect(result.stopReason).toBe('max-iterations')
  })

  it('propagates abort signals to the underlying loop', async () => {
    const controller = new AbortController()
    const { model, requests } = scriptedModel([[text('slow'), finishStop()]])
    await spawnSubagent({
      model,
      task: 'task',
      abortSignal: controller.signal,
    })
    expect(requests[0]?.abortSignal).toBeDefined()
    controller.abort()
  })
})
