import { ErrorCode } from './codes'
import { getRecoveryHint } from './recovery'

export type ErrorSeverity = 'info' | 'warn' | 'error' | 'fatal'
export { ErrorCode } from './codes'

export class ForgeError extends Error {
  readonly code: ErrorCode
  readonly severity: ErrorSeverity
  readonly recovery: string | null
  readonly cause?: unknown

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      severity?: ErrorSeverity
      cause?: unknown
    },
  ) {
    super(message)
    this.name = 'ForgeError'
    this.code = code
    this.severity = options?.severity ?? 'error'
    this.recovery = getRecoveryHint(code)
    this.cause = options?.cause
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      severity: this.severity,
      recovery: this.recovery,
    }
  }
}

// ── Provider Errors ───────────────────────────────────────────────

export class ProviderError extends ForgeError {
  readonly provider: string

  constructor(
    code: ErrorCode,
    message: string,
    provider: string,
    options?: { severity?: ErrorSeverity; cause?: unknown },
  ) {
    super(code, message, options)
    this.name = 'ProviderError'
    this.provider = provider
  }

  toJSON() {
    return { ...super.toJSON(), provider: this.provider }
  }
}

// ── Tool Errors ───────────────────────────────────────────────────

export class ToolError extends ForgeError {
  readonly tool: string

  constructor(
    code: ErrorCode,
    message: string,
    tool: string,
    options?: { severity?: ErrorSeverity; cause?: unknown },
  ) {
    super(code, message, options)
    this.name = 'ToolError'
    this.tool = tool
  }

  toJSON() {
    return { ...super.toJSON(), tool: this.tool }
  }
}

// ── Permission Errors ─────────────────────────────────────────────

export class PermissionError extends ForgeError {
  readonly tool: string
  readonly mode: string

  constructor(message: string, tool: string, mode: string, options?: { cause?: unknown }) {
    super(ErrorCode.PERMISSION_DENIED, message, {
      severity: 'warn',
      ...options,
    })
    this.name = 'PermissionError'
    this.tool = tool
    this.mode = mode
  }

  toJSON() {
    return {
      ...super.toJSON(),
      tool: this.tool,
      mode: this.mode,
    }
  }
}

// ── Config Errors ─────────────────────────────────────────────────

export class ConfigError extends ForgeError {
  readonly configPath?: string

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      configPath?: string
      severity?: ErrorSeverity
      cause?: unknown
    },
  ) {
    super(code, message, options)
    this.name = 'ConfigError'
    this.configPath = options?.configPath
  }

  toJSON() {
    return { ...super.toJSON(), configPath: this.configPath }
  }
}

// ── Session Errors ────────────────────────────────────────────────

export class SessionError extends ForgeError {
  readonly sessionId: string

  constructor(
    code: ErrorCode,
    message: string,
    sessionId: string,
    options?: { severity?: ErrorSeverity; cause?: unknown },
  ) {
    super(code, message, options)
    this.name = 'SessionError'
    this.sessionId = sessionId
  }

  toJSON() {
    return { ...super.toJSON(), sessionId: this.sessionId }
  }
}

// ── Context Errors ────────────────────────────────────────────────

export class ContextError extends ForgeError {
  constructor(
    code: ErrorCode,
    message: string,
    options?: { severity?: ErrorSeverity; cause?: unknown },
  ) {
    super(code, message, options)
    this.name = 'ContextError'
  }
}

// ── MCP Errors ────────────────────────────────────────────────────

export class McpError extends ForgeError {
  readonly serverName: string

  constructor(
    code: ErrorCode,
    message: string,
    serverName: string,
    options?: { severity?: ErrorSeverity; cause?: unknown },
  ) {
    super(code, message, options)
    this.name = 'McpError'
    this.serverName = serverName
  }

  toJSON() {
    return { ...super.toJSON(), serverName: this.serverName }
  }
}

// ── Plugin Errors ─────────────────────────────────────────────────

export class PluginError extends ForgeError {
  readonly pluginName: string

  constructor(
    code: ErrorCode,
    message: string,
    pluginName: string,
    options?: { severity?: ErrorSeverity; cause?: unknown },
  ) {
    super(code, message, options)
    this.name = 'PluginError'
    this.pluginName = pluginName
  }

  toJSON() {
    return { ...super.toJSON(), pluginName: this.pluginName }
  }
}

// ── Sandbox Errors ────────────────────────────────────────────────

export class SandboxError extends ForgeError {
  constructor(
    code: ErrorCode,
    message: string,
    options?: { severity?: ErrorSeverity; cause?: unknown },
  ) {
    super(code, message, options)
    this.name = 'SandboxError'
  }
}

// ── Git Errors ────────────────────────────────────────────────────

export class GitError extends ForgeError {
  constructor(
    code: ErrorCode,
    message: string,
    options?: { severity?: ErrorSeverity; cause?: unknown },
  ) {
    super(code, message, options)
    this.name = 'GitError'
  }
}

// ── Type Guards ───────────────────────────────────────────────────

export function isForgeError(error: unknown): error is ForgeError {
  return error instanceof ForgeError
}

export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError
}

export function isToolError(error: unknown): error is ToolError {
  return error instanceof ToolError
}

export function isPermissionError(error: unknown): error is PermissionError {
  return error instanceof PermissionError
}

export function isConfigError(error: unknown): error is ConfigError {
  return error instanceof ConfigError
}

export function isSessionError(error: unknown): error is SessionError {
  return error instanceof SessionError
}

export function isContextError(error: unknown): error is ContextError {
  return error instanceof ContextError
}

export function isMcpError(error: unknown): error is McpError {
  return error instanceof McpError
}

export function isPluginError(error: unknown): error is PluginError {
  return error instanceof PluginError
}

export function isSandboxError(error: unknown): error is SandboxError {
  return error instanceof SandboxError
}

export function isGitError(error: unknown): error is GitError {
  return error instanceof GitError
}
