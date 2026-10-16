import { beforeEach, describe, expect, it } from 'bun:test'
import type { ForgeConfig } from '../config/schema'
import { CharTokenCounter, type ContextBudgeter, createContextBudgeter } from './budget'

const mockModelConfig = {
  id: 'test/claude-sonnet',
  provider: 'anthropic',
  name: 'claude-sonnet-4',
  displayName: 'Claude Sonnet 4',
  capabilities: {
    text: true,
    thinking: true,
    toolCalls: true,
    structuredOutput: true,
    vision: true,
    pdf: true,
    maxTokens: 8192,
    contextWindow: 200000,
  },
  cost: {
    inputPerToken: 0.000003,
    outputPerToken: 0.000015,
  },
  defaultMaxTokens: 8192,
  supportsCacheControl: true,
}

const mockForgeConfig: ForgeConfig['context'] = {
  maxTokens: 200000,
  compactionThreshold: 0.8,
  keepRecentMessages: 10,
}

describe('ContextBudgeter', () => {
  let budgeter: ContextBudgeter

  beforeEach(() => {
    budgeter = createContextBudgeter(mockModelConfig, mockForgeConfig, {
      systemPrompt: 'You are a helpful assistant.',
      toolSchemas: JSON.stringify([
        { name: 'bash', description: 'Run shell commands', parameters: {} },
        { name: 'read', description: 'Read files', parameters: {} },
      ]),
      mcpToolSchemas: '',
      conversationHistory: [],
    })
  })

  it('calculates total budget as min of config and model context window', () => {
    expect(budgeter.getTotalBudget()).toBe(200000)
  })

  it('calculates reserved response tokens', () => {
    const reserved = budgeter.getReservedResponseTokens()
    expect(reserved).toBeLessThanOrEqual(8192)
    expect(reserved).toBeLessThanOrEqual(mockModelConfig.capabilities.maxTokens * 1.5)
    expect(reserved).toBeLessThanOrEqual(budgeter.getTotalBudget() * 0.25)
  })

  it('calculates breakdown with all components', () => {
    budgeter.setConversationHistory(['User: Hello', 'Assistant: Hi there!', 'User: How are you?'])

    const breakdown = budgeter.calculateBreakdown()
    expect(breakdown.systemPrompt).toBeGreaterThan(0)
    expect(breakdown.conversationHistory).toBeGreaterThan(0)
    expect(breakdown.toolSchemas).toBeGreaterThan(0)
    expect(breakdown.reservedForResponse).toBeGreaterThan(0)
    expect(breakdown.mcpToolSchemas).toBe(0)
  })

  it('calculates budget with usage percentage', () => {
    const budget = budgeter.calculateBudget()
    expect(budget.totalBudget).toBe(200000)
    expect(budget.used).toBeGreaterThan(0)
    expect(budget.available).toBe(budget.totalBudget - budget.used)
    expect(budget.usagePercent).toBe(budget.used / budget.totalBudget)
    expect(budget.breakdown).toBeDefined()
  })

  it('returns warning at 80% threshold', () => {
    budgeter.setConversationHistory(['x'.repeat(640000)])

    const budget = budgeter.calculateBudget()
    expect(budget.warning).not.toBeNull()
    expect(budget.warning?.level).toBe('warning')
    expect(budget.warning?.threshold).toBe(0.8)
  })

  it('returns critical warning at 95% threshold', () => {
    budgeter.setConversationHistory(['x'.repeat(760000)])

    const budget = budgeter.calculateBudget()
    expect(budget.warning).not.toBeNull()
    expect(budget.warning?.level).toBe('critical')
    expect(budget.warning?.threshold).toBe(0.95)
  })

  it('returns no warning below 80%', () => {
    budgeter.setConversationHistory(['Hello world'])

    const budget = budgeter.calculateBudget()
    expect(budget.warning).toBeNull()
  })

  it('detects when compaction should trigger', () => {
    budgeter.setConversationHistory(['x'.repeat(640000)])
    expect(budgeter.shouldCompact()).toBe(true)

    budgeter.setConversationHistory(['Hello world'])
    expect(budgeter.shouldCompact()).toBe(false)
  })

  it('calculates tokens until warning', () => {
    const tokensUntilWarning = budgeter.getTokensUntilWarning()
    const totalBudget = budgeter.getTotalBudget()
    expect(tokensUntilWarning).toBe(totalBudget * 0.8 - budgeter.calculateBudget().used)
  })

  it('calculates tokens until compaction', () => {
    const tokensUntilCompact = budgeter.getTokensUntilCompact()
    const totalBudget = budgeter.getTotalBudget()
    expect(tokensUntilCompact).toBe(totalBudget * 0.8 - budgeter.calculateBudget().used)
  })

  it('calculates tokens until critical', () => {
    const tokensUntilCritical = budgeter.getTokensUntilCritical()
    const totalBudget = budgeter.getTotalBudget()
    expect(tokensUntilCritical).toBe(totalBudget * 0.95 - budgeter.calculateBudget().used)
  })

  it('estimates messages until warning', () => {
    budgeter.setConversationHistory(['x'.repeat(1000)])
    const estimate = budgeter.estimateMessagesUntilWarning(500)
    expect(estimate).toBeGreaterThan(0)
  })

  it('estimates messages until compaction', () => {
    budgeter.setConversationHistory(['x'.repeat(1000)])
    const estimate = budgeter.estimateMessagesUntilCompact(500)
    expect(estimate).toBeGreaterThan(0)
  })

  it('generates budget summary string', () => {
    const summary = budgeter.getBudgetSummary()
    expect(summary).toContain('Context Budget:')
    expect(summary).toContain('tokens')
    expect(summary).toContain('Breakdown:')
    expect(summary).toContain('System Prompt:')
    expect(summary).toContain('Conversation:')
    expect(summary).toContain('Tool Schemas:')
    expect(summary).toContain('Reserved (Response):')
  })

  it('generates warning in summary when at threshold', () => {
    budgeter.setConversationHistory(['x'.repeat(640000)])
    const summary = budgeter.getBudgetSummary()
    expect(summary).toContain('⚠')
  })

  it('generates compaction recommendation in summary when needed', () => {
    budgeter.setConversationHistory(['x'.repeat(640000)])
    const summary = budgeter.getBudgetSummary()
    expect(summary).toContain('🔄 Compaction recommended')
  })

  it('updates system prompt tokens', () => {
    const initialBudget = budgeter.calculateBudget()
    budgeter.updateSystemPrompt('A'.repeat(10000))
    const updatedBudget = budgeter.calculateBudget()
    expect(updatedBudget.breakdown.systemPrompt).toBeGreaterThan(
      initialBudget.breakdown.systemPrompt,
    )
  })

  it('updates tool schemas tokens', () => {
    const initialBudget = budgeter.calculateBudget()
    budgeter.updateToolSchemas('x'.repeat(5000))
    const updatedBudget = budgeter.calculateBudget()
    expect(updatedBudget.breakdown.toolSchemas).toBeGreaterThan(initialBudget.breakdown.toolSchemas)
  })

  it('updates MCP tool schemas tokens', () => {
    const initialBudget = budgeter.calculateBudget()
    budgeter.updateMcpToolSchemas('x'.repeat(5000))
    const updatedBudget = budgeter.calculateBudget()
    expect(updatedBudget.breakdown.mcpToolSchemas).toBeGreaterThan(
      initialBudget.breakdown.mcpToolSchemas,
    )
  })

  it('adds conversation messages', () => {
    budgeter.addConversationMessage('New message')
    const budget = budgeter.calculateBudget()
    expect(budget.breakdown.conversationHistory).toBeGreaterThan(0)
  })

  it('sets conversation history', () => {
    budgeter.setConversationHistory(['msg1', 'msg2', 'msg3'])
    const budget = budgeter.calculateBudget()
    expect(budget.breakdown.conversationHistory).toBeGreaterThan(0)
  })

  it('clears conversation history', () => {
    budgeter.setConversationHistory(['msg1', 'msg2'])
    budgeter.clearConversationHistory()
    const budget = budgeter.calculateBudget()
    expect(budget.breakdown.conversationHistory).toBe(0)
  })

  it('uses custom token counter', () => {
    const customCounter = {
      count: (text: string) => text.length,
    }
    const customBudgeter = createContextBudgeter(mockModelConfig, mockForgeConfig, {
      tokenCounter: customCounter,
      systemPrompt: 'test',
    })
    const budget = customBudgeter.calculateBudget()
    expect(budget.breakdown.systemPrompt).toBe(4)
  })

  it('handles small context window models', () => {
    const smallModelConfig = {
      ...mockModelConfig,
      capabilities: {
        ...mockModelConfig.capabilities,
        contextWindow: 4096,
        maxTokens: 1024,
      },
    }
    const smallConfig: ForgeConfig['context'] = {
      maxTokens: 100000,
      compactionThreshold: 0.8,
      keepRecentMessages: 10,
    }
    const smallBudgeter = createContextBudgeter(smallModelConfig, smallConfig)
    expect(smallBudgeter.getTotalBudget()).toBe(4096)
    expect(smallBudgeter.getReservedResponseTokens()).toBeLessThanOrEqual(1024 * 1.5)
  })

  it('handles config maxTokens smaller than model context', () => {
    const smallConfig: ForgeConfig['context'] = {
      maxTokens: 10000,
      compactionThreshold: 0.8,
      keepRecentMessages: 10,
    }
    const smallBudgeter = createContextBudgeter(mockModelConfig, smallConfig)
    expect(smallBudgeter.getTotalBudget()).toBe(10000)
  })
})

