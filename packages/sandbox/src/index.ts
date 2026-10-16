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

// macOS Seatbelt provider (Phase 127)
export {
  MACOS_SANDBOX_ID,
  MacosSeatbeltProvider,
  buildSeatbeltProfile,
  macosSeatbeltProvider,
  type SeatbeltProfileOptions,
} from './macos/sandbox'

// Linux Landlock provider via bubblewrap (Phase 128)
export {
  LINUX_SANDBOX_ID,
  LandlockProvider,
  buildBwrapArgs,
  linuxLandlockProvider,
  type BwrapOptions,
} from './linux/sandbox'
