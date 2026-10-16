// @forge/mcp - MCP client and MCP server implementation
export const VERSION = '0.1.0'

// MCP client, stdio transport (Phase 117)
export {
  McpStdioTransport,
  type JsonRpcError,
  type JsonRpcMessage,
  type JsonRpcNotification,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type McpSpawnOptions,
} from './client/stdio'
export {
  MCP_PROTOCOL_VERSION,
  McpToolClient,
  type McpCallResult,
  type McpConnectResult,
  type CoreToolRegistryLike,
  type McpListResult,
  type McpServerInfo,
  type McpToolContent,
  type McpToolDescriptor,
  type McpToolResult,
} from './client/tools'
