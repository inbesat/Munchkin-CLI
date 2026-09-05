import { PermissionMode, PermissionDecision, ToolCategory, PermissionModeConfig } from './modes'
import { RiskLevel } from './classifier'
import { CircuitBreakerResult } from './circuit-breakers'

/** Pre-approved tool specification. */
export interface PreApprovedTool {
  /** Tool name or category. */
  target: string | ToolCategory
  /** Optional condition for when this approval applies. */
  condition?: (args: Record<string, unknown>) => boolean
  /** Description of why this is approved. */
  description?: string
}

/** Profile configuration. */
export interface ProfileConfig {
  /** The permission mode this profile implements. */
  mode: 'dontAsk' | 'bypass'
  /** Pre-approved tools for dontAsk mode. */
  preApproved?: PreApprovedTool[]
  /** Whether circuit breakers still apply. Default: true. */
  respectCircuitBreakers?: boolean
  /** Whether to log denied actions. Default: true. */
  logDenials?: boolean
}

/** Result of a profile permission check. */
export interface ProfileCheckResult {
  /** The permission decision. */
  decision: PermissionDecision
  /** Whether this came from a pre-approval. */
  preApproved: boolean
  /** The matched pre-approval (if any). */
  matchedApproval?: PreApprovedTool
  /** Whether a circuit breaker overrode the profile. */
  circuitBreakerOverride?: CircuitBreakerResult
  /** Reason for the decision. */
  reason: string
}

/** Check if a tool matches a pre-approval target. */
function matchesPreApproval(target: string | ToolCategory, toolName: string, category: ToolCategory): boolean {
  if (typeof target === 'string') {
    return target === toolName || target === category
  }
  return target === category
}

/** Check pre-approvals for a tool call. */
function checkPreApprovals(
  toolName: string,
  category: ToolCategory,
  args: Record<string, unknown>,
  preApproved: PreApprovedTool[] = [],
): { matched: boolean; approval?: PreApprovedTool } {
  for (const approval of preApproved) {
    if (matchesPreApproval(approval.target, toolName, category)) {
      if (!approval.condition || approval.condition(args)) {
        return { matched: true, approval }
      }
    }
  }
  return { matched: false }
}

/** Evaluate permission using dontAsk profile. */
export function evaluateDontAskProfile(
  toolName: string,
  category: ToolCategory,
  args: Record<string, unknown>,
  config: ProfileConfig,
  circuitBreakerResult?: CircuitBreakerResult,
): ProfileCheckResult {
  const { preApproved = [], respectCircuitBreakers = true } = config

  // Circuit breakers always override
  if (respectCircuitBreakers && circuitBreakerResult?.triggered) {
    return {
      decision: circuitBreakerResult.action === 'deny' ? 'deny' : 'ask',
      preApproved: false,
      circuitBreakerOverride: circuitBreakerResult,
      reason: `Circuit breaker triggered: ${circuitBreakerResult.breaker?.name}`,
    }
  }

  // Check pre-approvals
  const { matched, approval } = checkPreApprovals(toolName, category, args, preApproved)

  if (matched) {
    return {
      decision: 'allow',
      preApproved: true,
      matchedApproval: approval,
      reason: `Pre-approved: ${approval?.description ?? approval?.target}`,
    }
  }

  // Default: deny
  return {
    decision: 'deny',
    preApproved: false,
    reason: `dontAsk mode: ${toolName} not pre-approved`,
  }
}

/** Evaluate permission using bypass profile. */
export function evaluateBypassProfile(
  _toolName: string,
  _category: ToolCategory,
  _args: Record<string, unknown>,
  config: ProfileConfig,
  circuitBreakerResult?: CircuitBreakerResult,
): ProfileCheckResult {
  const { respectCircuitBreakers = true } = config

  // Circuit breakers still apply in bypass mode
  if (respectCircuitBreakers && circuitBreakerResult?.triggered) {
    return {
      decision: circuitBreakerResult.action === 'deny' ? 'deny' : 'ask',
      preApproved: false,
      circuitBreakerOverride: circuitBreakerResult,
      reason: `Circuit breaker triggered: ${circuitBreakerResult.breaker?.name} (bypass mode)`,
    }
  }

  // Everything else is allowed
  return {
    decision: 'allow',
    preApproved: false,
    reason: 'bypass mode: all actions allowed',
  }
}

/** Unified profile evaluator. */
export function evaluateProfile(
  toolName: string,
  category: ToolCategory,
  args: Record<string, unknown>,
  config: ProfileConfig,
  circuitBreakerResult?: CircuitBreakerResult,
): ProfileCheckResult {
  if (config.mode === 'dontAsk') {
    return evaluateDontAskProfile(toolName, category, args, config, circuitBreakerResult)
  }
  if (config.mode === 'bypass') {
    return evaluateBypassProfile(toolName, category, args, config, circuitBreakerResult)
  }
  // Not a profile mode - fall through to normal permission engine
  return {
    decision: 'ask',
    preApproved: false,
    reason: 'Not a profile mode',
  }
}

