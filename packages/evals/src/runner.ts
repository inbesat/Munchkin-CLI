import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  type AgentModel,
  type AgentTool,
  type AgentUsage,
  type LoopStopReason,
  calculateCost,
  createDefaultFileAccessConfig,
  createEditTool,
  createGlobTool,
  createGrepTool,
  createReadTool,
  createWriteTool,
  runAgentLoop,
} from '@forge/core'
import { BUILTIN_TASKS, type EvalTask } from './tasks'

/**
 * Phase 145: the built-in eval runner. Runs a benchmark task against a model in
 * a fresh temp workspace, then verifies the workspace. Deterministic for a
 * given task + model; no network, no shared state between runs.
 */

export interface EvalRunOptions {
  task: EvalTask
  model: AgentModel
  /** Parent dir for the per-run temp workspace (default: OS temp dir). */
  workspaceRoot?: string
  maxIterations?: number
}

export interface EvalRunResult {
  taskId: string
  modelId: string
  passed: boolean
  /** Loop stop reason, or 'checker-error' when verification threw. */
  reason: LoopStopReason | 'checker-error'
  turns: number
  usage: AgentUsage
  /** Estimated USD cost for the run (model pricing table, fallback rate). */
  cost: number
  durationMs: number
  error?: string
}

export interface EvalSuiteOptions {
  model: AgentModel
  tasks?: readonly EvalTask[]
  workspaceRoot?: string
  onResult?: (result: EvalRunResult) => void
}

export interface EvalSuiteReport {
  modelId: string
  results: EvalRunResult[]
  passed: number
  failed: number
  /** passed / total (0 when the suite is empty). */
  completionRate: number
  totals: {
    turns: number
    inputTokens: number
    outputTokens: number
    cost: number
    durationMs: number
  }
}

/** File tools bound to the eval workspace; no bash (not needed, not portable). */
function createWorkspaceTools(workspace: string): AgentTool[] {
  const config = createDefaultFileAccessConfig(workspace)
  const tools = [
    createReadTool(config),
    createWriteTool(config),
    createEditTool(config),
    createGlobTool(config),
    createGrepTool(config),
  ]
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters as unknown as Record<string, unknown>,
    execute: async (args: Record<string, unknown>, signal?: AbortSignal): Promise<string> => {
      const result = await tool.execute(args, signal)
      if (!result.success) throw new Error(result.error ?? `${tool.name} failed`)
      return result.output ?? ''
    },
  }))
}

export async function runEvalTask(options: EvalRunOptions): Promise<EvalRunResult> {
  const { task, model } = options
  const started = Date.now()
  const workspace = await mkdtemp(join(options.workspaceRoot ?? tmpdir(), `forge-eval-${task.id}-`))
  try {
    for (const [file, content] of Object.entries(task.files)) {
      const target = join(workspace, file)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, content)
    }

    const prompt = `${task.prompt}\n\nWorkspace: ${workspace}\nUse absolute paths inside the workspace.`
    const result = await runAgentLoop({
      model,
      messages: [{ role: 'user', content: prompt, parts: [{ type: 'text', text: prompt }] }],
      tools: createWorkspaceTools(workspace),
      maxIterations: options.maxIterations ?? 20,
      permissionCheck: async () => true,
    })

    let checkerPassed = false
    let checkerError: string | undefined
    try {
      checkerPassed = await task.verify(workspace)
    } catch (error) {
      checkerError = error instanceof Error ? error.message : String(error)
    }

    const usage = result.usage
    const loopError = result.error !== undefined ? String(result.error) : undefined
    const failure = loopError ?? checkerError
    return {
      taskId: task.id,
      modelId: model.id,
      passed: checkerPassed && failure === undefined,
      reason: checkerError !== undefined ? 'checker-error' : result.reason,
      turns: result.turns,
      usage,
      cost: calculateCost(
        model.id,
        usage.input,
        usage.output,
        usage.cacheRead ?? 0,
        usage.cacheWrite ?? 0,
      ),
      durationMs: Date.now() - started,
      ...(failure !== undefined ? { error: failure } : {}),
    }
  } finally {
    try {
      await rm(workspace, { recursive: true, force: true })
    } catch {
      // best-effort cleanup (Windows can hold handles briefly)
    }
  }
}

export async function runEvalSuite(options: EvalSuiteOptions): Promise<EvalSuiteReport> {
  const tasks = options.tasks ?? BUILTIN_TASKS
  const results: EvalRunResult[] = []
  for (const task of tasks) {
    const result = await runEvalTask({
      task,
      model: options.model,
      ...(options.workspaceRoot !== undefined ? { workspaceRoot: options.workspaceRoot } : {}),
    })
    results.push(result)
    options.onResult?.(result)
  }
  const passed = results.filter((r) => r.passed).length
  return {
    modelId: options.model.id,
    results,
    passed,
    failed: results.length - passed,
    completionRate: results.length === 0 ? 0 : passed / results.length,
    totals: {
      turns: results.reduce((sum, r) => sum + r.turns, 0),
      inputTokens: results.reduce((sum, r) => sum + r.usage.input, 0),
      outputTokens: results.reduce((sum, r) => sum + r.usage.output, 0),
      cost: results.reduce((sum, r) => sum + r.cost, 0),
      durationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
    },
  }
}
