import { RiskLevel } from '../permissions/classifier'
import { AgentTool } from '../agent/types'

/** Result of a security analysis. */
export interface AnalysisResult {
  /** The assessed risk level. */
  riskLevel: RiskLevel
  /** Human-readable explanation. */
  reason: string
  /** Confidence in the assessment (0-1). */
  confidence: number
  /** Additional metadata. */
  metadata?: Record<string, unknown>
}

/** Context for analyzing a tool call. */
export interface AnalysisContext {
  /** The tool being called. */
  tool: AgentTool
  /** The tool arguments. */
  args: Record<string, unknown>
  /** Current session ID. */
  sessionId: string
  /** Current permission mode. */
  permissionMode: string
  /** Previous analysis results in this session (for context). */
  history?: AnalysisResult[]
  /** Additional metadata. */
  metadata?: Record<string, unknown>
}

/** Security Analyzer interface.
 * Implementations can be swapped to provide different risk assessment strategies.
 * The default implementation uses the command classifier (Phase 52).
 * Advanced implementations could use LLMs for more nuanced assessment.
 */
export interface SecurityAnalyzer {
  /** Analyze a tool call and return risk assessment. */
  analyze(context: AnalysisContext): Promise<AnalysisResult>

  /** Optional: Get the analyzer's name/identifier. */
  getName(): string

  /** Optional: Get the analyzer's version. */
  getVersion(): string
}

/** Configuration for the default analyzer. */
export interface DefaultAnalyzerConfig {
  /** Whether to use circuit breaker integration. Default: true. */
  useCircuitBreakers?: boolean
  /** Custom patterns for tool-specific risk assessment. */
  customToolPatterns?: ToolRiskPattern[]
  /** Minimum confidence threshold. Default: 0.5. */
  minConfidence?: number
}

/** Tool-specific risk pattern. */
export interface ToolRiskPattern {
  /** Tool name or category. */
  target: string
  /** Risk level for this tool. */
  riskLevel: RiskLevel
  /** Condition function (optional). */
  condition?: (args: Record<string, unknown>) => boolean
  /** Description. */
  description: string
}

/** Default analyzer implementation using command classifier. */
export class DefaultSecurityAnalyzer implements SecurityAnalyzer {
  private config: Required<DefaultAnalyzerConfig>
  private circuitBreakersEnabled: boolean

  constructor(config: DefaultAnalyzerConfig = {}) {
    this.config = {
      useCircuitBreakers: config.useCircuitBreakers ?? true,
      customToolPatterns: config.customToolPatterns ?? [],
      minConfidence: config.minConfidence ?? 0.5,
    }
    this.circuitBreakersEnabled = this.config.useCircuitBreakers
  }

  getName(): string {
    return 'DefaultSecurityAnalyzer'
  }

  getVersion(): string {
    return '1.0.0'
  }

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const { tool, args, permissionMode } = context

    // Check custom tool patterns first
    for (const pattern of this.config.customToolPatterns) {
      if (this.matchesTarget(pattern.target, tool.name)) {
        if (!pattern.condition || pattern.condition(args)) {
          return {
            riskLevel: pattern.riskLevel,
            reason: pattern.description,
            confidence: 0.9,
            metadata: { source: 'custom-pattern', pattern: pattern.target },
          }
        }
      }
    }

    // For bash tool, use command classifier
    if (tool.name === 'bash' && args.command) {
      return this.analyzeBashCommand(args.command as string, permissionMode)
    }

