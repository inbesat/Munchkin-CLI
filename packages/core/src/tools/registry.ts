import { ToolError, PermissionError, ErrorCode } from '../errors'
import type {
  Tool,
  ToolDefinition,
  ToolResult,
  ToolScope,
  RegisterToolOptions,
  ListToolsResult,
  ToolRegistryConfig,
} from './types'
import type { PermissionMode } from '../config/schema'

/**
 * ToolRegistry — scoped, typed registry of all tools the agent can use.
 *
 * Each tool has: name, description, input schema (TypeBox), execution function,
 * risk level, and whether it requires permission. The registry supports:
 * - register tools
 * - list tools (filtered by scope)
 * - get tool by name
 * - execute tool (with permission check)
 */
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>()
  private readonly scopes = new Map<string, ToolScope>()

  constructor(private readonly config: ToolRegistryConfig) {}

  /** Register a new tool. Throws if name already exists. */
  register(options: RegisterToolOptions): void {
    const { name } = options
    if (this.tools.has(name)) {
      throw new ToolError(
        ErrorCode.TOOL_EXECUTION_FAILED,
        `Tool already registered: ${name}`,
        name,
      )
    }

    const tool: Tool = {
      name,
      description: options.description,
      parameters: options.parameters,
      scope: options.scope ?? 'builtin',
      risk: options.risk ?? 'medium',
      requiresPermission: options.requiresPermission ?? true,
      permissionMode: options.permissionMode,
      execute: options.execute,
    }

    this.tools.set(name, tool)
    this.scopes.set(name, tool.scope)
  }

  /** Get a tool by name. Returns undefined if not found. */
  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  /** Check if a tool is registered. */
  has(name: string): boolean {
    return this.tools.has(name)
  }

  /**
   * List all tools, optionally filtered by scope.
   * Returns tools and available scopes.
   */
  list(scope?: ToolScope): ListToolsResult {
    const tools = [...this.tools.values()]
    const filtered = scope ? tools.filter((t) => t.scope === scope) : tools
    const allScopes = [...new Set(tools.map((t) => t.scope))] as ToolScope[]
    return { tools: filtered, scopes: allScopes }
  }

  /** Get the schema definitions for all tools (for LLM function calling). */
  getDefinitions(scope?: ToolScope): readonly ToolDefinition[] {
    const tools = this.list(scope).tools
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }))
  }

  /**
   * Execute a tool with permission check.
   * Returns ToolResult on success, throws ToolError or PermissionError on failure.
   */
  async execute(
    name: string,
    input: Record<string, unknown>,
    signal?: AbortSignal,
    options?: { permissionMode?: PermissionMode; userConfirmed?: boolean },
  ): Promise<ToolResult> {
    const tool = this.tools.get(name)
    if (!tool) {
      throw new ToolError(
        ErrorCode.TOOL_NOT_FOUND,
        `Tool not found: ${name}`,
        name,
      )
    }

    // Check abort signal BEFORE permission check
    if (signal?.aborted) {
      throw new ToolError(
        ErrorCode.CANCELLED,
        `Tool execution cancelled: ${name}`,
        name,
      )
    }

    // Permission check
    const effectiveMode = options?.permissionMode ?? tool.permissionMode ?? this.config.defaultPermissionMode
    if (tool.requiresPermission && !this.checkPermission(effectiveMode, tool, options?.userConfirmed)) {
      throw new PermissionError(
        `Permission denied for tool: ${name} (mode: ${effectiveMode})`,
        name,
        effectiveMode,
      )
    }

    // Execute with timeout and abort support
    try {
      const result = await this.runWithTimeout(tool.execute(input, signal), 120_000, signal)
      return result
    } catch (err) {
      if (err instanceof ToolError || err instanceof PermissionError) {
        throw err
      }
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ToolError(
          ErrorCode.CANCELLED,
          `Tool execution cancelled: ${name}`,
          name,
          { cause: err },
        )
      }
      throw new ToolError(
        ErrorCode.TOOL_EXECUTION_FAILED,
        `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
        name,
        { cause: err },
      )
    }
  }

  /** Execute multiple tools in sequence, collecting results. */
  async executeAll(
    calls: readonly { name: string; input: Record<string, unknown> }[],
    signal?: AbortSignal,
    options?: { permissionMode?: PermissionMode },
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = []
    for (const call of calls) {
      if (signal?.aborted) break
      try {
        results.push(await this.execute(call.name, call.input, signal, options))
      } catch (err) {
        if (err instanceof ToolError && err.code === ErrorCode.CANCELLED) {
          break
        }
        throw err
      }
    }
    return results
  }

  private checkPermission(mode: PermissionMode, tool: Tool, userConfirmed?: boolean): boolean {
    switch (mode) {
      case 'allow':
      case 'bypass':
        return true
      case 'deny':
        return false
      case 'ask':
        // In 'ask' mode, we only proceed if user explicitly confirmed
        return userConfirmed === true
      case 'auto':
        // In 'auto' mode, low/medium risk tools auto-approve; high/critical require confirmation
        return tool.risk === 'low' || tool.risk === 'medium'
      case 'plan':
        // Plan mode: only low risk tools execute without confirmation
        // (plan has been approved, so permission is implicit for read-only ops)
        return tool.risk === 'low'
      default:
        return false
    }
  }

  private async runWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<T> {
    if (!signal) {
      return Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Tool execution timeout after ${timeoutMs}ms`)), timeoutMs),
        ),
      ])
    }

    // Race between promise, timeout, and abort signal
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Tool execution timeout after ${timeoutMs}ms`))
      }, timeoutMs)

      const abortHandler = () => {
        clearTimeout(timeoutId)
        reject(new DOMException('Aborted', 'AbortError'))
      }

      signal.addEventListener('abort', abortHandler, { once: true })

      promise
        .then((value) => {
          clearTimeout(timeoutId)
          signal.removeEventListener('abort', abortHandler)
          resolve(value)
        })
        .catch((err) => {
          clearTimeout(timeoutId)
          signal.removeEventListener('abort', abortHandler)
          reject(err)
        })
    })
  }
}

/** Create a default registry configuration from PermissionMode. */
export function createToolRegistryConfig(defaultMode: PermissionMode = 'ask'): ToolRegistryConfig {
  return {
    defaultPermissionMode: defaultMode,
    allowCriticalBypass: false,
  }
}