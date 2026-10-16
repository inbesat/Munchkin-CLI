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

// Bundled connector presets (Phase 121)
export {
  CONNECTOR_PRESETS,
  McpPresetsConfig,
  getPreset,
  installPreset,
  resolveServerSpec,
  type ConnectorPreset,
  type InstallPresetResult,
  type McpServersConfig,
  type ResolvedServerSpec,
} from './presets'

// Connector wizard (Phase 122)
export {
  ConnectorWizard,
  connectSpec,
  type WizardAnswers,
  type WizardState,
  type WizardStep,
} from './presets/wizard'
export {
  LazyToolIndex,
  type LazyResult,
  type LazyStats,
  type LazyToolEntry,
  type SchemaLoader,
  type SearchResult,
  type ToolSchema,
} from './client/lazy'
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

// OAuth for remote servers (Phase 119)
export {
  McpOAuthFlow,
  TokenStore,
  buildPkcePair,
  fetchOAuthMetadata,
  type AuthorizeOptions,
  type AuthorizeResult,
  type OAuthEndpoints,
  type OAuthTokenSet,
  type TokenStoreOptions,
} from './auth/oauth'