    // For other tools, use tool-category-based assessment
    return this.analyzeToolByCategory(tool, args, permissionMode)
  }

  /** Analyze a bash command. */
  private async analyzeBashCommand(command: string, permissionMode: string): Promise<AnalysisResult> {
    // Import classifier dynamically to avoid circular dependency
    const { classifyCommand } = await import(
      '../permissions/classifier'
    )

    const classification = classifyCommand(command)

    // Check circuit breakers
    if (this.circuitBreakersEnabled) {
      const { isCircuitBreakerTriggered: checkCircuitBreaker } = await import(
        '../permissions/circuit-breakers'
      )
      const cbResult = checkCircuitBreaker(command, classification.level, permissionMode)
      if (cbResult.triggered) {
        return {
          riskLevel: 'critical',
          reason: `Circuit breaker triggered: ${cbResult.breaker?.name}`,
          confidence: 1.0,
          metadata: {
            source: 'circuit-breaker',
            breakerId: cbResult.breaker?.id,
            action: cbResult.action,
          },
        }
      }
    }

    // Apply confidence threshold
    if (classification.matchedPatterns.length === 0) {
      // Unknown command - default to medium for safety
      return {
        riskLevel: 'medium',
        reason: 'Unknown command pattern',
        confidence: 0.3,
        metadata: { source: 'classifier', baseCommand: classification.baseCommand },
      }
    }

    return {
      riskLevel: classification.level,
      reason: classification.reason,
      confidence: classification.matchedPatterns.length > 1 ? 0.9 : 0.7,
      metadata: {
        source: 'classifier',
        baseCommand: classification.baseCommand,
        hasPipes: classification.hasPipes,
        hasVariables: classification.hasVariables,
        matchedPatterns: classification.matchedPatterns,
      },
    }
  }

  /** Analyze non-bash tools by category. */
  private analyzeToolByCategory(
    tool: AgentTool,
    _args: Record<string, unknown>,
    permissionMode: string,
  ): AnalysisResult {
    // Map tool names to risk levels
    const toolRiskMap: Record<string, RiskLevel> = {
      // Read-only tools: low risk
      readFile: 'low',
      read: 'low',
      glob: 'low',
      grep: 'low',
      todoRead: 'low',
      webFetch: 'low',
      webSearch: 'low',

      // Write tools: medium risk
      writeFile: 'medium',
      write: 'medium',
      editFile: 'medium',
      edit: 'medium',
      notebookEdit: 'medium',

      // Task/execution tools: medium-high risk
      todoWrite: 'medium',
      bash: 'medium', // Handled separately above

      // Default for unknown tools
    }

    const riskLevel = toolRiskMap[tool.name] ?? 'medium'

    // Adjust based on permission mode
    let adjustedRisk = riskLevel
    if (permissionMode === 'bypass') {
      adjustedRisk = 'low'
    } else if (permissionMode === 'plan') {
      adjustedRisk = this.escalateRisk(riskLevel)
    }

    return {
      riskLevel: adjustedRisk,
      reason: `Tool ${tool.name} categorized as ${riskLevel} risk`,
      confidence: 0.8,
      metadata: {
        source: 'tool-category',
        originalRisk: riskLevel,
        permissionMode,
      },
    }
  }

  /** Escalate risk level by one step. */
  private escalateRisk(level: RiskLevel): RiskLevel {
    const order: RiskLevel[] = ['low', 'medium', 'high', 'critical']
    const idx = order.indexOf(level)
    return order[Math.min(idx + 1, order.length - 1)]
  }

  /** Check if tool matches target pattern. */
  private matchesTarget(target: string, toolName: string): boolean {
    if (target === '*' || target === toolName) return true

    // Check category mapping
    const categories: Record<string, string[]> = {
      read: ['readFile', 'read'],
      write: ['writeFile', 'write'],
      edit: ['editFile', 'edit'],
      bash: ['bash'],
      glob: ['glob'],
      grep: ['grep'],
      task: ['todoWrite', 'todoRead'],
      webfetch: ['webFetch'],
      websearch: ['webSearch'],
      notebook: ['notebookEdit'],
    }

    return categories[target]?.includes(toolName) ?? false
  }

  /** Update configuration. */
  updateConfig(config: Partial<DefaultAnalyzerConfig>): void {
    this.config = { ...this.config, ...config }
    this.circuitBreakersEnabled = this.config.useCircuitBreakers
  }

  /** Add a custom tool pattern. */
  addToolPattern(pattern: ToolRiskPattern): void {
    this.config.customToolPatterns.push(pattern)
  }

  /** Remove a custom tool pattern. */
  removeToolPattern(target: string): void {
    this.config.customToolPatterns = this.config.customToolPatterns.filter(
      (p) => p.target !== target,
    )
  }
}