describe('CharTokenCounter', () => {
  it('approximates tokens as chars/4', () => {
    const counter = new CharTokenCounter()
    expect(counter.count('')).toBe(0)
    expect(counter.count('a')).toBe(1)
    expect(counter.count('abcd')).toBe(1)
    expect(counter.count('abcde')).toBe(2)
    expect(counter.count('Hello world')).toBe(3)
  })
})

describe('ContextBudgeter integration', () => {
  it('simulates context growth over multiple turns', () => {
    const budgeter = createContextBudgeter(mockModelConfig, mockForgeConfig, {
      systemPrompt: 'You are a helpful coding assistant. '.repeat(1000),
      toolSchemas: JSON.stringify(
        Array.from({ length: 20 }, (_, i) => ({
          name: `tool${i}`,
          description: 'A tool'.repeat(500),
          parameters: { type: 'object', properties: {} },
        })),
      ),
    })

    let warningTriggered = false
    let compactTriggered = false

    for (let i = 0; i < 200; i++) {
      budgeter.addConversationMessage(`User: Question ${i}`.repeat(200))
      budgeter.addConversationMessage(`Assistant: Answer ${i} with details`.repeat(500))

      const budget = budgeter.calculateBudget()

      if (budget.warning && budget.warning.level === 'warning' && !warningTriggered) {
        warningTriggered = true
        expect(budget.usagePercent).toBeGreaterThanOrEqual(0.8)
      }

      if (budgeter.shouldCompact() && !compactTriggered) {
        compactTriggered = true
        expect(budget.usagePercent).toBeGreaterThanOrEqual(0.8)
      }
    }

    expect(warningTriggered).toBe(true)
    expect(compactTriggered).toBe(true)
  })

  it('tracks budget accurately with MCP tools', () => {
    const budgeter = createContextBudgeter(mockModelConfig, mockForgeConfig, {
      mcpToolSchemas: JSON.stringify({
        tools: Array.from({ length: 50 }, (_, i) => ({
          name: `mcp_tool_${i}`,
          description: 'MCP tool with long description'.repeat(20),
          inputSchema: { type: 'object', properties: {} },
        })),
      }),
    })

    const budget = budgeter.calculateBudget()
    expect(budget.breakdown.mcpToolSchemas).toBeGreaterThan(0)
    expect(budget.used).toBeGreaterThan(budget.breakdown.mcpToolSchemas)
  })
})
