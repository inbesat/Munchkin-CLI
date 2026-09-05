import { ToolRegistry, createToolRegistryConfig, ToolError, ErrorCode } from '@forge/core'
import type { AgentTool } from '@forge/core'
import {
  createReadTool,
  createWriteTool,
  createEditTool,
  createBashTool,
  createGlobTool,
  createGrepTool,
  createTodoWriteTool,
  createTodoReadTool,
  createWebFetchTool,
  createWebSearchTool,
  createNotebookEditTool,
} from '@forge/core'

/**
 * Builds the default server-side tool registry from the core built-in tools.
 *
 * Tools run with `auto` permission mode: the server is trusted to execute them
 * on behalf of connected clients. Each core {@link Tool} is adapted to the
 * loop's {@link AgentTool} contract (which returns a plain string).
 */
export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry(createToolRegistryConfig('auto'))

  const tools = [
    createReadTool(),
    createWriteTool(),
    createEditTool(),
    createBashTool(),
    createGlobTool(),
    createGrepTool(),
    createTodoWriteTool(),
    createTodoReadTool(),
    createWebFetchTool(),
    createWebSearchTool(),
    createNotebookEditTool(),
  ]

  for (const tool of tools) {
    registry.register({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      execute: tool.execute,
      scope: tool.scope,
      risk: tool.risk,
      requiresPermission: tool.requiresPermission,
      permissionMode: tool.permissionMode,
    })
  }

  return registry
}

/** Adapts a core {@link ToolRegistry} into the loop's {@link AgentTool} list. */
export function toAgentTools(registry: ToolRegistry): AgentTool[] {
  return registry.list().tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters as unknown as Record<string, unknown>,
    execute: async (args: Record<string, unknown>, signal?: AbortSignal): Promise<string> => {
      const result = await tool.execute(args, signal)
      if (result.success) return result.output ?? ''
      throw new ToolError(ErrorCode.TOOL_EXECUTION_FAILED, result.error ?? 'Tool failed', tool.name)
    },
  }))
}