/** Create a dontAsk profile config. */
export function createDontAskProfile(
  preApproved: PreApprovedTool[] = [],
  options: { respectCircuitBreakers?: boolean; logDenials?: boolean } = {},
): ProfileConfig {
  return {
    mode: 'dontAsk',
    preApproved,
    respectCircuitBreakers: options.respectCircuitBreakers ?? true,
    logDenials: options.logDenials ?? true,
  }
}

/** Create a bypass profile config. */
export function createBypassProfile(
  options: { respectCircuitBreakers?: boolean } = {},
): ProfileConfig {
  return {
    mode: 'bypass',
    preApproved: [],
    respectCircuitBreakers: options.respectCircuitBreakers ?? true,
    logDenials: false,
  }
}

/** Default pre-approvals for common CI tasks. */
export const DEFAULT_CI_PRE_APPROVALS: PreApprovedTool[] = [
  // Read-only operations
  { target: 'read', description: 'Allow all read operations' },
  { target: 'glob', description: 'Allow globbing' },
  { target: 'grep', description: 'Allow grepping' },
  { target: 'todoRead', description: 'Allow reading todos' },
  { target: 'webFetch', description: 'Allow web fetching' },
  { target: 'webSearch', description: 'Allow web searching' },

  // Safe write operations
  {
    target: 'write',
    condition: (args) => {
      const path = args.path as string
      // Allow writing to build/output directories
      return path?.startsWith('dist/') || path?.startsWith('build/') || path?.startsWith('out/')
    },
    description: 'Allow writing to build output directories',
  },
  {
    target: 'edit',
    condition: (args) => {
      const path = args.path as string
      return path?.startsWith('dist/') || path?.startsWith('build/') || path?.startsWith('out/')
    },
    description: 'Allow editing build output directories',
  },

  // Safe bash commands
  {
    target: 'bash',
    condition: (args) => {
      const cmd = args.command as string
      // Allow common CI commands
      const safePatterns = [
        /^npm\s+(run|test|build|ci)/,
        /^yarn\s+(run|test|build)/,
        /^pnpm\s+(run|test|build)/,
        /^make\s/,
        /^tsc/,
        /^eslint/,
        /^prettier/,
        /^jest/,
        /^vitest/,
        /^cargo\s+(test|build|check)/,
        /^go\s+(test|build)/,
        /^python\s+-m\s+pytest/,
        /^pytest/,
      ]
      return safePatterns.some((p) => p.test(cmd))
    },
    description: 'Allow common CI build/test commands',
  },
]

/** Check if a mode is a profile mode. */
export function isProfileMode(mode: PermissionMode): boolean {
  return mode === 'dontAsk' || mode === 'bypass'
}

/** Get profile config from mode config. */
export function getProfileConfig(modeConfig: PermissionModeConfig): ProfileConfig | null {
  if (modeConfig.mode === 'dontAsk') {
    return createDontAskProfile(modeConfig.customRules?.map((r) => ({
      target: r.target,
      condition: r.condition,
      description: `Rule: ${r.target} = ${r.decision}`,
    })) ?? DEFAULT_CI_PRE_APPROVALS)
  }
  if (modeConfig.mode === 'bypass') {
    return createBypassProfile()
  }
  return null
}

/** Permission profile engine - integrates with mode system. */
export class PermissionProfileEngine {
  private config: ProfileConfig | null = null

  /** Set the active profile. */
  setProfile(config: ProfileConfig): void {
    this.config = config
  }

  /** Clear the active profile. */
  clearProfile(): void {
    this.config = null
  }

  /** Get the active profile config. */
  getProfile(): ProfileConfig | null {
    return this.config
  }

  /** Check if a profile is active. */
  hasActiveProfile(): boolean {
    return this.config !== null
  }

  /** Evaluate a tool call against the active profile. */
  async evaluate(
    toolName: string,
    category: ToolCategory,
    args: Record<string, unknown>,
    circuitBreakerResult?: CircuitBreakerResult,
  ): Promise<ProfileCheckResult | null> {
    if (!this.config) return null

    // We need to import circuit breaker check dynamically
    let cbResult = circuitBreakerResult
    if (!cbResult && this.config.respectCircuitBreakers) {
      const { isCircuitBreakerTriggered } = await import('./circuit-breakers')
      // We need risk level - for now assume we can get it from classifier
      const { classifyCommand } = await import('./classifier')
      let riskLevel: RiskLevel = 'medium'
      if (toolName === 'bash' && args.command) {
        riskLevel = classifyCommand(args.command as string).level
      }
      cbResult = isCircuitBreakerTriggered(
        args.command as string,
        riskLevel,
        this.config.mode,
        toolName,
        args,
      )
    }

    return evaluateProfile(toolName, category, args, this.config, cbResult)
  }
}

/** Global profile engine instance. */
let globalProfileEngine: PermissionProfileEngine | null = null

/** Get or create the global profile engine. */
export function getProfileEngine(): PermissionProfileEngine {
  if (!globalProfileEngine) {
    globalProfileEngine = new PermissionProfileEngine()
  }
  return globalProfileEngine
}

/** Set the global profile engine. */
export function setProfileEngine(engine: PermissionProfileEngine): void {
  globalProfileEngine = engine
}

/** Clear the global profile engine. */
export function clearProfileEngine(): void {
  globalProfileEngine = null
}