/** Confirmation policy interface.
 * Decides whether to pause for user approval based on risk level and context.
 */
export interface ConfirmationPolicy {
  /** Should we confirm before executing? */
  shouldConfirm(result: AnalysisResult, context: AnalysisContext): boolean

  /** Get policy name. */
  getName(): string
}

/** Default confirmation policy. */
export class DefaultConfirmationPolicy implements ConfirmationPolicy {
  private thresholds: Record<string, RiskLevel> = {
    default: 'medium',
    acceptEdits: 'high',
    plan: 'low', // Ask for everything in plan mode
    auto: 'critical', // Never auto-confirm in auto mode
    dontAsk: 'critical', // Deny by default
    bypass: 'critical', // Never confirm in bypass
  }

  constructor(customThresholds?: Record<string, RiskLevel>) {
    if (customThresholds) {
      this.thresholds = { ...this.thresholds, ...customThresholds }
    }
  }

  shouldConfirm(result: AnalysisResult, context: AnalysisContext): boolean {
    const threshold = this.thresholds[context.permissionMode] ?? 'medium'

    // Circuit breaker results always require confirmation (unless action is 'deny')
    if (result.metadata?.source === 'circuit-breaker') {
      return result.metadata.action !== 'deny'
    }

    // Check if risk meets or exceeds threshold
    const order: RiskLevel[] = ['low', 'medium', 'high', 'critical']
    const resultIdx = order.indexOf(result.riskLevel)
    const thresholdIdx = order.indexOf(threshold)

    return resultIdx >= thresholdIdx
  }

  getName(): string {
    return 'DefaultConfirmationPolicy'
  }

  /** Update threshold for a mode. */
  setThreshold(mode: string, level: RiskLevel): void {
    this.thresholds[mode] = level
  }

  /** Get threshold for a mode. */
  getThreshold(mode: string): RiskLevel {
    return this.thresholds[mode] ?? 'medium'
  }
}

/** Create a default analyzer instance. */
export function createSecurityAnalyzer(config?: DefaultAnalyzerConfig): SecurityAnalyzer {
  return new DefaultSecurityAnalyzer(config)
}

/** Create a default confirmation policy. */
export function createConfirmationPolicy(
  customThresholds?: Record<string, RiskLevel>,
): ConfirmationPolicy {
  return new DefaultConfirmationPolicy(customThresholds)
}

/** Registry for pluggable analyzers. */
export class AnalyzerRegistry {
  private analyzers: Map<string, SecurityAnalyzer> = new Map()
  private defaultAnalyzer: SecurityAnalyzer

  constructor(defaultAnalyzer?: SecurityAnalyzer) {
    this.defaultAnalyzer = defaultAnalyzer ?? createSecurityAnalyzer()
    this.analyzers.set('default', this.defaultAnalyzer)
  }

  /** Register an analyzer. */
  register(name: string, analyzer: SecurityAnalyzer): void {
    this.analyzers.set(name, analyzer)
  }

  /** Get an analyzer by name. */
  get(name: string): SecurityAnalyzer | undefined {
    return this.analyzers.get(name)
  }

  /** Get the default analyzer. */
  getDefault(): SecurityAnalyzer {
    return this.defaultAnalyzer
  }

  /** Set the default analyzer. */
  setDefault(name: string): boolean {
    const analyzer = this.analyzers.get(name)
    if (analyzer) {
      this.defaultAnalyzer = analyzer
      return true
    }
    return false
  }

  /** List all registered analyzers. */
  list(): string[] {
    return Array.from(this.analyzers.keys())
  }

  /** Remove an analyzer. */
  remove(name: string): boolean {
    if (name === 'default') return false
    return this.analyzers.delete(name)
  }
}

/** Global analyzer registry. */
let globalRegistry: AnalyzerRegistry | null = null

/** Get or create the global analyzer registry. */
export function getAnalyzerRegistry(): AnalyzerRegistry {
  if (!globalRegistry) {
    globalRegistry = new AnalyzerRegistry()
  }
  return globalRegistry
}

/** Set the global analyzer registry. */
export function setAnalyzerRegistry(registry: AnalyzerRegistry): void {
  globalRegistry = registry
}