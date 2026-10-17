import type { SessionEvent } from '../events'
import {
  type AutoCompactor,
  type CompactionOptions,
  type CompactionResult,
  createAutoCompactor,
} from './compaction'

export interface CompactCommandOptions extends CompactionOptions {
  events: SessionEvent[]
  focusInstruction?: string
}

export interface CompactCommandResult {
  success: boolean
  message: string
  compactionResult?: CompactionResult
  budgetSummary?: string
  error?: string
}

export class CompactCommand {
  private readonly compactor: AutoCompactor
  private events: SessionEvent[]
  private readonly focusInstruction?: string

  constructor(options: CompactCommandOptions) {
    this.events = [...options.events]
    this.focusInstruction = options.focusInstruction
    this.compactor = createAutoCompactor(options)
    this.compactor.shouldCompact(this.events)
  }

  async execute(focusInstruction = this.focusInstruction): Promise<CompactCommandResult> {
    const result = await this.compactor.compact(this.events, { force: true, focusInstruction })
    if (!result.success) {
      return {
        success: false,
        message: `Compaction not needed or failed: ${result.error}`,
        error: result.error,
        budgetSummary: this.getBudgetSummary(),
      }
    }
    this.events = [...this.events, result.compactionEvent]
    const budget = this.compactor.getBudgeter().calculateBudget()
    return {
      success: true,
      message: `Compaction complete. ${result.messagesRemoved} messages summarized into 1 summary message. Tokens saved: ${result.tokensSaved.toLocaleString()}. Usage: ${Math.round(budget.usagePercent * 100)}%`,
      compactionResult: result,
      budgetSummary: this.getBudgetSummary(),
    }
  }

  getBudgetSummary(): string {
    return this.compactor.getBudgeter().getBudgetSummary()
  }

  shouldCompact(): boolean {
    return this.compactor.shouldCompact(this.events)
  }
}

export async function runCompactCommand(
  options: CompactCommandOptions,
): Promise<CompactCommandResult> {
  return new CompactCommand(options).execute(options.focusInstruction)
}
