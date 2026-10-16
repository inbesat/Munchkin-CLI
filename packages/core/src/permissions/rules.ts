import type { PermissionDecision, ToolCategory } from './modes'

/** Rule target: tool name, category, or '*' for all. */
export type RuleTarget = string | ToolCategory | '*'

/** Condition type for rule matching. */
export type RuleCondition =
  | { type: 'path'; pattern: string; argKey?: string }
  | { type: 'command'; pattern: string; argKey?: string }
  | { type: 'custom'; fn: (args: Record<string, unknown>) => boolean; argKey?: string }

/** A permission rule in the DSL. */
export interface PermissionRuleDSL {
  /** Unique identifier for the rule. */
  id?: string
  /** Target tool name, category, or '*' for all tools. */
  target: RuleTarget
  /** Decision: allow, deny, or ask. */
  decision: PermissionDecision
  /** Optional conditions that must all match for rule to apply. */
  conditions?: RuleCondition[]
  /** Priority: higher numbers checked first. Default: 0. */
  priority?: number
  /** Human-readable description. */
  description?: string
}

/** Compiled rule for efficient matching. */
export interface CompiledRule {
  id: string
  target: RuleTarget
  decision: PermissionDecision
  conditions: CompiledCondition[]
  priority: number
  description?: string
}

/** Compiled condition for fast matching. */
export interface CompiledCondition {
  type: 'path' | 'command' | 'custom'
  matcher: (value: string) => boolean
  argKey: string
  originalPattern: string
}

/** Result of rule matching. */
export interface RuleMatchResult {
  matched: boolean
  rule?: CompiledRule
  decision?: PermissionDecision
  matchedConditions: CompiledCondition[]
}

/** Convert glob pattern to regex. */
export function globToRegex(glob: string): RegExp {
  let regex = ''
  let inGroup = false

  for (let i = 0; i < glob.length; i++) {
    const char = glob[i]
    const nextChar = glob[i + 1]
    const nextNextChar = glob[i + 2]

    if (char === '*' && nextChar === '*') {
      // ** matches any number of directories
      // Check if followed by / (directory separator) or end of string
      if (nextNextChar === '/') {
        // **/ matches zero or more directories ending with /
        regex += '(?:.*/)?'
        i += 2 // skip **/
      } else if (i + 2 === glob.length) {
        // ** at end of pattern matches any path including empty
        regex += '.*'
        i++
      } else {
        // ** in middle (e.g., **/*.ts) matches zero or more directories
        regex += '(?:.*/)?'
        i++
      }
    } else if (char === '*') {
      // * matches any characters except /
      regex += '[^/]*'
    } else if (char === '?') {
      // ? matches single character except /
      regex += '[^/]'
    } else if (char === '[') {
      // Character class [...]
      inGroup = true
      regex += '['
    } else if (char === ']' && inGroup) {
      regex += ']'
      inGroup = false
    } else if (char === '\\' && i + 1 < glob.length) {
      // Escape next character
      regex += escapeRegExp(glob[i + 1])
      i++
    } else {
      regex += escapeRegExp(char)
    }
  }

  return new RegExp(`^${regex}$`)
}

/** Escape special regex characters. */
function escapeRegExp(str: string): string {
  return str.replace(/[.+^${}()|[\]\\]/g, '\\$&')
}

/** Compile a condition into a matcher function. */
export function compileCondition(condition: RuleCondition): CompiledCondition {
  switch (condition.type) {
    case 'path': {
      const pattern = condition.pattern
      const regex = globToRegex(pattern)
      return {
        type: 'path',
        matcher: (value: string) => regex.test(value),
        argKey: condition.argKey ?? 'path',
        originalPattern: pattern,
      }
    }
    case 'command': {
      const pattern = condition.pattern
      const regex = new RegExp(pattern)
      return {
        type: 'command',
        matcher: (value: string) => regex.test(value),
        argKey: condition.argKey ?? 'command',
        originalPattern: pattern,
      }
    }
    case 'custom': {
      return {
        type: 'custom',
        matcher: (value: string) => condition.fn(JSON.parse(value) as Record<string, unknown>),
        argKey: condition.argKey ?? 'args',
        originalPattern: 'custom',
      }
    }
  }
}

/** Compile a DSL rule into a CompiledRule. */
export function compileRule(rule: PermissionRuleDSL): CompiledRule {
  return {
    id: rule.id ?? crypto.randomUUID(),
    target: rule.target,
    decision: rule.decision,
    conditions: (rule.conditions ?? []).map(compileCondition),
    priority: rule.priority ?? 0,
    description: rule.description,
  }
}

/** Compile multiple DSL rules, sorting by priority (highest first). */
export function compileRules(rules: PermissionRuleDSL[]): CompiledRule[] {
  return rules.map(compileRule).sort((a, b) => b.priority - a.priority)
}

/** Check if a tool matches a rule target. */
export function matchTarget(target: RuleTarget, toolName: string, category: ToolCategory): boolean {
  if (target === '*') return true
  if (typeof target === 'string') {
    return target === toolName || target === category
  }
  return target === category
}

