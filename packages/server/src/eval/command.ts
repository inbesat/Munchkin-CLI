import type { AgentModel } from '@forge/core'
import { BUILTIN_TASKS, runEvalSuite } from '@forge/evals'

export interface EvalCommandOptions {
  write?: (line: string) => void
  errorWrite?: (line: string) => void
  /** Injectable model (tests); default resolves from env provider keys. */
  model?: AgentModel
  modelId?: string
}

/**
 * `forge eval` (Phase 145). `list` shows the built-in benchmark tasks; `run`
 * executes them against a model and reports completion rate, tokens, cost, and
 * time. Exits 1 when any task fails so CI (Phase 146) can gate on it.
 */
export async function runEvalCommand(
  rawArgv: string[],
  opts: EvalCommandOptions = {},
): Promise<number> {
  const write = opts.write ?? ((line: string) => process.stdout.write(`${line}\n`))
  const errorWrite = opts.errorWrite ?? ((line: string) => process.stderr.write(`${line}\n`))
  const argv = rawArgv[0] === 'eval' ? rawArgv.slice(1) : rawArgv
  const sub = argv[0] ?? 'run'

  if (sub === 'list') {
    for (const task of BUILTIN_TASKS) write(`${task.id.padEnd(24)}${task.description}`)
    return 0
  }
  if (sub !== 'run') {
    errorWrite(`error: unknown eval subcommand '${sub}' (expected 'run' or 'list')`)
    return 1
  }

  const known = new Set(BUILTIN_TASKS.map((t) => t.id))
  const taskIds = collectFlag(argv, '--task')
  const unknown = taskIds.filter((id) => !known.has(id))
  if (unknown.length > 0) {
    errorWrite(`error: unknown task(s): ${unknown.join(', ')} (see \`forge eval list\`)`)
    return 1
  }
  const tasks = taskIds.length > 0 ? BUILTIN_TASKS.filter((t) => taskIds.includes(t.id)) : undefined

  const json = argv.includes('--json')
  const modelFlag = collectFlag(argv, '--model')[0]
  let model = opts.model
  if (model === undefined) {
    try {
      const { createModelResolver } = await import('../services/model-resolver')
      const resolve = createModelResolver({
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        openaiApiKey: process.env.OPENAI_API_KEY,
        googleApiKey: process.env.GOOGLE_API_KEY,
      })
      model = await resolve(
        modelFlag ?? opts.modelId ?? process.env.FORGE_MODEL ?? 'claude-sonnet-4-6',
      )
    } catch (error) {
      errorWrite(`error: ${error instanceof Error ? error.message : String(error)}`)
      return 1
    }
  }

  const report = await runEvalSuite(
    json
      ? { model, ...(tasks !== undefined ? { tasks } : {}) }
      : {
          model,
          ...(tasks !== undefined ? { tasks } : {}),
          onResult: (r) =>
            write(
              `${r.passed ? 'PASS' : 'FAIL'}  ${r.taskId.padEnd(24)}${r.turns} turns  ${r.usage.total} tokens  $${r.cost.toFixed(4)}  ${(r.durationMs / 1000).toFixed(1)}s`,
            ),
        },
  )

  if (json) {
    write(JSON.stringify(report, null, 2))
  } else {
    write('')
    write(`model: ${report.modelId}`)
    write(
      `tasks: ${report.passed}/${report.results.length} passed (completion rate ${(report.completionRate * 100).toFixed(0)}%)`,
    )
    write(
      `tokens: ${report.totals.inputTokens} in / ${report.totals.outputTokens} out · cost $${report.totals.cost.toFixed(4)} · time ${(report.totals.durationMs / 1000).toFixed(1)}s`,
    )
  }
  return report.failed === 0 ? 0 : 1
}

function collectFlag(argv: string[], flag: string): string[] {
  const values: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1]
    if (argv[i] === flag && value !== undefined && !value.startsWith('--')) values.push(value)
  }
  return values
}
