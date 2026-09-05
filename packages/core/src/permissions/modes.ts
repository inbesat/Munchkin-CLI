import { AgentTool } from '../agent/types'

/** Permission decision for a tool call. */
export type PermissionDecision = 'allow' | 'ask' | 'deny'

/** Available permission modes. */
export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'auto'
  | 'dontAsk'
  | 'bypass'

/** Tool category for permission grouping. */
export type ToolCategory =
  | 'read'
  | 'write'
  | 'edit'
  | 'bash'
  | 'glob'
  | 'grep'
  | 'task'
  | 'webfetch'
  | 'websearch'
  | 'notebook'
  | 'custom'

/** Permission rule for a specific tool or category. */
export interface PermissionRule {
  /** Tool name or category this rule applies to. */
  target: string | ToolCategory
  /** Decision for this rule. */
  decision: PermissionDecision
  /** Optional condition for when this rule applies. */
  condition?: (args: Record<string, unknown>) => boolean
}

/** Result of a permission check. */
export interface PermissionCheckResult {
  /** The final decision. */
  decision: PermissionDecision
  /** The mode that produced this decision. */
  mode: PermissionMode
  /** The rule that matched (if any). */
  matchedRule?: PermissionRule
  /** Whether this was an explicit user choice (not a default). */
  explicit: boolean
}

/** Configuration for permission modes. */
export interface PermissionModeConfig {
  /** The active permission mode. */
  mode: PermissionMode
  /** Custom rules that override mode defaults. */
  customRules?: PermissionRule[]
  /** Whether to persist mode across sessions. */
  persistMode?: boolean
}

/** Default permission rules for each mode. */
const MODE_RULES: Record<PermissionMode, PermissionRule[]> = {
  default: [
    // Read-only tools are allowed by default
    { target: 'read', decision: 'allow' },
    { target: 'glob', decision: 'allow' },
    { target: 'grep', decision: 'allow' },
    { target: 'task', decision: 'allow' },
    { target: 'webfetch', decision: 'allow' },
    { target: 'websearch', decision: 'allow' },
    // Write/edit/bash require asking
    { target: 'write', decision: 'ask' },
    { target: 'edit', decision: 'ask' },
    { target: 'bash', decision: 'ask' },
    { target: 'notebook', decision: 'ask' },
    // Custom tools default to ask
    { target: 'custom', decision: 'ask' },
  ],
  acceptEdits: [
    // Read-only tools allowed
    { target: 'read', decision: 'allow' },
    { target: 'glob', decision: 'allow' },
    { target: 'grep', decision: 'allow' },
    { target: 'task', decision: 'allow' },
    { target: 'webfetch', decision: 'allow' },
    { target: 'websearch', decision: 'allow' },
    // Write/edit allowed without asking
    { target: 'write', decision: 'allow' },
    { target: 'edit', decision: 'allow' },
    // Bash still requires asking
    { target: 'bash', decision: 'ask' },
    { target: 'notebook', decision: 'ask' },
    { target: 'custom', decision: 'ask' },
  ],
  plan: [
    // All tools require asking in plan mode
    { target: 'read', decision: 'ask' },
    { target: 'glob', decision: 'ask' },
    { target: 'grep', decision: 'ask' },
    { target: 'task', decision: 'ask' },
    { target: 'webfetch', decision: 'ask' },
    { target: 'websearch', decision: 'ask' },
    { target: 'write', decision: 'ask' },
    { target: 'edit', decision: 'ask' },
    { target: 'bash', decision: 'ask' },
    { target: 'notebook', decision: 'ask' },
    { target: 'custom', decision: 'ask' },
  ],
  auto: [
    // Everything allowed in auto mode
    { target: 'read', decision: 'allow' },
    { target: 'glob', decision: 'allow' },
    { target: 'grep', decision: 'allow' },
    { target: 'task', decision: 'allow' },
    { target: 'webfetch', decision: 'allow' },
    { target: 'websearch', decision: 'allow' },
    { target: 'write', decision: 'allow' },
    { target: 'edit', decision: 'allow' },
    { target: 'bash', decision: 'allow' },
    { target: 'notebook', decision: 'allow' },
    { target: 'custom', decision: 'allow' },
  ],
  dontAsk: [
    // Read-only allowed, everything else denied
    { target: 'read', decision: 'allow' },
    { target: 'glob', decision: 'allow' },
    { target: 'grep', decision: 'allow' },
    { target: 'task', decision: 'allow' },
    { target: 'webfetch', decision: 'allow' },
    { target: 'websearch', decision: 'allow' },
    { target: 'write', decision: 'deny' },
    { target: 'edit', decision: 'deny' },
    { target: 'bash', decision: 'deny' },
    { target: 'notebook', decision: 'deny' },
    { target: 'custom', decision: 'deny' },
  ],
  bypass: [
    // Everything allowed, no checks
    { target: 'read', decision: 'allow' },
    { target: 'glob', decision: 'allow' },
    { target: 'grep', decision: 'allow' },
    { target: 'task', decision: 'allow' },
    { target: 'webfetch', decision: 'allow' },
    { target: 'websearch', decision: 'allow' },
    { target: 'write', decision: 'allow' },
    { target: 'edit', decision: 'allow' },
    { target: 'bash', decision: 'allow' },
    { target: 'notebook', decision: 'allow' },
    { target: 'custom', decision: 'allow' },
  ],
}

