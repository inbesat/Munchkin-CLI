import type { ForgeConfig } from '../config/schema'

/** Structural input: accepts provider configs without depending on @forge/ai. */
export interface ContextModelConfig {
  readonly capabilities: { readonly contextWindow: number; readonly maxTokens: number }
}

export interface TokenCounter {
  count(text: string): number
}

export class CharTokenCounter implements TokenCounter {
  count(text: string): number {
    return Math.ceil(text.length / 4)
  }
}

export interface ModelInfo {
  id?: string
  contextWindow: number
  maxOutputTokens: number
}

export interface ContextBudget {
  totalBudget: number
  used: number
  available: number
  usagePercent: number
  breakdown: BudgetBreakdown
  warning: BudgetWarning | null
}

export interface BudgetBreakdown {
  systemPrompt: number
  conversationHistory: number
  toolSchemas: number
  mcpToolSchemas: number
  reservedForResponse: number
  other: number
}

export interface BudgetWarning {
  level: 'info' | 'warning' | 'critical'
  message: string
  threshold: number
}

export interface ContextBudgeterOptions {
  modelInfo: ModelInfo
  config: ForgeConfig['context']
  tokenCounter?: TokenCounter
  systemPrompt?: string
  toolSchemas?: string
  mcpToolSchemas?: string
  conversationHistory?: string[]
}

const DEFAULT_RESERVED_RESPONSE_TOKENS = 8192
const WARNING_THRESHOLD = 0.8
const CRITICAL_THRESHOLD = 0.95

export class ContextBudgeter {
  private modelInfo: ModelInfo
  private config: ForgeConfig['context']
  private tokenCounter: TokenCounter
  private systemPrompt: string
  private toolSchemas: string
  private mcpToolSchemas: string
  private conversationHistory: string[]

  constructor(options: ContextBudgeterOptions) {
    this.modelInfo = options.modelInfo
    this.config = options.config
    this.tokenCounter = options.tokenCounter ?? new CharTokenCounter()
    this.systemPrompt = options.systemPrompt ?? ''
    this.toolSchemas = options.toolSchemas ?? ''
    this.mcpToolSchemas = options.mcpToolSchemas ?? ''
    this.conversationHistory = options.conversationHistory ?? []
  }

  getTotalBudget(): number {
    const configuredMax = this.config.maxTokens
    const modelMax = this.modelInfo.contextWindow
    return Math.min(configuredMax, modelMax)
  }

  getReservedResponseTokens(): number {
    return Math.min(
      DEFAULT_RESERVED_RESPONSE_TOKENS,
      Math.floor(this.modelInfo.maxOutputTokens * 1.5),
      Math.floor(this.getTotalBudget() * 0.25),
    )
  }

  calculateBreakdown(): BudgetBreakdown {
    const systemPromptTokens = this.tokenCounter.count(this.systemPrompt)
    const conversationHistoryTokens = this.conversationHistory.reduce(
      (sum, msg) => sum + this.tokenCounter.count(msg),
      0,
    )
    const toolSchemasTokens = this.tokenCounter.count(this.toolSchemas)
    const mcpToolSchemasTokens = this.tokenCounter.count(this.mcpToolSchemas)
    const reservedForResponse = this.getReservedResponseTokens()

    return {
      systemPrompt: systemPromptTokens,
      conversationHistory: conversationHistoryTokens,
      toolSchemas: toolSchemasTokens,
      mcpToolSchemas: mcpToolSchemasTokens,
      reservedForResponse,
      other: 0,
    }
  }

  calculateBudget(): ContextBudget {
    const breakdown = this.calculateBreakdown()
    const totalUsed =
      breakdown.systemPrompt +
      breakdown.conversationHistory +
      breakdown.toolSchemas +
      breakdown.mcpToolSchemas +
      breakdown.reservedForResponse

    const totalBudget = this.getTotalBudget()
    const available = Math.max(0, totalBudget - totalUsed)
    const usagePercent = totalBudget > 0 ? totalUsed / totalBudget : 0

    let warning: BudgetWarning | null = null
    if (usagePercent >= CRITICAL_THRESHOLD) {
      warning = {
        level: 'critical',
        message: `Context usage at ${Math.round(usagePercent * 100)}% — compaction imminent`,
        threshold: CRITICAL_THRESHOLD,
      }
    } else if (usagePercent >= WARNING_THRESHOLD) {
      warning = {
        level: 'warning',
        message: `Context usage at ${Math.round(usagePercent * 100)}% — approaching limit`,
        threshold: WARNING_THRESHOLD,
      }
    }

    return {
      totalBudget,
      used: totalUsed,
      available,
      usagePercent,
      breakdown,
      warning,
    }
  }

  updateSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt
  }

  updateToolSchemas(schemas: string): void {
    this.toolSchemas = schemas
  }

  updateMcpToolSchemas(schemas: string): void {
    this.mcpToolSchemas = schemas
  }

  addConversationMessage(message: string): void {
    this.conversationHistory.push(message)
  }

  setConversationHistory(messages: string[]): void {
    this.conversationHistory = messages
  }

  clearConversationHistory(): void {
    this.conversationHistory = []
  }

  shouldCompact(): boolean {
    const budget = this.calculateBudget()
    return budget.usagePercent >= this.config.compactionThreshold
  }

  getTokensUntilWarning(): number {
    const totalBudget = this.getTotalBudget()
    const warningThreshold = totalBudget * WARNING_THRESHOLD
    const budget = this.calculateBudget()
    return Math.max(0, Math.floor(warningThreshold - budget.used))
  }

  getTokensUntilCompact(): number {
    const totalBudget = this.getTotalBudget()
    const compactThreshold = totalBudget * this.config.compactionThreshold
    const budget = this.calculateBudget()
    return Math.max(0, Math.floor(compactThreshold - budget.used))
  }

  getTokensUntilCritical(): number {
    const totalBudget = this.getTotalBudget()
    const criticalThreshold = totalBudget * CRITICAL_THRESHOLD
    const budget = this.calculateBudget()
    return Math.max(0, Math.floor(criticalThreshold - budget.used))
  }

  estimateMessagesUntilWarning(avgMessageTokens: number): number {
    const tokensUntilWarning = this.getTokensUntilWarning()
    return Math.max(0, Math.floor(tokensUntilWarning / avgMessageTokens))
  }

  estimateMessagesUntilCompact(avgMessageTokens: number): number {
    const tokensUntilCompact = this.getTokensUntilCompact()
    return Math.max(0, Math.floor(tokensUntilCompact / avgMessageTokens))
  }

  getBudgetSummary(): string {
    const budget = this.calculateBudget()
    const breakdown = budget.breakdown

    const lines = [
      `Context Budget: ${budget.used.toLocaleString()} / ${budget.totalBudget.toLocaleString()} tokens (${Math.round(budget.usagePercent * 100)}%)`,
      `Available: ${budget.available.toLocaleString()} tokens`,
      '',
      'Breakdown:',
      `  System Prompt:       ${breakdown.systemPrompt.toLocaleString()} tokens`,
      `  Conversation:        ${breakdown.conversationHistory.toLocaleString()} tokens`,
      `  Tool Schemas:        ${breakdown.toolSchemas.toLocaleString()} tokens`,
      `  MCP Tool Schemas:    ${breakdown.mcpToolSchemas.toLocaleString()} tokens`,
      `  Reserved (Response): ${breakdown.reservedForResponse.toLocaleString()} tokens`,
      '',
    ]

    if (budget.warning) {
      lines.push(`⚠ ${budget.warning.message}`)
    } else if (budget.usagePercent >= 0.5) {
      lines.push(
        `Info: ${this.getTokensUntilWarning().toLocaleString()} tokens until warning threshold`,
      )
    }

    if (this.shouldCompact()) {
      lines.push(
        `🔄 Compaction recommended (${this.getTokensUntilCompact().toLocaleString()} tokens until auto-compact)`,
      )
    }

    return lines.join('\n')
  }

  static fromModelConfig(
    modelConfig: ContextModelConfig,
    forgeConfig: ForgeConfig['context'],
    options: Partial<ContextBudgeterOptions> = {},
  ): ContextBudgeter {
    return new ContextBudgeter({
      modelInfo: {
        contextWindow: modelConfig.capabilities.contextWindow,
        maxOutputTokens: modelConfig.capabilities.maxTokens,
      },
      config: forgeConfig,
      ...options,
    })
  }
}

export function createContextBudgeter(
  modelConfig: ContextModelConfig,
  forgeConfig: ForgeConfig['context'],
  options: Partial<ContextBudgeterOptions> = {},
): ContextBudgeter {
  return ContextBudgeter.fromModelConfig(modelConfig, forgeConfig, options)
}
