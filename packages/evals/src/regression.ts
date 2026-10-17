import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { EvalRunResult } from './runner'

/**
 * Phase 146: regression suite per release. A checked-in config pins the eval
 * tasks that must keep passing; a release is blocked when any pinned task
 * regresses (was passing in the baseline, now failing).
 */

export interface RegressionConfig {
  /** Built-in task ids pinned to run on every release. */
  tasks: string[]
  /** Last accepted pass state per task id. */
  baseline: Record<string, boolean>
}

export type RegressionStatus = 'ok' | 'regressed' | 'fixed' | 'new'

export interface RegressionResult {
  taskId: string
  baseline: boolean | undefined
  actual: boolean
  status: RegressionStatus
}

export interface RegressionReport {
  results: RegressionResult[]
  regressions: RegressionResult[]
  /** False when at least one pinned task regressed. */
  passed: boolean
}

/** Path of the checked-in config shipped with the package. */
export function defaultRegressionConfigPath(): string {
  return fileURLToPath(new URL('../regression.json', import.meta.url))
}

function isRegressionConfig(value: unknown): value is RegressionConfig {
  if (typeof value !== 'object' || value === null) return false
  const { tasks, baseline } = value as { tasks?: unknown; baseline?: unknown }
  if (!Array.isArray(tasks) || !tasks.every((task) => typeof task === 'string')) return false
  if (typeof baseline !== 'object' || baseline === null) return false
  return Object.values(baseline).every((state) => typeof state === 'boolean')
}

export async function loadRegressionConfig(file: string): Promise<RegressionConfig> {
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    throw new Error(
      `invalid regression config: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!isRegressionConfig(raw)) {
    throw new Error(
      'invalid regression config: expected { "tasks": string[], "baseline": Record<string, boolean> }',
    )
  }
  return raw
}

export async function saveRegressionConfig(file: string, config: RegressionConfig): Promise<void> {
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`)
}

export function compareToBaseline(
  config: RegressionConfig,
  results: readonly EvalRunResult[],
): RegressionReport {
  const compared = results.map((result): RegressionResult => {
    const baseline = config.baseline[result.taskId]
    const status: RegressionStatus =
      baseline === undefined
        ? 'new'
        : baseline && !result.passed
          ? 'regressed'
          : !baseline && result.passed
            ? 'fixed'
            : 'ok'
    return { taskId: result.taskId, baseline, actual: result.passed, status }
  })
  const regressions = compared.filter((result) => result.status === 'regressed')
  return { results: compared, regressions, passed: regressions.length === 0 }
}
