import { describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentChunk, AgentModel } from '@forge/core'
import { runEvalSuite, runEvalTask } from './runner'
import type { EvalTask } from './tasks'

/** Deterministic model: each stream() call yields the next scripted turn. */
function scriptedModel(id: string, turns: AgentChunk[][]): AgentModel {
  let call = 0
  return {
    id,
    provider: 'scripted',
    config: { capabilities: { contextWindow: 100_000, maxTokens: 4096 } },
    stream() {
      const chunks = turns[call++] ?? [
        { type: 'text-delta', delta: 'done' },
        { type: 'finish', reason: 'stop' },
      ]
      return (async function* () {
        for (const chunk of chunks) yield chunk
      })()
    },
  }
}

/** A model that writes `hello.txt` into the workspace announced in the prompt. */
function writingModel(id: string): AgentModel {
  const calls = new Map<string, number>()
  return {
    id,
    provider: 'scripted',
    config: { capabilities: { contextWindow: 100_000, maxTokens: 4096 } },
    stream(options) {
      const prompt = options.messages[0]?.content ?? ''
      const workspace = /Workspace: (.+)/.exec(prompt)?.[1]?.trim() ?? ''
      const call = (calls.get(workspace) ?? 0) + 1
      calls.set(workspace, call)
      if (call === 1) {
        const prompt = options.messages[0]?.content ?? ''
        const workspace = /Workspace: (.+)/.exec(prompt)?.[1]?.trim() ?? ''
        const chunks: AgentChunk[] = [
          {
            type: 'tool-call',
            toolCall: {
              id: 'c1',
              name: 'write',
              args: { path: `${workspace}/hello.txt`, content: 'hello forge\n' },
            },
          },
          { type: 'usage', usage: { input: 100, output: 20, total: 120 } },
          { type: 'finish', reason: 'tool-call' },
        ]
        return (async function* () {
          for (const chunk of chunks) yield chunk
        })()
      }
      const chunks: AgentChunk[] = [
        { type: 'text-delta', delta: 'done' },
        { type: 'usage', usage: { input: 50, output: 10, total: 60 } },
        { type: 'finish', reason: 'stop' },
      ]
      return (async function* () {
        for (const chunk of chunks) yield chunk
      })()
    },
  }
}

const createFileTask: EvalTask = {
  id: 'inline-create',
  description: 'inline test task',
  prompt: 'Create hello.txt with "hello forge".',
  files: {},
  verify: async (workspace) =>
    (await readFile(join(workspace, 'hello.txt'), 'utf8')).trim() === 'hello forge',
}

const existsTask: EvalTask = {
  id: 'inline-exists',
  description: 'inline existence task',
  prompt: 'Create hello.txt.',
  files: {},
  verify: (workspace) => existsSync(join(workspace, 'hello.txt')),
}

describe('runEvalTask (Phase 145)', () => {
  it('passes a task when the model writes the verified file', async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'forge-eval-root-'))
    const result = await runEvalTask({
      task: createFileTask,
      model: writingModel('model-x'),
      workspaceRoot,
    })
    expect(result.taskId).toBe('inline-create')
    expect(result.modelId).toBe('model-x')
    expect(result.passed).toBe(true)
    expect(result.reason).toBe('complete')
    expect(result.turns).toBe(2)
    expect(result.usage.input).toBe(150)
    expect(result.usage.output).toBe(30)
    expect(result.cost).toBeGreaterThan(0)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    // Workspace is cleaned up after the run.
    expect(readdirSync(workspaceRoot)).toEqual([])
    cleanupDir(workspaceRoot)
  })

  it('fails a task when the model does nothing', async () => {
    const result = await runEvalTask({ task: existsTask, model: scriptedModel('idle', []) })
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('complete')
    expect(result.turns).toBe(1)
  })

  it('reports checker errors as failures', async () => {
    const throwing: EvalTask = {
      ...existsTask,
      id: 'inline-throws',
      verify: () => {
        throw new Error('checker exploded')
      },
    }
    const result = await runEvalTask({ task: throwing, model: scriptedModel('idle', []) })
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('checker-error')
    expect(result.error).toContain('checker exploded')
  })
})

describe('runEvalSuite (Phase 145)', () => {
  it('aggregates results, metrics, and completion rate', async () => {
    const seen: string[] = []
    const report = await runEvalSuite({
      model: writingModel('model-x'),
      tasks: [createFileTask, existsTask],
      onResult: (r) => seen.push(r.taskId),
    })
    expect(report.modelId).toBe('model-x')
    expect(report.results).toHaveLength(2)
    expect(report.passed).toBe(2)
    expect(report.failed).toBe(0)
    expect(report.completionRate).toBe(1)
    expect(report.totals.turns).toBe(4)
    expect(report.totals.inputTokens).toBe(300)
    expect(report.totals.outputTokens).toBe(60)
    expect(report.totals.cost).toBeGreaterThan(0)
    expect(seen).toEqual(['inline-create', 'inline-exists'])
  })

  it('is reproducible: same task + same model yields identical results', async () => {
    const first = await runEvalSuite({ model: writingModel('model-x'), tasks: [createFileTask] })
    const second = await runEvalSuite({ model: writingModel('model-x'), tasks: [createFileTask] })
    const strip = (r: (typeof first.results)[number]) => ({
      taskId: r.taskId,
      passed: r.passed,
      reason: r.reason,
      turns: r.turns,
      usage: r.usage,
      cost: r.cost,
    })
    expect(second.results.map(strip)).toEqual(first.results.map(strip))
    expect(second.completionRate).toBe(first.completionRate)
  })
})

function cleanupDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // best-effort cleanup (Windows can hold handles briefly)
  }
}
