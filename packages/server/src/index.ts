export { ForgeServer, createServer, type ServerOptions } from './server'
export {
  parseArgs,
  run,
  runAuthCommand,
  type ParsedArgs,
  type Subcommand,
  type ParseOptions,
} from './cli'
export { generateOpenAPISpec, openAPIDocsHtml, buildSpecApp } from './openapi'
export { createCorsMiddleware } from './middleware/cors'
export { createLoggingMiddleware } from './middleware/logging'
export { createErrorHandlerMiddleware, errorToResponse } from './middleware/error-handler'
export {
  createValidationMiddleware,
  sessionCreateSchema,
  promptSchema,
  toolExecuteSchema,
  configSchema,
} from './middleware/validation'
export {
  createSessionsRoutes,
  createPromptsRoutes,
  createToolsRoutes,
  createConfigRoutes,
  createSSERoutes,
  createHealthRoutes,
} from './routes'
export { SessionManager, type SessionManagerOptions } from './services/session-manager'
export {
  AgentExecutor,
  createAgentExecutor,
  type AgentExecutorOptions,
} from './services/agent-executor'
export { SSEHub, formatSSE, type SSEClient, type SSEStats } from './services/sse-hub'
export { SSEBridge } from './sse/bridge'
export {
  createModelResolver,
  type ModelResolver,
  type ModelResolverOptions,
} from './services/model-resolver'
export {
  createDefaultToolRegistry,
  toAgentTools,
} from './services/tool-registry'
export { RpcServer, type RpcMethod, type RpcServerOptions } from './rpc/server'
export { registerRpcMethods, type RpcBindingsOptions } from './rpc/bindings'
export {
  RPC_VERSION,
  RpcErrorCodes,
  encodeMessage,
  decodeMessage,
  makeError,
  makeSuccess,
  isRequest,
  isNotification,
  isResponse,
  type RpcId,
  type RpcMessage,
  type RpcRequest,
  type RpcNotification,
  type RpcSuccess,
  type RpcError,
  type RpcErrorBody,
} from './rpc/protocol'
export type {
  SessionResponse,
  PromptRequest,
  PromptResponse,
  ToolExecuteRequest,
  ToolExecuteResponse,
  ConfigRequest,
  ConfigResponse,
  ErrorResponse,
  SSEEvent,
  LoopEventType,
} from './types'

export {
  AuthStore,
  AUTH_KEY_PREFIX,
  type AuthKeyMetadata,
  type CreateKeyOptions,
  type CreateKeyResult,
  type ValidateResult,
} from './auth/store'
