import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { type ForgeStats, ensureTokenUsageTable, gatherStats, openDatabase } from '@forge/core'

export interface StatsCommandOptions {
  write?: (line: string) => void
}

/**
 * `forge stats` (Phase 143). Local usage dashboard over the on-disk session
 * store: session counts, cost totals/by-model/by-day, tool usage. Table by
 * default, `--json` for automation. Read-only: a missing database prints an
 * empty report instead of creating files.
 */
export async function runStatsCommand(
  rawArgv: string[],
  opts: StatsCommandOptions = {},
): Promise<number> {
  const write = opts.write ?? ((l) => process.stdout.write(`${l}\n`))
  const argv = rawArgv[0] === 'stats' ? rawArgv.slice(1) : rawArgv
  const json = argv.includes('--json')
  const baseDir = flagValue(argv, '--base-dir') ?? join(process.cwd(), '.forge')
  const dbPath = flagValue(argv, '--db') ?? join(baseDir, 'forge.db')

  if (!existsSync(dbPath)) {
    if (json) {
      write(JSON.stringify(emptyStats(), null, 2))
    } else {
      write(`No usage data yet (${dbPath} not found). Run a session first.`)
    }
    return 0
  }

  const db = openDatabase(dbPath)
  try {
    ensureTokenUsageTable(db)
    const stats = await gatherStats({ db, baseDir })
    if (json) {
      write(JSON.stringify(stats, null, 2))
    } else {
      for (const line of formatStats(stats, baseDir)) write(line)
    }
    return 0
  } finally {
    db.close()
  }
}

function flagValue(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag)
  if (idx < 0) return undefined
  const value = argv[idx + 1]
  return value !== undefined && !value.startsWith('--') ? value : undefined
}

function emptyStats(): ForgeStats {
  return {
    sessions: { total: 0, active: 0, avgDurationMs: null, avgEvents: null },
    cost: {
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cache_read_tokens: 0,
      total_cache_write_tokens: 0,
      total_cost: 0,
      call_count: 0,
    },
    costByModel: [],
    costByDay: [],
    toolUsage: [],
  }
}

function formatStats(stats: ForgeStats, baseDir: string): string[] {
  const lines: string[] = [`forge stats - ${baseDir}`, '']

  lines.push('Sessions')
  lines.push(`  ${'total'.padEnd(14)}${stats.sessions.total}`)
  lines.push(`  ${'active'.padEnd(14)}${stats.sessions.active}`)
  lines.push(`  ${'avg duration'.padEnd(14)}${formatDuration(stats.sessions.avgDurationMs)}`)
  lines.push(
    `  ${'avg events'.padEnd(14)}${stats.sessions.avgEvents === null ? 'n/a' : stats.sessions.avgEvents.toFixed(1)}`,
  )
  lines.push('')

  lines.push('Cost')
  lines.push(`  ${'total'.padEnd(14)}${formatCost(stats.cost.total_cost)}`)
  lines.push(`  ${'calls'.padEnd(14)}${stats.cost.call_count}`)
  lines.push(`  ${'input tokens'.padEnd(14)}${stats.cost.total_input_tokens}`)
  lines.push(`  ${'output tokens'.padEnd(14)}${stats.cost.total_output_tokens}`)
  lines.push('')

  lines.push('Cost by model')
  if (stats.costByModel.length === 0) {
    lines.push('  (none recorded)')
  } else {
    lines.push(`  ${'MODEL'.padEnd(28)}${'PROVIDER'.padEnd(14)}${'COST'.padEnd(11)}CALLS`)
    for (const m of stats.costByModel) {
      lines.push(
        `  ${m.model.padEnd(28)}${m.provider.padEnd(14)}${formatCost(m.cost).padEnd(11)}${m.call_count}`,
      )
    }
  }
  lines.push('')

  lines.push('Cost by day')
  if (stats.costByDay.length === 0) {
    lines.push('  (none recorded)')
  } else {
    lines.push(`  ${'DATE'.padEnd(14)}${'COST'.padEnd(11)}CALLS`)
    for (const d of stats.costByDay) {
      lines.push(`  ${d.date.padEnd(14)}${formatCost(d.cost).padEnd(11)}${d.call_count}`)
    }
  }
  lines.push('')

  lines.push('Tool usage')
  if (stats.toolUsage.length === 0) {
    lines.push('  (none recorded)')
  } else {
    lines.push(`  ${'TOOL'.padEnd(20)}CALLS`)
    for (const t of stats.toolUsage) {
      lines.push(`  ${t.tool.padEnd(20)}${t.calls}`)
    }
  }
  return lines
}

function formatDuration(ms: number | null): string {
  if (ms === null) return 'n/a'
  if (ms < 1000) return `${Math.round(ms)}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${Math.round(seconds - minutes * 60)}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes - hours * 60}m`
}

function formatCost(value: number): string {
  return `$${value.toFixed(4)}`
}
