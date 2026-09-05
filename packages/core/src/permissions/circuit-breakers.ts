import { RiskLevel } from './classifier'

/** Circuit breaker action type. */
export type CircuitBreakerAction = 'prompt' | 'deny' | 'log'

/** Circuit breaker trigger. */
export interface CircuitBreakerTrigger {
  /** Unique identifier. */
  id: string
  /** Human-readable name. */
  name: string
  /** Description of what this breaker catches. */
  description: string
  /** Risk level threshold - breakers fire for this level and above. */
  riskThreshold: RiskLevel
  /** Additional pattern matching (regex on command string). */
  patterns?: RegExp[]
  /** Custom condition function. */
  condition?: (context: CircuitBreakerContext) => boolean
  /** Action to take when triggered. */
  action: CircuitBreakerAction
  /** Whether this breaker is enabled. Default: true. */
  enabled?: boolean
  /** Priority - higher runs first. Default: 0. */
  priority?: number
}

/** Context passed to circuit breaker conditions. */
export interface CircuitBreakerContext {
  /** The command being executed. */
  command: string
  /** The classified risk level. */
  riskLevel: RiskLevel
  /** Current permission mode. */
  permissionMode: string
  /** Tool name (e.g., 'bash'). */
  toolName: string
  /** Tool arguments. */
  toolArgs: Record<string, unknown>
  /** Additional metadata. */
  metadata?: Record<string, unknown>
}

/** Result of circuit breaker evaluation. */
export interface CircuitBreakerResult {
  /** Whether a breaker was triggered. */
  triggered: boolean
  /** The triggered breaker (if any). */
  breaker?: CircuitBreakerTrigger
  /** The action to take. */
  action?: CircuitBreakerAction
  /** Human-readable message for the user. */
  message?: string
}

