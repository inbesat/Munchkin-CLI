// @forge/core - Event log, sessions, agent loop, tools, permissions
export const VERSION = '0.1.0'

// Config
export {
  ForgeConfig,
  PermissionMode,
  PermissionRule,
  ModelConfig,
  ProviderConfig,
  McpServerConfig,
  HookConfig,
  HookEvent,
  PluginConfig,
  PluginSource,
  SkillConfig,
  SandboxConfig,
  SandboxProvider,
  ThemeConfig,
  ContextConfig,
  AgentConfig,
  TelemetryConfig,
  ConfigSource,
} from './config/schema'
export { DEFAULT_CONFIG, mergeConfigs } from './config/defaults'
export {
  loadConfig,
  getProjectConfigPath,
  getGlobalConfigPath,
  getLocalConfigPath,
} from './config/loader'

// Errors
export {
  ForgeError,
  ProviderError,
  ToolError,
  PermissionError,
  ConfigError,
  SessionError,
  ContextError,
  McpError,
  PluginError,
  SandboxError,
  GitError,
  isForgeError,
  isProviderError,
  isToolError,
  isPermissionError,
  isConfigError,
  isSessionError,
  isContextError,
  isMcpError,
  isPluginError,
  isSandboxError,
  isGitError,
} from './errors'
export type { ErrorSeverity } from './errors'
export { ErrorCode } from './errors/codes'
export type { ErrorCode as ErrorCodeType } from './errors/codes'
export { RecoveryHint, getRecoveryHint } from './errors/recovery'

// Logger
export { Logger, getLogger, setDefaultLogger } from './logger'
export type { LogLevel, LogEntry, LoggerOptions } from './logger'

// Events
export { SessionLog, createEvent } from './events'
export type {
  SessionEvent,
  SessionCreatedEvent,
  SessionMessageEvent,
  SessionToolCallEvent,
  SessionToolResultEvent,
  SessionErrorEvent,
  SessionCompactionEvent,
  SessionEndedEvent,
  EventType,
  EventBase,
} from './events'
export { SCHEMA_VERSION } from './events'

// Store
export { SessionStore } from './store'
export type { SessionMeta } from './store'
export { StoreSync } from './store'
export type { SyncResult } from './store'
export { openDatabase } from './store'
export type { SessionRow, SessionInsert } from './store'

// Session Resume
export {
  resumeSession,
  hasIncompleteToolCalls,
  getResumePoint,
  forkSession,
  forkSessionAtMessage,
  SessionSearch,
  exportSession,
  shareSession,
  sanitizeContent,
  sanitizeEvents,
  hydrateMessages,
  assembleMessages,
  isUserMessage,
  isAssistantMessage,
  isSystemMessage,
} from './session'
export type {
  ResumedSession,
  ResumeOptions,
  ConversationMessage,
  PendingToolCall,
  ToolCallRecord,
  ForkOptions,
  ForkResult,
  SearchFilters,
  SearchResult,
  ExportFormat,
  ExportOptions,
  ExportResult,
  ShareOptions,
  ShareResult,
  Message,
  UserMessage,
  AssistantMessage,
  SystemMessage,
  MessagePart,
  TextPart,
  ToolCallPart,
  ToolResultPart,
  ThinkingPart,
  ProviderFormat,
  ProviderMessage,
  HydrationOptions,
} from './session'
export {
  buildTrajectory,
  type TrajectoryStep,
  type TrajectoryStepKind,
} from './session'

// Cost
export {
  CostTracker,
  CostQueries,
  calculateCost,
  getModelPricing,
  ensureTokenUsageTable,
} from './cost'
export type {
  LLMUsage,
  ModelPricing,
  TokenUsageRow,
  TokenUsageInsert,
  CostSummary,
  ModelCostBreakdown,
  DailyCostBreakdown,
} from './cost'

// Stats aggregation (Phase 143)
export * from './stats'

// Telemetry (Phase 147)
export * from './telemetry'

// Agent Loop (Phase 33)
export * from './agent'

// Tool Registry (Phase 34)
export * from './tools'

// Diff Rendering Pipeline (Phase 42)
export * from './diff'

// Context budget, compaction, and model-visible history projection
export * from './context'
export { assembleContextMessages } from './session/hydration'
