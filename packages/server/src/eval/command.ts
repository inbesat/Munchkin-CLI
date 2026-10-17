import type { AgentModel } from '@forge/core'
import {
  BUILTIN_TASKS,
  type RegressionConfig,
  compareToBaseline,
  defaultRegressionConfigPath,
  loadRegressionConfig,
  runEvalSuite,
  saveRegressionConfig,
} from '@forge/evals'

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
 * time; `regress` (Phase 146) runs the pinned regression tasks and exits 1 when
 * a task that passed in the baseline now fails, blocking the release.
 */
export async function runEvalCommand(
  rawArgv: string[],
  opts: EvalCommandOptions = {},
): Promise<number> {
  const write = opts.write ?? ((line: string) => process.stdout.write(`${line}\n`))
  const errorWrite = opts.errorWrite ?? ((line: string) => process.stderr.write(`${line}\n`))
  const argv = rawArgv[0] === 'eval' ? rawArgv.slice(1) : rawArgv
  const sub = argv[0] ?? 'run'
  const json = argv.includes('--json')

  if (sub === 'list') {
    for (const task of BUILTIN_TASKS) write(`${task.id.padEnd(24)}${task.description}`)
    return 0
  }

  const known = new Set(BUILTIN_TASKS.map((t) => t.id))

  if (sub === 'run') {
    const taskIds = collectFlag(argv, '--task')
    const unknown = taskIds.filter((id) => !known.has(id))
    if (unknown.length > 0) {
      errorWrite(`error: unknown task(s): ${unknown.join(', ')} (see \`forge eval list\`)`)
      return 1
    }
    const tasks =
      taskIds.length > 0 ? BUILTIN_TASKS.filter((t) => taskIds.includes(t.id)) : undefined

    const model = await resolveEvalModel(opts, argv, errorWrite)
    if (model === undefined) return 1

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

  if (sub === 'regress') {
    const configPath = collectFlag(argv, '--config')[0] ?? defaultRegressionConfigPath()
    let config: RegressionConfig
    try {
      config = await loadRegressionConfig(configPath)
    } catch (error) {
      errorWrite(`error: ${error instanceof Error ? error.message : String(error)}`)
      return 1
    }
    const unknown = config.tasks.filter((id) => !known.has(id))
    if (unknown.length > 0) {
      errorWrite(
        `error: unknown task(s) in regression config: ${unknown.join(', ')} (see \`forge eval list\`)`,
      )
      return 1
    }
    const tasks = BUILTIN_TASKS.filter((t) => config.tasks.includes(t.id))

    const model = await resolveEvalModel(opts, argv, errorWrite)
    if (model === undefined) return 1

    const suite = await runEvalSuite(
      json
        ? { model, tasks }
        : {
            model,
            tasks,
            onResult: (r) =>
              write(
                `${r.passed ? 'PASS' : 'FAIL'}  ${r.taskId.padEnd(24)}${r.turns} turns  ${r.usage.total} tokens  ${(r.durationMs / 1000).toFixed(1)}s`,
              ),
          },
    )
    const report = compareToBaseline(config, suite.results)

    if (argv.includes('--update-baseline')) {
      const baseline: Record<string, boolean> = { ...config.baseline }
      for (const result of report.results) baseline[result.taskId] = result.actual
      await saveRegressionConfig(configPath, { tasks: config.tasks, baseline })
      write(`baseline updated: ${configPath}`)
      return 0
    }

    if (json) {
      write(JSON.stringify({ regression: report, suite }, null, 2))
    } else {
      for (const result of report.results) {
        const note =
          result.status === 'regressed'
            ? ' (was pass, now fail)'
            : result.status === 'fixed'
              ? ' (was fail, now pass)'
              : ''
        write(`${result.status.toUpperCase().padEnd(11)}${result.taskId}${note}`)
      }
      write('')
      write(`model: ${suite.modelId}`)
      write(
        `regressions: ${report.regressions.length}/${report.results.length} · tasks ${suite.passed}/${suite.results.length} passed · cost $${suite.totals.cost.toFixed(4)} · time ${(suite.totals.durationMs / 1000).toFixed(1)}s`,
      )
    }
    return report.passed ? 0 : 1
  }

  errorWrite(`error: unknown eval subcommand '${sub}' (expected 'run', 'list', or 'regress')`)
  return 1
}

/** Resolve the eval model: injected (tests), `--model`, `$FORGE_MODEL`, or env keys. */
async function resolveEvalModel(
  opts: EvalCommandOptions,
  argv: string[],
  errorWrite: (line: string) => void,
): Promise<AgentModel | undefined> {
  if (opts.model !== undefined) return opts.model
  try {
    const { createModelResolver } = await import('../services/model-resolver')
    const resolve = createModelResolver({
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      openaiApiKey: process.env.OPENAI_API_KEY,
      googleApiKey: process.env.GOOGLE_API_KEY,
    })
    return await resolve(
      collectFlag(argv, '--model')[0] ??
        opts.modelId ??
        process.env.FORGE_MODEL ??
        'claude-sonnet-4-6',
    )
  } catch (error) {
    errorWrite(`error: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

function collectFlag(argv: string[], flag: string): string[] {
  const values: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1]
    if (argv[i] === flag && value !== undefined && !value.startsWith('--')) values.push(value)
  }
  return values
}