/** Default circuit breaker triggers. */
export const DEFAULT_CIRCUIT_BREAKERS: CircuitBreakerTrigger[] = [
  {
    id: 'rm-rf-root',
    name: 'Delete Root Filesystem',
    description: 'Blocks rm -rf / which destroys the entire filesystem',
    riskThreshold: 'critical',
    patterns: [
      /^rm\s+(-rf|-fr)\s+\/\s*$/,
      /^rm\s+(-rf|-fr)\s+\/\s*[;&|]/,
      /^sudo\s+rm\s+(-rf|-fr)\s+\//,
      /\brm\s+(-rf|-fr)\s+\//,
      /\bsudo\s+rm\s+(-rf|-fr)\s+\//,
    ],
    action: 'prompt',
    priority: 100,
  },
  {
    id: 'rm-rf-home',
    name: 'Delete Home Directory',
    description: 'Blocks rm -rf ~ which destroys user home directory',
    riskThreshold: 'critical',
    patterns: [
      /^rm\s+(-rf|-fr)\s+~\s*$/,
      /^rm\s+(-rf|-fr)\s+~\s*[;&|]/,
      /^sudo\s+rm\s+(-rf|-fr)\s+~/,
    ],
    action: 'prompt',
    priority: 95,
  },
  {
    id: 'fork-bomb',
    name: 'Fork Bomb',
    description: 'Blocks fork bomb patterns that crash the system',
    riskThreshold: 'critical',
    patterns: [
      /^:\(\)\{.*:.*\|.*:.*&.*\}/,
    ],
    action: 'deny',
    priority: 90,
  },
  {
    id: 'disk-destructive',
    name: 'Disk Destructive Operations',
    description: 'Blocks dd, mkfs, fdisk, parted operations on physical disks',
    riskThreshold: 'critical',
    patterns: [
      /^dd\s+.*of=\/(dev\/)/,
      /^mkfs\./,
      /^fdisk\s/,
      /^parted\s/,
      /^wipe(f\s+)?/,
      /^shred\s+/,
    ],
    action: 'prompt',
    priority: 85,
  },
  {
    id: 'system-shutdown',
    name: 'System Shutdown/Reboot',
    description: 'Blocks shutdown, reboot, halt, init 0, systemctl poweroff',
    riskThreshold: 'critical',
    patterns: [
      /^shutdown(\s|$)/,
      /^reboot(\s|$)/,
      /^halt(\s|$)/,
      /^init\s+0/,
      /^systemctl\s+(poweroff|halt|reboot)/,
    ],
    action: 'prompt',
    priority: 80,
  },
  {
    id: 'git-force-push-main',
    name: 'Git Force Push to Main',
    description: 'Blocks git push --force to main/master branches',
    riskThreshold: 'high',
    patterns: [
      /^git\s+push\s+.*\s+(main|master)\s+.*--force/,
      /^git\s+push\s+.*\s+(main|master)\s+.*-f\s/,
      /^git\s+push\s+--force\s+.*\s+(main|master)/,
      /^git\s+push\s+-f\s+.*\s+(main|master)/,
      /^git\s+push\s+--force-with-lease.*\s+(main|master)(\s|$)/,
    ],
    action: 'prompt',
    priority: 75,
  },
  {
    id: 'git-force-push-any',
    name: 'Git Force Push (Any Branch)',
    description: 'Prompts for any git push --force',
    riskThreshold: 'high',
    patterns: [
      /^git\s+push\s+.*--force/,
      /^git\s+push\s+.*-f\s/,
    ],
    condition: (ctx) => ctx.permissionMode !== 'bypass',
    action: 'prompt',
    priority: 70,
  },
  {
    id: 'sql-drop-table',
    name: 'SQL DROP TABLE',
    description: 'Blocks DROP TABLE and DROP DATABASE statements',
    riskThreshold: 'high',
    patterns: [
      /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i,
      /\bTRUNCATE\s+TABLE\b/i,
    ],
    action: 'prompt',
    priority: 65,
  },
  {
    id: 'sql-delete-no-where',
    name: 'SQL DELETE Without WHERE',
    description: 'Prompts for DELETE statements without WHERE clause',
    riskThreshold: 'high',
    patterns: [
      /^DELETE\s+FROM\s+\w+\s*;/i,
      /^DELETE\s+FROM\s+\w+\s*$/i,
    ],
    action: 'prompt',
    priority: 60,
  },
  {
    id: 'system-file-modification',
    name: 'System File Modification',
    description: 'Prompts for modifications to critical system directories',
    riskThreshold: 'high',
    patterns: [
      /^chmod\s+.*\s+\/(etc|bin|sbin|lib|usr|boot|sys|proc|dev)(\/|$)/,
      /^chown\s+.*\s+\/(etc|bin|sbin|lib|usr|boot|sys|proc|dev)(\/|$)/,
      /^mv\s+.*\s+\/(etc|bin|sbin|lib|usr|boot|sys|proc|dev)(\/|$)/,
      /^cp\s+.*\s+\/(etc|bin|sbin|lib|usr|boot|sys|proc|dev)(\/|$)/,
      /^rm\s+.*\s+\/(etc|bin|sbin|lib|usr|boot|sys|proc|dev)(\/|$)/,
      /^sed\s+-i.*\/(etc|bin|sbin|lib|usr|boot|sys|proc|dev)(\/|$)/,
      /^awk\s+.*\/(etc|bin|sbin|lib|usr|boot|sys|proc|dev)(\/|$)/,
    ],
    action: 'prompt',
    priority: 55,
  },
  {
    id: 'recursive-permissions',
    name: 'Recursive Permission Changes',
    description: 'Prompts for recursive chmod/chown on large directory trees',
    riskThreshold: 'high',
    patterns: [
      /^chmod\s+-R\s+777/,
      /^chown\s+-R\s+root/,
      /^sudo\s+chmod\s+-R/,
      /^sudo\s+chown\s+-R/,
    ],
    action: 'prompt',
    priority: 50,
  },
  {
    id: 'terraform-destroy',
    name: 'Terraform Destroy',
    description: 'Prompts for terraform destroy which deletes infrastructure',
    riskThreshold: 'high',
    patterns: [
      /^terraform\s+destroy/,
    ],
    action: 'prompt',
    priority: 45,
  },
  {
    id: 'k8s-delete-namespace',
    name: 'Kubernetes Namespace Deletion',
    description: 'Prompts for kubectl delete namespace',
    riskThreshold: 'high',
    patterns: [
      /^kubectl\s+delete\s+namespace/,
      /^kubectl\s+delete\s+ns\s+/,
    ],
    action: 'prompt',
    priority: 40,
  },
  {
    id: 'npm-publish',
    name: 'NPM Publish',
    description: 'Prompts for npm/yarn/pnpm publish',
    riskThreshold: 'high',
    patterns: [
      /^npm\s+publish/,
      /^yarn\s+publish/,
      /^pnpm\s+publish/,
    ],
    action: 'prompt',
    priority: 35,
  },
  {
    id: 'container-destructive',
    name: 'Container Destructive Operations',
    description: 'Prompts for force removal of containers/images',
    riskThreshold: 'high',
    patterns: [
      /^docker\s+(rmi|rm)\s+.*-f/,
      /^podman\s+(rmi|rm)\s+.*-f/,
    ],
    action: 'prompt',
    priority: 30,
  },
]

