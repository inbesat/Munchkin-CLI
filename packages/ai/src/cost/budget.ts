import { dayKey, monthKey } from './engine'
import type { CostEngine } from './engine'

/**
 * Budget alerts on top of the cost engine. Daily and monthly ceilings are
 * matched against the engine's respective time buckets; a session ceiling
 * against one session's total. Warnings fire when usage passes `warnAt`
 * (default 1.0 = the ceiling itself), and `shouldBlock()` reports whether any
 * hard ceiling has been reached.
 */

export interface BudgetLimits {
  /** USD ceiling for the current calendar day. */
  daily?: number
  /** USD ceiling for the current calendar month. */
  monthly?: number
  /** USD ceiling for a single session's lifetime spend. */
  session?: number
}

export interface BudgetHooks {
  onWarn?: (warnings: readonly string[]) => void
}

export interface BudgetMonitorOptions extends BudgetHooks {
  /** Fraction of a limit at which a soft warning fires (default 1.0). */
  warnAt?: number
  /** Session id used for the `session` bucket. */
  sessionId?: string
}

export interface BudgetStatus {
  limits: BudgetLimits
  used: { daily: number; monthly: number; session: number }
  remaining: { daily: number; monthly: number; session: number }
  exceeded: { daily: boolean; monthly: boolean; session: boolean }
  warnings: readonly string[]
  ok: boolean
}

type Kind = 'daily' | 'monthly' | 'session'

export function createBudgetMonitor(
  engine: CostEngine,
  limits: BudgetLimits,
  options: BudgetMonitorOptions = {},
): {
  check(now?: Date): BudgetStatus
  shouldBlock(now?: Date): boolean
} {
  const warnAt = Math.max(0, Math.min(options.warnAt ?? 1, 1))

  function bucket(kind: Kind, now: Date): number {
    switch (kind) {
      case 'daily':
        return engine.byDay()[dayKey(now.getTime())]?.cost ?? 0
      case 'monthly':
        return engine.byMonth()[monthKey(now.getTime())]?.cost ?? 0
      case 'session':
        return options.sessionId ? engine.bySessionId(options.sessionId).cost : 0
    }
  }

  function check(now: Date = new Date()): BudgetStatus {
    const used = {
      daily: bucket('daily', now),
      monthly: bucket('monthly', now),
      session: bucket('session', now),
    }
    const remaining = {
      daily: (limits.daily ?? used.daily) - used.daily,
      monthly: (limits.monthly ?? used.monthly) - used.monthly,
      session: (limits.session ?? used.session) - used.session,
    }
    const exceeded = {
      daily: limits.daily !== undefined && used.daily >= limits.daily,
      monthly: limits.monthly !== undefined && used.monthly >= limits.monthly,
      session: limits.session !== undefined && used.session >= limits.session,
    }

    const warnings: string[] = []
    const kinds: Kind[] = ['daily', 'monthly', 'session']
    for (const kind of kinds) {
      const limit = limits[kind]
      if (limit === undefined) continue
      const amount = used[kind]
      if (amount >= limit) {
        warnings.push(`${kind} budget exceeded: $${amount.toFixed(4)} used of $${limit.toFixed(4)}`)
      } else if (amount >= limit * warnAt) {
        warnings.push(
          `${kind} budget at ${((amount / limit) * 100).toFixed(1)}% of $${limit.toFixed(4)}`,
        )
      }
    }

    const status: BudgetStatus = {
      limits: { ...limits },
      used,
      remaining,
      exceeded,
      warnings,
      ok: !exceeded.daily && !exceeded.monthly && !exceeded.session,
    }
    if (status.warnings.length > 0) options.onWarn?.(status.warnings)
    return status
  }

  return {
    check,
    shouldBlock(now) {
      const status = check(now)
      return status.exceeded.daily || status.exceeded.monthly || status.exceeded.session
    },
  }
}
