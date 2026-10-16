/**
 * Default forge capability tools (Phase 124): real operations a remote
 * agent can delegate. Every handler receives the server's working
 * directory; failures become error text, never throws.
 */

import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface ForgeToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface ForgeToolContext {
  cwd: string
}

export type ToolHandlerResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

function textResult(text: string, isError = false): ToolHandlerResult {
  return { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) }
}

function run(
  command: string,
  args: readonly string[],
  cwd: string,
  timeoutMs = 120_000,
): {
  ok: boolean
  output: string
} {
  const result = spawnSync(command, args, { cwd, encoding: 'utf-8', timeout: timeoutMs })
  if (result.error !== undefined && result.error.name === 'ENOENT') {
    return { ok: false, output: `${command} is not available on this machine` }
  }
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  return { ok: (result.status ?? 1) === 0, output: output.length > 0 ? output : '(no output)' }
}

const MAX_OUTPUT_CHARS = 8_000

function truncate(value: string): string {
  return value.length > MAX_OUTPUT_CHARS
    ? `${value.slice(0, MAX_OUTPUT_CHARS)}\n... (truncated)`
    : value
}

function forgeStatus(context: ForgeToolContext): ToolHandlerResult {
  return textResult(
    JSON.stringify({
      server: 'forge-mcp',
      capabilities: ['run_tests', 'git_diff', 'new_task', 'read_task_queue'],
      cwd: context.cwd,
      forgeVersion: '0.1.0',
    }),
  )
}

function runTests(context: ForgeToolContext, scope: string): ToolHandlerResult {
  const args = scope.length > 0 ? ['test', scope] : ['test']
  const outcome = run('bun', args, context.cwd, 300_000)
  const tail = outcome.output.split('\n').slice(-40).join('\n')
  const passed = /(^|\s)0 fail(\s|$)/.test(outcome.output)
  return textResult(`${passed ? 'PASS' : 'CHECK'}\n${tail}`, !outcome.ok)
}

function gitDiff(context: ForgeToolContext): ToolHandlerResult {
  const stat = run('git', ['diff', '--stat'], context.cwd)
  if (!stat.ok) return textResult(stat.output, true)
  return textResult(truncate(stat.output))
}

function taskQueuePath(context: ForgeToolContext): string {
  return join(context.cwd, '.forge', 'mcp-tasks.jsonl')
}

function newTask(context: ForgeToolContext, task: string): ToolHandlerResult {
  if (task.trim().length === 0) return textResult('task is empty', true)
  try {
    const queue = taskQueuePath(context)
    mkdirSync(join(context.cwd, '.forge'), { recursive: true })
    appendFileSync(queue, `${JSON.stringify({ task, createdAt: Date.now() })}\n`, 'utf-8')
    return textResult(`task queued at ${queue}`)
  } catch (error) {
    return textResult(
      `failed to queue task: ${error instanceof Error ? error.message : String(error)}`,
      true,
    )
  }
}

function readTaskQueue(context: ForgeToolContext): ToolHandlerResult {
  const queue = taskQueuePath(context)
  if (!existsSync(queue)) return textResult('(queue empty)')
  try {
    const lines = readFileSync(queue, 'utf-8')
      .split('\n')
      .filter((line) => line.length > 0)
    return textResult(lines.map((line) => JSON.stringify(JSON.parse(line) as object)).join('\n'))
  } catch (error) {
    return textResult(
      `queue unreadable: ${error instanceof Error ? error.message : String(error)}`,
      true,
    )
  }
}

export interface ForgeTool {
  definition: ForgeToolDefinition
  handler: (input: Record<string, unknown>, context: ForgeToolContext) => Promise<ToolHandlerResult>
}

/** The default capability set, parameterized by the server's working directory. */
export function defaultForgeTools(): ForgeTool[] {
  return [
    {
      definition: {
        name: 'forge_status',
        description: 'Report the forge MCP server status and capabilities.',
        inputSchema: { type: 'object', properties: {} },
      },
      handler: async (_input, context) => forgeStatus(context),
    },
    {
      definition: {
        name: 'run_tests',
        description:
          'Run the project test suite with bun in the forge workspace. Optional `scope` narrows the path.',
        inputSchema: {
          type: 'object',
          properties: { scope: { type: 'string', description: 'path filter, e.g. packages/core' } },
        },
      },
      handler: async (input, context) => runTests(context, String(input.scope ?? '')),
    },
    {
      definition: {
        name: 'git_diff',
        description: 'Show the current unstaged diff stat of the forge workspace.',
        inputSchema: { type: 'object', properties: {} },
      },
      handler: async (_input, context) => gitDiff(context),
    },
    {
      definition: {
        name: 'new_task',
        description: 'Queue a task for the forge agent to pick up (delegation).',
        inputSchema: {
          type: 'object',
          properties: { task: { type: 'string', description: 'what forge should do' } },
          required: ['task'],
        },
      },
      handler: async (input, context) => newTask(context, String(input.task ?? '')),
    },
    {
      definition: {
        name: 'read_task_queue',
        description: 'Read the queued forge tasks (delegation outbox).',
        inputSchema: { type: 'object', properties: {} },
      },
      handler: async (_input, context) => readTaskQueue(context),
    },
  ]
}
