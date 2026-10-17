import { describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentChunk, AgentModel } from '@forge/core'
import { run } from '../cli'
import { runEvalCommand } from './command'

/** A model that writes `hello.txt` into the workspace announced in the prompt. */
function writingModel(id: string): AgentModel {
  let call = 0
  return {
    id,
    provider: 'scripted',
    config: { capabilities: { contextWindow: 100_000, maxTokens: 4096 } },
    stream(options) {
      call += 1
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

/** A model that only answers with text - solves nothing. */
function idleModel(id: string): AgentModel {
  return {
    id,
    provider: 'scripted',
    config: { capabilities: { contextWindow: 100_000, maxTokens: 4096 } },
    stream() {
      const chunks: AgentChunk[] = [
        { type: 'text-delta', delta: 'no idea' },
        { type: 'finish', reason: 'stop' },
      ]
      return (async function* () {
        for (const chunk of chunks) yield chunk
      })()
    },
  }
}

describe('runEvalCommand (Phase 145)', () => {
  it('lists the built-in tasks', async () => {
    const out: string[] = []
    const code = await runEvalCommand(['eval', 'list'], { write: (l) => out.push(l) })
    const text = out.join('\n')
    expect(code).toBe(0)
    expect(text).toContain('create-file')
    expect(text).toContain('fix-off-by-one')
    expect(text).toContain('rename-across-files')
  })

  it('runs a single task and reports JSON', async () => {
    const out: string[] = []
    const code = await runEvalCommand(['eval', 'run', '--task', 'create-file', '--json'], {
      write: (l) => out.push(l),
      model: writingModel('model-x'),
    })
    expect(code).toBe(0)
    const report = JSON.parse(out.join('\n'))
    expect(report.modelId).toBe('model-x')
    expect(report.results).toHaveLength(1)
    expect(report.results[0].taskId).toBe('create-file')
    expect(report.results[0].passed).toBe(true)
    expect(report.completionRate).toBe(1)
  })

  it('prints a human summary and exits 1 when a task fails', async () => {
    const out: string[] = []
    const code = await runEvalCommand(['eval', 'run', '--task', 'create-file'], {
      write: (l) => out.push(l),
      model: idleModel('model-x'),
    })
    const text = out.join('\n')
    expect(code).toBe(1)
    expect(text).toContain('FAIL')
    expect(text).toContain('0/1 passed')
  })

  it('rejects unknown task ids', async () => {
    const errors: string[] = []
    const code = await runEvalCommand(['eval', 'run', '--task', 'nope'], {
      write: () => {},
      errorWrite: (l) => errors.push(l),
      model: idleModel('model-x'),
    })
    expect(code).toBe(1)
    expect(errors.join('\n')).toContain('unknown task')
  })

  it('is reachable through the CLI dispatcher', async () => {
    const out: string[] = []
    const code = await run(['eval', 'list'], { write: (l) => out.push(l) })
    expect(code).toBe(0)
    expect(out.join('\n')).toContain('create-file')
  })
})

describe('runEvalCommand regress (Phase 146)', () => {
  function writeConfig(tasks: string[], baseline: Record<string, boolean>): string {
    const dir = mkdtempSync(join(tmpdir(), 'forge-regress-cmd-'))
    const file = join(dir, 'regression.json')
    writeFileSync(file, JSON.stringify({ tasks, baseline }))
    return file
  }

  it('passes when no pinned task regresses', async () => {
    const out: string[] = []
    const config = writeConfig(['create-file'], { 'create-file': true })
    const code = await runEvalCommand(['eval', 'regress', '--config', config, '--json'], {
      write: (l) => out.push(l),
      model: writingModel('model-x'),
    })
    expect(code).toBe(0)
    const parsed = JSON.parse(out.join('\n'))
    expect(parsed.regression.passed).toBe(true)
    expect(parsed.regression.results[0].status).toBe('ok')
    expect(parsed.suite.results[0].passed).toBe(true)
  })

  it('blocks when a pinned task regresses', async () => {
    const out: string[] = []
    const config = writeConfig(['create-file'], { 'create-file': true })
    const code = await runEvalCommand(['eval', 'regress', '--config', config, '--json'], {
      write: (l) => out.push(l),
      model: idleModel('model-x'),
    })
    expect(code).toBe(1)
    const parsed = JSON.parse(out.join('\n'))
    expect(parsed.regression.passed).toBe(false)
    expect(parsed.regression.regressions[0].taskId).toBe('create-file')
    expect(parsed.regression.regressions[0].status).toBe('regressed')
  })

  it('prints human-readable regression status', async () => {
    const out: string[] = []
    const config = writeConfig(['create-file'], { 'create-file': true })
    const code = await runEvalCommand(['eval', 'regress', '--config', config], {
      write: (l) => out.push(l),
      model: idleModel('model-x'),
    })
    const text = out.join('\n')
    expect(code).toBe(1)
    expect(text).toContain('REGRESSED  create-file')
    expect(text).toContain('regressions: 1')
  })

  it('rejects unknown tasks in the config', async () => {
    const errors: string[] = []
    const config = writeConfig(['nope'], {})
    const code = await runEvalCommand(['eval', 'regress', '--config', config], {
      write: () => {},
      errorWrite: (l) => errors.push(l),
      model: idleModel('model-x'),
    })
    expect(code).toBe(1)
    expect(errors.join('\n')).toContain('unknown task')
  })

  it('updates the baseline on request', async () => {
    const file = writeConfig(['create-file'], {})
    const out: string[] = []
    const code = await runEvalCommand(['eval', 'regress', '--config', file, '--update-baseline'], {
      write: (l) => out.push(l),
      model: writingModel('model-x'),
    })
    expect(code).toBe(0)
    const updated = JSON.parse(readFileSync(file, 'utf8'))
    expect(updated.baseline['create-file']).toBe(true)
    expect(out.join('\n')).toContain('baseline updated')
  })
})