/** Extract value from args for condition matching. */
function extractArgValue(args: Record<string, unknown>, argKey: string): string | undefined {
  // Handle nested paths like "args.path"
  const keys = argKey.split('.')
  let value: unknown = args
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = (value as Record<string, unknown>)[key]
    } else {
      return undefined
    }
  }
  return typeof value === 'string' ? value : value ? JSON.stringify(value) : undefined
}

/** Match a compiled rule against tool call arguments. */
export function matchRule(
  rule: CompiledRule,
  toolName: string,
  category: ToolCategory,
  args: Record<string, unknown>,
): RuleMatchResult {
  // Check target match
  if (!matchTarget(rule.target, toolName, category)) {
    return { matched: false, matchedConditions: [] }
  }

  const matchedConditions: CompiledCondition[] = []

  // Check all conditions
  for (const condition of rule.conditions) {
    const value = extractArgValue(args, condition.argKey)
    if (value === undefined) {
      return { matched: false, matchedConditions: [] }
    }
    if (!condition.matcher(value)) {
      return { matched: false, matchedConditions: [] }
    }
    matchedConditions.push(condition)
  }

  return {
    matched: true,
    rule,
    decision: rule.decision,
    matchedConditions,
  }
}

/** Match multiple rules, returning the highest priority match. */
export function matchRules(
  rules: CompiledRule[],
  toolName: string,
  category: ToolCategory,
  args: Record<string, unknown>,
): RuleMatchResult {
  let bestMatch: RuleMatchResult = { matched: false, matchedConditions: [] }

  for (const rule of rules) {
    const result = matchRule(rule, toolName, category, args)
    if (result.matched && result.rule) {
      if (!bestMatch.matched || result.rule.priority > bestMatch.rule!.priority) {
        bestMatch = result
      }
    }
  }
  return bestMatch
}

/** Parse a rule from a string DSL format.
 * Format: "allow readFile for path:*.ts"
 *         "deny bash for command:.*rm.*"
 *         "ask writeFile for path:dist/**"
 */
export function parseRuleString(str: string): PermissionRuleDSL | null {
  // Pattern: decision target for condition1 and condition2
  const match = str.match(/^(allow|deny|ask)\s+(\S+)(?:\s+for\s+(.+))?$/i)
  if (!match) return null

  const decision = match[1].toLowerCase() as PermissionDecision
  const target = match[2] === '*' ? '*' : match[2]
  const conditionsStr = match[3]?.trim()

  const conditions: RuleCondition[] = []

  if (conditionsStr) {
    // Split by " and " (case insensitive)
    const conditionParts = conditionsStr.split(/\s+and\s+/i)
    for (const part of conditionParts) {
      const condMatch = part.match(/^(path|command):(.+)$/i)
      if (condMatch) {
        const type = condMatch[1].toLowerCase() as 'path' | 'command'
        const pattern = condMatch[2].trim()
        conditions.push({ type, pattern })
      }
    }
  }

  return {
    decision,
    target: target as RuleTarget,
    conditions: conditions.length > 0 ? conditions : undefined,
  }
}

/** Default rules for common use cases. */
export const DEFAULT_RULES: PermissionRuleDSL[] = [
  // Allow read access to all files
  { decision: 'allow', target: 'read', description: 'Allow reading all files' },
  { decision: 'allow', target: 'glob', description: 'Allow globbing all files' },
  { decision: 'allow', target: 'grep', description: 'Allow grepping all files' },

  // Deny dangerous bash commands
  {
    decision: 'deny',
    target: 'bash',
    conditions: [{ type: 'command', pattern: 'rm\\s+-rf\\s+/' }],
    priority: 100,
    description: 'Deny rm -rf /',
  },
  {
    decision: 'deny',
    target: 'bash',
    conditions: [{ type: 'command', pattern: 'sudo\\s+rm' }],
    priority: 90,
    description: 'Deny sudo rm',
  },
  {
    decision: 'deny',
    target: 'bash',
    conditions: [{ type: 'command', pattern: '(chmod|chown)\\s+-R\\s+777' }],
    priority: 80,
    description: 'Deny recursive 777 permissions',
  },

  // Ask for writes outside src/
  {
    decision: 'ask',
    target: 'write',
    conditions: [{ type: 'path', pattern: '!src/**' }],
    priority: 50,
    description: 'Ask for writes outside src/',
  },
  {
    decision: 'ask',
    target: 'edit',
    conditions: [{ type: 'path', pattern: '!src/**' }],
    priority: 50,
    description: 'Ask for edits outside src/',
  },

  // Deny writes to sensitive files
  {
    decision: 'deny',
    target: 'write',
    conditions: [{ type: 'path', pattern: '*.{key,pem,crt,env,secret}' }],
    priority: 60,
    description: 'Deny writes to sensitive files',
  },
  {
    decision: 'deny',
    target: 'edit',
    conditions: [{ type: 'path', pattern: '*.{key,pem,crt,env,secret}' }],
    priority: 60,
    description: 'Deny edits to sensitive files',
  },
]
