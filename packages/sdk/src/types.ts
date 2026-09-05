// @forge/sdk - Generated TypeScript SDK for the Forge server API.
// Types mirror the OpenAPI 3.1 spec served at /api/openapi.json (Phase 74).

export interface Session {
  id: string
  title?: string
  model: string
  cwd: string
  createdAt: number
  updatedAt: number
  endedAt?: number
  eventCount: number
  inputTokens: number
  outputTokens: number
  totalCost: number
  status: 'active' | 'completed' | 'errored'
}

export interface SessionCreateRequest {
  cwd: string
  model?: string
  title?: string
  parentSessionId?: string
}

export interface Usage {
  input: number
  output: number
  total: number
  cacheRead?: number
  cacheWrite?: number
}

export interface PromptRequest {
  prompt: string
  model?: string
  systemPrompt?: string
  tools?: string[]
  maxIterations?: number
}

export interface PromptResponse {
  sessionId: string
  response: string
  usage: Usage
  turns: number
  reason: 'complete' | 'max-iterations' | 'cancelled' | 'context-overflow' | 'error'
  error?: string
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ToolExecuteRequest {
  name: string
  args: Record<string, unknown>
}

export interface ToolExecuteResponse {
  result: string
  error?: string
  durationMs: number
}

export type ConfigScope = 'global' | 'project' | 'local'

export interface ConfigValue {
  key: string
  value: unknown
}

export interface ConfigSetRequest {
  key: string
  value: unknown
  scope?: ConfigScope
}

export interface AuthStatus {
  authenticated: boolean
  providers: Record<string, boolean>
}

export interface ApiKeyMetadata {
  id: string
  name: string
  env: string
  scopes: string[]
  createdAt: number
  lastUsedAt?: number
  rateLimit: { capacity: number; refillPerSec: number }
  description?: string
}

export interface CreateKeyRequest {
  name: string
  env?: string
  scopes?: string[]
  description?: string
  rateLimit?: { capacity?: number; refillPerSec?: number }
}

export interface CreateKeyResponse {
  key: ApiKeyMetadata
  secret: string
}

export interface ListKeysResponse {
  keys: ApiKeyMetadata[]
}

export interface RevokeKeyResponse {
  success: boolean
}

export interface RateLimitEntry {
  id: string
  tokens: number
  capacity: number
  refillPerSec: number
}

export interface UsageResponse {
  rateLimits: RateLimitEntry[]
}

export interface SSEStats {
  totalClients: number
  clients: Array<{ id: string; sessionIds: string[]; connectedAt: number; duration: number }>
}

export interface BroadcastRequest {
  sessionId?: string
  event: string
  data: unknown
  /** Last event id for replay hint (only used when sessionId is set). */
  id?: string
}

export interface BroadcastResponse {
  delivered: number
  failed: number
  sessionId?: string
}

export interface AttachRequest {
  clientId: string
}

export interface AttachResponse {
  sessionId: string
  clientId: string
  attached: boolean
}

export interface DetachResponse {
  sessionId: string
  clientId: string
  detached: boolean
}

export interface SessionPresence {
  sessionId: string
  clientCount: number
  clientIds: string[]
}

export interface ActiveSessionsResponse {
  activeSessions: string[]
}

export interface ReplayRequest {
  sessionId: string
  fromIndex?: number
  limit?: number
}

export interface ReplayResponse {
  sessionId: string
  fromIndex: number
  delivered: number
  count: number
  nextIndex: number
}

export interface HealthResponse {
  status: string
  version: string
  uptime: number
  timestamp: number
  services: {
    sessionStore: string
    sessionManager: string
    agentExecutor: string
  }
}

export interface ReadyResponse {
  ready: boolean
  checks: Record<string, boolean>
}

export interface OkResponse {
  success: boolean
}

export interface ForgeErrorBody {
  code: string
  message: string
  details?: unknown
}

export interface ForgeErrorResponse {
  error: ForgeErrorBody
}

// Typed SSE event names emitted by the SSEBridge (Phase 75).
export type SSEEventName =
  | 'connected'
  | 'text_delta'
  | 'thinking_delta'
  | 'tool_call'
  | 'tool_call_delta'
  | 'tool_result'
  | 'turn'
  | 'usage'
  | 'agent_done'
  | 'agent_error'
  | 'steering'

export interface SSEConnectedEvent {
  clientId: string
  sessionIds: string[]
}

export interface SSETextDeltaEvent {
  sessionId: string
  delta: string
}

export interface SSEThinkingDeltaEvent {
  sessionId: string
  delta: string
}

export interface SSEToolCallEvent {
  sessionId: string
  toolCall: unknown
}

export interface SSEToolCallDeltaEvent {
  sessionId: string
  toolCallId: string
  name: string
  delta: string
}

export interface SSEToolResultEvent {
  sessionId: string
  toolCallId: string
  toolName: string
  error?: string
  durationMs: number
}

export interface SSETurnEvent {
  sessionId: string
  turn: number
}

export interface SSEUsageEvent {
  sessionId: string
  usage: Usage
}

export interface SSEAgentDoneEvent {
  sessionId: string
  reason: string
}

export interface SSEAgentErrorEvent {
  sessionId: string
  error: string
}

export interface SSESteeringEvent {
  sessionId: string
  content: string
  turn: number
}

export type SSEEventPayload =
  | SSEConnectedEvent
  | SSETextDeltaEvent
  | SSEThinkingDeltaEvent
  | SSEToolCallEvent
  | SSEToolCallDeltaEvent
  | SSEToolResultEvent
  | SSETurnEvent
  | SSEUsageEvent
  | SSEAgentDoneEvent
  | SSEAgentErrorEvent
  | SSESteeringEvent
  | { raw: unknown }

export interface ParsedSSEFrame {
  event: string
  data: unknown
  id?: string
  retry?: number
}

export type SessionListQuery = {
  limit?: number
}

export type SessionSearchQuery = {
  q?: string
}

export type SessionEventsQuery = {
  from?: number
}