/** Tool to category mapping. */
const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  readFile: 'read',
  read: 'read',
  writeFile: 'write',
  write: 'write',
  editFile: 'edit',
  edit: 'edit',
  bash: 'bash',
  glob: 'glob',
  grep: 'grep',
  todoWrite: 'task',
  todoRead: 'task',
  webFetch: 'webfetch',
  webSearch: 'websearch',
  notebookEdit: 'notebook',
}

/** Get the category for a tool. */
export function getToolCategory(tool: AgentTool | string): ToolCategory {
  const name = typeof tool === 'string' ? tool : tool.name
  return TOOL_CATEGORIES[name] ?? 'custom'
}

/** Get the default rules for a mode. */
export function getModeRules(mode: PermissionMode): PermissionRule[] {
  return MODE_RULES[mode] ?? MODE_RULES.default
}

/** Check permission for a tool call against a mode. */
export function checkPermission(
  tool: AgentTool | string,
  args: Record<string, unknown>,
  config: PermissionModeConfig,
): PermissionCheckResult {
  const mode = config.mode
  const rules = [...(config.customRules ?? []), ...getModeRules(mode)]

  const toolName = typeof tool === 'string' ? tool : tool.name
  const category = getToolCategory(tool)

  // Check rules in order (custom rules first, then mode defaults)
  for (const rule of rules) {
    const matches = matchRule(rule, toolName, category, args)
    if (matches) {
      return {
        decision: rule.decision,
        mode,
        matchedRule: rule,
        explicit: config.customRules?.includes(rule) ?? false,
      }
    }
  }

  // Default fallback
  return {
    decision: 'ask',
    mode,
    explicit: false,
  }
}

/** Check if a rule matches a tool call. */
function matchRule(
  rule: PermissionRule,
  toolName: string,
  category: ToolCategory,
  args: Record<string, unknown>,
): boolean {
  // Check target match
  if (typeof rule.target === 'string') {
    if (rule.target !== toolName && rule.target !== category) {
      return false
    }
  } else if (rule.target !== category) {
    return false
  }

  // Check condition if present
  if (rule.condition && !rule.condition(args)) {
    return false
  }

  return true
}

/** Cycle to the next permission mode. */
export function cycleMode(current: PermissionMode): PermissionMode {
  const modes: PermissionMode[] = [
    'default',
    'acceptEdits',
    'plan',
    'auto',
    'dontAsk',
    'bypass',
  ]
  const idx = modes.indexOf(current)
  return modes[(idx + 1) % modes.length]
}

/** Get human-readable description of a mode. */
export function getModeDescription(mode: PermissionMode): string {
  const descriptions: Record<PermissionMode, string> = {
    default: 'Ask for write/edit/bash, allow read/glob/grep',
    acceptEdits: 'Allow write/edit, ask for bash',
    plan: 'Ask for everything',
    auto: 'Allow everything',
    dontAsk: 'Allow read-only, deny write/edit/bash',
    bypass: 'Allow everything (no checks)',
  }
  return descriptions[mode]
}

/** Get short label for UI display. */
export function getModeLabel(mode: PermissionMode): string {
  const labels: Record<PermissionMode, string> = {
    default: 'DEFAULT',
    acceptEdits: 'ACCEPT EDITS',
    plan: 'PLAN',
    auto: 'AUTO',
    dontAsk: 'DONT ASK',
    bypass: 'BYPASS',
  }
  return labels[mode]
}

/** Validate a permission mode string. */
export function isValidMode(mode: string): mode is PermissionMode {
  return [
    'default',
    'acceptEdits',
    'plan',
    'auto',
    'dontAsk',
    'bypass',
  ].includes(mode)
}