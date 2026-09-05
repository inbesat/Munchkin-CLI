import type { PermissionMode } from '../config/schema'

/** Tool scope — determines availability and trust level. */
export type ToolScope = 'builtin' | 'user' | 'mcp' | 'plugin'

/** Risk level for permission defaults and UI hints. */
export type ToolRiskLevel = 'low' | 'medium' | 'high' | 'critical'

/** JSON Schema (TypeBox) for tool input validation and LLM function calling. */
export interface ToolSchema {
  readonly type: 'object'
  readonly properties: Record<string, unknown>
  readonly required?: readonly string[]
  readonly additionalProperties?: boolean | unknown
}

/**
 * Tool definition for LLM function calling.
 * Matches the shape expected by `@forge/ai` providers.
 */
export interface ToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: ToolSchema
}

/** Result of a tool execution. */
export interface ToolResult {
  readonly success: boolean
  readonly output?: string
  readonly error?: string
  readonly metadata?: Record<string, unknown>
}

/**
 * A registered tool with full metadata.
 * The `execute` function receives validated input (per `parameters`).
 */
export interface Tool {
  readonly name: string
  readonly description: string
  readonly parameters: ToolSchema
  readonly scope: ToolScope
  readonly risk: ToolRiskLevel
  readonly requiresPermission: boolean
  readonly permissionMode?: PermissionMode
  execute(input: Record<string, unknown>, signal?: AbortSignal): Promise<ToolResult>
}

/** Options for tool registration. */
export interface RegisterToolOptions {
  name: string
  description: string
  parameters: ToolSchema
  scope?: ToolScope
  risk?: ToolRiskLevel
  requiresPermission?: boolean
  permissionMode?: PermissionMode
  execute(input: Record<string, unknown>, signal?: AbortSignal): Promise<ToolResult>
}

/** Result of listing tools (optionally filtered by scope). */
export interface ListToolsResult {
  readonly tools: readonly Tool[]
  readonly scopes: readonly ToolScope[]
}

/** Registry configuration. */
export interface ToolRegistryConfig {
  /** Default permission mode for tools without explicit mode. */
  defaultPermissionMode: PermissionMode
  /** Whether to allow bypassing permission for critical tools in auto mode. */
  allowCriticalBypass: boolean
}