/** Evaluate all circuit breakers against a context. */
export function evaluateCircuitBreakers(
  context: CircuitBreakerContext,
  breakers: CircuitBreakerTrigger[] = DEFAULT_CIRCUIT_BREAKERS,
): CircuitBreakerResult {
  // Sort by priority (highest first)
  const sorted = [...breakers]
    .filter((b) => b.enabled !== false)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))

  for (const breaker of sorted) {
    // Check risk threshold
    const riskOrder: RiskLevel[] = ['low', 'medium', 'high', 'critical']
    const contextRiskIndex = riskOrder.indexOf(context.riskLevel)
    const thresholdIndex = riskOrder.indexOf(breaker.riskThreshold)

    if (contextRiskIndex < thresholdIndex) {
      continue // Risk level below threshold
    }

    // Check patterns
    let patternMatch = false
    if (breaker.patterns && breaker.patterns.length > 0) {
      patternMatch = breaker.patterns.some((p) => p.test(context.command))
    } else {
      // If no patterns, risk threshold match is sufficient
      patternMatch = true
    }

    if (!patternMatch) {
      continue
    }

    // Check custom condition
    if (breaker.condition && !breaker.condition(context)) {
      continue
    }

    // Breaker triggered!
    return {
      triggered: true,
      breaker,
      action: breaker.action,
      message: generateBreakerMessage(breaker, context),
    }
  }

  return { triggered: false }
}

/** Generate user-friendly message for a triggered breaker. */
function generateBreakerMessage(
  breaker: CircuitBreakerTrigger,
  context: CircuitBreakerContext,
): string {
  const mode = context.permissionMode
  const action = breaker.action === 'deny' ? 'blocked' : 'requires confirmation'

  return `⚠️  Circuit breaker triggered: ${breaker.name}
${breaker.description}

Command: ${context.command}
Risk level: ${context.riskLevel}
Permission mode: ${mode}

This action is ${action} regardless of permission mode.`
}

/** Check if a command triggers any circuit breaker. */
export function isCircuitBreakerTriggered(
  command: string,
  riskLevel: RiskLevel,
  permissionMode: string,
  toolName: string = 'bash',
  toolArgs: Record<string, unknown> = {},
  breakers: CircuitBreakerTrigger[] = DEFAULT_CIRCUIT_BREAKERS,
): CircuitBreakerResult {
  return evaluateCircuitBreakers(
    { command, riskLevel, permissionMode, toolName, toolArgs },
    breakers,
  )
}

/** Add a custom circuit breaker. */
export function addCircuitBreaker(
  breakers: CircuitBreakerTrigger[],
  newBreaker: CircuitBreakerTrigger,
): CircuitBreakerTrigger[] {
  return [...breakers, newBreaker].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
}

/** Remove a circuit breaker by ID. */
export function removeCircuitBreaker(
  breakers: CircuitBreakerTrigger[],
  id: string,
): CircuitBreakerTrigger[] {
  return breakers.filter((b) => b.id !== id)
}

/** Enable/disable a circuit breaker. */
export function setCircuitBreakerEnabled(
  breakers: CircuitBreakerTrigger[],
  id: string,
  enabled: boolean,
): CircuitBreakerTrigger[] {
  return breakers.map((b) => (b.id === id ? { ...b, enabled } : b))
}

/** Get all enabled circuit breakers. */
export function getEnabledCircuitBreakers(
  breakers: CircuitBreakerTrigger[] = DEFAULT_CIRCUIT_BREAKERS,
): CircuitBreakerTrigger[] {
  return breakers.filter((b) => b.enabled !== false)
}

/** Check if bypass mode should be overridden by circuit breakers. */
export function shouldOverrideBypass(
  context: CircuitBreakerContext,
  breakers: CircuitBreakerTrigger[] = DEFAULT_CIRCUIT_BREAKERS,
): boolean {
  const result = evaluateCircuitBreakers(context, breakers)
  return result.triggered && result.action !== 'deny'
}

/** Get breaker that would fire for a command (for preview). */
export function previewCircuitBreakers(
  context: CircuitBreakerContext,
  breakers: CircuitBreakerTrigger[] = DEFAULT_CIRCUIT_BREAKERS,
): CircuitBreakerTrigger[] {
  const sorted = [...breakers]
    .filter((b) => b.enabled !== false)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))

  const triggered: CircuitBreakerTrigger[] = []

  for (const breaker of sorted) {
    const riskOrder: RiskLevel[] = ['low', 'medium', 'high', 'critical']
    const contextRiskIndex = riskOrder.indexOf(context.riskLevel)
    const thresholdIndex = riskOrder.indexOf(breaker.riskThreshold)

    if (contextRiskIndex < thresholdIndex) continue

    let patternMatch = false
    if (breaker.patterns && breaker.patterns.length > 0) {
      patternMatch = breaker.patterns.some((p) => p.test(context.command))
    } else {
      patternMatch = true
    }

    if (!patternMatch) continue

    if (breaker.condition && !breaker.condition(context)) continue

    triggered.push(breaker)
  }

  return triggered
}