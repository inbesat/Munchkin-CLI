import type { HookOutcome } from '../engine'

/**
 * `mcp_tool` hook handler (Phase 104): invoke an MCP tool and interpret the
 * result. Block convention: the tool result carries `block: true` with a
 * `reason`. The invoker is injected at the composition root — the MCP client
 * itself arrives with the MCP integration phase; the handler logic here is
 * complete.
 */
export interface McpToolHookOptions {
  toolName: string
  /** Args template merged under the event payload key. */
  args?: Record<string, unknown>
  invoker: (
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<{ ok: boolean; output: unknown }>
}

export function mcpToolHook(
  options: McpToolHookOptions,
): (payload: unknown) => Promise<HookOutcome> {
  return async (payload) => {
    const result = await options.invoker(options.toolName, {
      ...(options.args ?? {}),
      event: payload as Record<string, unknown>,
    })
    if (!result.ok) {
      return {
        block: true,
        reason: `mcp tool FAILED: ${JSON.stringify(result.output)}`,
      }
    }
    const output = result.output as { block?: boolean; reason?: string } | null
    if (output !== null && typeof output === 'object' && output.block === true) {
      return { block: true, reason: output.reason ?? 'blocked by mcp tool' }
    }
    return undefined
  }
}
