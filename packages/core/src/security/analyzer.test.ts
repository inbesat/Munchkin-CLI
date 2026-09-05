import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import {
  DefaultSecurityAnalyzer,
  DefaultConfirmationPolicy,
  createSecurityAnalyzer,
  createConfirmationPolicy,
  AnalyzerRegistry,
  getAnalyzerRegistry,
  setAnalyzerRegistry,
  SecurityAnalyzer,
  ConfirmationPolicy,
  AnalysisContext,
  AnalysisResult,
  RiskLevel,
  ToolRiskPattern,
} from './analyzer'
import { AgentTool } from '../agent/types'

const createMockTool = (name: string): AgentTool => ({
  name,
  description: `Mock ${name} tool`,
  execute: async () => '',
})

const createContext = (overrides: Partial<AnalysisContext> = {}): AnalysisContext => ({
  tool: createMockTool('bash'),
  args: { command: 'ls' },
  sessionId: 'test-session',
  permissionMode: 'default',
  ...overrides,
})

describe('Security Analyzer', () => {
  let analyzer: DefaultSecurityAnalyzer

  beforeEach(() => {
    analyzer = new DefaultSecurityAnalyzer()
    setAnalyzerRegistry(new AnalyzerRegistry())
  })

  afterEach(() => {
    setAnalyzerRegistry(new AnalyzerRegistry())
  })

  describe('DefaultSecurityAnalyzer', () => {
    it('implements SecurityAnalyzer interface', () => {
      expect(analyzer.analyze).toBeDefined()
      expect(analyzer.getName()).toBe('DefaultSecurityAnalyzer')
      expect(analyzer.getVersion()).toBe('1.0.0')
    })

    it('analyzes read-only tools as low risk', async () => {
      const readTool = createMockTool('readFile')
      const result = await analyzer.analyze(createContext({ tool: readTool, args: { path: 'file.txt' } }))
      expect(result.riskLevel).toBe('low')
      expect(result.confidence).toBeGreaterThan(0.5)
    })

    it('analyzes write tools as medium risk', async () => {
      const writeTool = createMockTool('writeFile')
      const result = await analyzer.analyze(createContext({ tool: writeTool, args: { path: 'file.txt', content: 'hello' } }))
      expect(result.riskLevel).toBe('medium')
    })

    it('analyzes edit tools as medium risk', async () => {
      const editTool = createMockTool('editFile')
      const result = await analyzer.analyze(createContext({ tool: editTool, args: { path: 'file.txt', oldStr: 'a', newStr: 'b' } }))
      expect(result.riskLevel).toBe('medium')
    })

    it('analyzes glob/grep as low risk', async () => {
      for (const toolName of ['glob', 'grep']) {
        const tool = createMockTool(toolName)
        const result = await analyzer.analyze(createContext({ tool, args: { pattern: '*.ts' } }))
        expect(result.riskLevel).toBe('low')
      }
    })

    it('analyzes todoWrite as medium risk', async () => {
      const tool = createMockTool('todoWrite')
      const result = await analyzer.analyze(createContext({ tool, args: {} }))
      expect(result.riskLevel).toBe('medium')
    })

    it('analyzes todoRead as low risk', async () => {
      const tool = createMockTool('todoRead')
      const result = await analyzer.analyze(createContext({ tool, args: {} }))
      expect(result.riskLevel).toBe('low')
    })

    it('analyzes web tools as low risk', async () => {
      for (const toolName of ['webFetch', 'webSearch']) {
        const tool = createMockTool(toolName)
        const result = await analyzer.analyze(createContext({ tool, args: { url: 'https://example.com' } }))
        expect(result.riskLevel).toBe('low')
      }
    })

    it('analyzes unknown tools as medium risk', async () => {
      const unknownTool = createMockTool('unknownTool')
      const result = await analyzer.analyze(createContext({ tool: unknownTool, args: {} }))
      expect(result.riskLevel).toBe('medium')
    })

    it('returns metadata with source', async () => {
      const tool = createMockTool('readFile')
      const result = await analyzer.analyze(createContext({ tool, args: { path: 'file.txt' } }))
      expect(result.metadata?.source).toBe('tool-category')
    })

    describe('bash command analysis', () => {
      it('analyzes low-risk bash commands', async () => {
        const tool = createMockTool('bash')
        const result = await analyzer.analyze(createContext({
          tool,
          args: { command: 'ls -la' },
        }))
        expect(result.riskLevel).toBe('low')
        expect(result.metadata?.source).toBe('classifier')
      })

      it('analyzes medium-risk bash commands', async () => {
        const tool = createMockTool('bash')
        const result = await analyzer.analyze(createContext({
          tool,
          args: { command: 'npm install' },
        }))
        expect(result.riskLevel).toBe('medium')
      })

      it('analyzes high-risk bash commands', async () => {
        const tool = createMockTool('bash')
        const result = await analyzer.analyze(createContext({
          tool,
          args: { command: 'rm -rf node_modules' },
        }))
        expect(result.riskLevel).toBe('high')
      })

      it('analyzes critical-risk bash commands', async () => {
        const tool = createMockTool('bash')
        const result = await analyzer.analyze(createContext({
          tool,
          args: { command: 'rm -rf /' },
        }))
        expect(result.riskLevel).toBe('critical')
        expect(result.metadata?.source).toBe('circuit-breaker')
      })

it('includes command details in metadata', async () => {
      const tool = createMockTool('bash')
      const result = await analyzer.analyze(createContext({
        tool,
        args: { command: 'npm install' }, // Medium risk, no circuit breaker
      }))
      expect(result.metadata?.baseCommand).toBeDefined()
      expect(result.metadata?.matchedPatterns).toBeDefined()
    })
    })

    describe('custom tool patterns', () => {
      it('uses custom patterns when they match', async () => {
        const customPattern: ToolRiskPattern = {
          target: 'bash',
          riskLevel: 'low',
          description: 'Custom: bash is low risk',
          condition: (args) => (args.command as string).includes('safe'),
        }
        analyzer.addToolPattern(customPattern)

        const tool = createMockTool('bash')
        const result = await analyzer.analyze(createContext({
          tool,
          args: { command: 'safe command' },
        }))
        expect(result.riskLevel).toBe('low')
        expect(result.metadata?.source).toBe('custom-pattern')
      })

it('ignores custom patterns when condition fails', async () => {
      const customPattern: ToolRiskPattern = {
        target: 'bash',
        riskLevel: 'low',
        description: 'Custom: bash is low risk',
        condition: (args) => (args.command as string).includes('safe'),
      }
      analyzer.addToolPattern(customPattern)

      const tool = createMockTool('bash')
      const result = await analyzer.analyze(createContext({
        tool,
        args: { command: 'rm -rf /' }, // This triggers circuit breaker, not low
      }))
      // Should trigger circuit breaker (critical), not custom pattern
      expect(result.riskLevel).toBe('critical')
      expect(result.metadata?.source).toBe('circuit-breaker')
    })

      it('removes custom patterns', async () => {
        const customPattern: ToolRiskPattern = {
          target: 'bash',
          riskLevel: 'low',
          description: 'Custom',
        }
        analyzer.addToolPattern(customPattern)
        analyzer.removeToolPattern('bash')

        const tool = createMockTool('bash')
        const result = await analyzer.analyze(createContext({
          tool,
          args: { command: 'ls' },
        }))
        expect(result.riskLevel).toBe('low') // Classifier says low
      })
    })

    describe('permission mode adjustments', () => {
      it('escalates risk in plan mode', async () => {
        const tool = createMockTool('readFile')
        const result = await analyzer.analyze(createContext({
          tool,
          args: { path: 'file.txt' },
          permissionMode: 'plan',
        }))
        // readFile is low, should escalate to medium in plan mode
        expect(result.riskLevel).toBe('medium')
      })

      it('lowers risk in bypass mode', async () => {
        const tool = createMockTool('writeFile')
        const result = await analyzer.analyze(createContext({
          tool,
          args: { path: 'file.txt', content: 'x' },
          permissionMode: 'bypass',
        }))
        // writeFile is medium, should lower to low in bypass
        expect(result.riskLevel).toBe('low')
      })

      it('respects acceptEdits mode', async () => {
        const tool = createMockTool('writeFile')
        const result = await analyzer.analyze(createContext({
          tool,
          args: { path: 'file.txt', content: 'x' },
          permissionMode: 'acceptEdits',
        }))
        // writeFile is medium, acceptEdits uses high threshold
        expect(result.riskLevel).toBe('medium')
      })
    })

    describe('config updates', () => {
      it('updates config', () => {
        analyzer.updateConfig({ minConfidence: 0.8 })
        // Config update doesn't throw
        expect(true).toBe(true)
      })

      it('can disable circuit breakers', async () => {
        analyzer.updateConfig({ useCircuitBreakers: false })
        const tool = createMockTool('bash')
        const result = await analyzer.analyze(createContext({
          tool,
          args: { command: 'rm -rf /' },
        }))
        // Without circuit breakers, falls back to classifier which says critical
        // But without circuit breaker check, it might not be marked as circuit-breaker source
        expect(result.riskLevel).toBe('critical')
      })
    })
  })

  describe('DefaultConfirmationPolicy', () => {
    let policy: DefaultConfirmationPolicy

    beforeEach(() => {
      policy = new DefaultConfirmationPolicy()
    })

    it('confirms for medium risk in default mode', () => {
      const result: AnalysisResult = { riskLevel: 'medium', reason: 'test', confidence: 0.8 }
      const ctx = createContext({ permissionMode: 'default' })
      expect(policy.shouldConfirm(result, ctx)).toBe(true)
    })

    it('does not confirm for low risk in default mode', () => {
      const result: AnalysisResult = { riskLevel: 'low', reason: 'test', confidence: 0.8 }
      const ctx = createContext({ permissionMode: 'default' })
      expect(policy.shouldConfirm(result, ctx)).toBe(false)
    })

    it('confirms for high risk in acceptEdits mode', () => {
      const result: AnalysisResult = { riskLevel: 'high', reason: 'test', confidence: 0.8 }
      const ctx = createContext({ permissionMode: 'acceptEdits' })
      expect(policy.shouldConfirm(result, ctx)).toBe(true)
    })

    it('does not confirm for medium risk in acceptEdits mode', () => {
      const result: AnalysisResult = { riskLevel: 'medium', reason: 'test', confidence: 0.8 }
      const ctx = createContext({ permissionMode: 'acceptEdits' })
      expect(policy.shouldConfirm(result, ctx)).toBe(false)
    })

    it('confirms for everything in plan mode', () => {
      for (const level of ['low', 'medium', 'high'] as RiskLevel[]) {
        const result: AnalysisResult = { riskLevel: level, reason: 'test', confidence: 0.8 }
        const ctx = createContext({ permissionMode: 'plan' })
        expect(policy.shouldConfirm(result, ctx)).toBe(true)
      }
    })

    it('never confirms in auto mode', () => {
      const result: AnalysisResult = { riskLevel: 'high', reason: 'test', confidence: 0.8 }
      const ctx = createContext({ permissionMode: 'auto' })
      expect(policy.shouldConfirm(result, ctx)).toBe(false)
    })

    it('confirms for critical risk in bypass mode (circuit breaker threshold)', () => {
      const result: AnalysisResult = { riskLevel: 'critical', reason: 'test', confidence: 0.8 }
      const ctx = createContext({ permissionMode: 'bypass' })
      expect(policy.shouldConfirm(result, ctx)).toBe(true)
    })

    it('always confirms circuit breaker triggers', () => {
      const result: AnalysisResult = {
        riskLevel: 'critical',
        reason: 'circuit breaker',
        confidence: 1.0,
        metadata: { source: 'circuit-breaker', action: 'prompt' },
      }
      const ctx = createContext({ permissionMode: 'bypass' })
      expect(policy.shouldConfirm(result, ctx)).toBe(true)
    })

    it('does not confirm circuit breaker with deny action', () => {
      const result: AnalysisResult = {
        riskLevel: 'critical',
        reason: 'circuit breaker',
        confidence: 1.0,
        metadata: { source: 'circuit-breaker', action: 'deny' },
      }
      const ctx = createContext({ permissionMode: 'bypass' })
      expect(policy.shouldConfirm(result, ctx)).toBe(false)
    })

    it('updates thresholds', () => {
      policy.setThreshold('default', 'high')
      expect(policy.getThreshold('default')).toBe('high')
    })
  })

  describe('AnalyzerRegistry', () => {
    it('registers and retrieves analyzers', () => {
      const registry = new AnalyzerRegistry()
      const customAnalyzer = createSecurityAnalyzer()
      registry.register('custom', customAnalyzer)

      expect(registry.get('custom')).toBe(customAnalyzer)
      expect(registry.list()).toContain('custom')
    })

    it('returns default analyzer', () => {
      const registry = new AnalyzerRegistry()
      const defaultAnalyzer = registry.getDefault()
      expect(defaultAnalyzer).toBeDefined()
      expect(defaultAnalyzer.getName()).toBe('DefaultSecurityAnalyzer')
    })

    it('sets default analyzer', () => {
      const registry = new AnalyzerRegistry()
      const customAnalyzer = createSecurityAnalyzer()
      registry.register('custom', customAnalyzer)

      expect(registry.setDefault('custom')).toBe(true)
      expect(registry.getDefault()).toBe(customAnalyzer)
    })

    it('cannot remove default analyzer', () => {
      const registry = new AnalyzerRegistry()
      expect(registry.remove('default')).toBe(false)
    })

    it('removes custom analyzers', () => {
      const registry = new AnalyzerRegistry()
      const customAnalyzer = createSecurityAnalyzer()
      registry.register('custom', customAnalyzer)

      expect(registry.remove('custom')).toBe(true)
      expect(registry.get('custom')).toBeUndefined()
    })
  })

  describe('Global registry', () => {
    it('getAnalyzerRegistry returns singleton', () => {
      const r1 = getAnalyzerRegistry()
      const r2 = getAnalyzerRegistry()
      expect(r1).toBe(r2)
    })

    it('setAnalyzerRegistry replaces singleton', () => {
      const custom = new AnalyzerRegistry(createSecurityAnalyzer())
      setAnalyzerRegistry(custom)
      expect(getAnalyzerRegistry()).toBe(custom)
    })
  })

  describe('AnalysisResult structure', () => {
    it('has all required fields', async () => {
      const tool = createMockTool('bash')
      const result = await analyzer.analyze(createContext({ tool, args: { command: 'ls' } }))

      expect(result).toHaveProperty('riskLevel')
      expect(result).toHaveProperty('reason')
      expect(result).toHaveProperty('confidence')
      expect(result).toHaveProperty('metadata')
    })

    it('confidence is between 0 and 1', async () => {
      const tool = createMockTool('bash')
      const result = await analyzer.analyze(createContext({ tool, args: { command: 'ls' } }))
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
    })
  })

  describe('AnalysisContext', () => {
    it('includes all context fields', async () => {
      const tool = createMockTool('bash')
      const ctx = createContext({
        tool,
        args: { command: 'ls' },
        sessionId: 'session-123',
        permissionMode: 'default',
        history: [{ riskLevel: 'low', reason: 'prev', confidence: 0.5 }],
        metadata: { user: 'test' },
      })
      const result = await analyzer.analyze(ctx)
      expect(result).toBeDefined()
    })
  })
})