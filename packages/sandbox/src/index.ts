// @forge/sandbox - Seatbelt, Landlock, ACL, Docker, E2B sandbox providers
export const VERSION = '0.1.0'

// SandboxProvider platform abstraction (Phase 125)
export {
  MockSandboxProvider,
  defineSandboxProvider,
  type IsolationCheck,
  type IsolationReport,
  type SandboxCommandRequest,
  type SandboxExecutionResult,
  type SandboxInfo,
  type SandboxProvider,
} from './types'

// Windows restricted-token runner (Phase 126)
export {
  WINDOWS_SANDBOX_ID,
  WindowsSandboxProvider,
  sensitiveDirectories,
  windowsSandboxProvider,
} from './windows/runner'
