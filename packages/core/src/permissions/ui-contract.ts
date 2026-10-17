import type { AgentTool } from '../agent/types'
import type { PermissionDecision, ToolCategory } from './modes'
import type { ProfileCheckResult } from './profiles'

/** Permission request sent to the UI. */
export interface PermissionRequest {
  /** Unique request ID. */
  id: string
  /** Timestamp when request was made. */
  timestamp: string
  /** Tool being requested. */
  tool: AgentTool
  /** Tool arguments. */
  args: Record<string, unknown>
  /** Tool category. */
  category: ToolCategory
  /** Current session ID. */
  sessionId: string
  /** Current permission mode. */
  permissionMode: string
  /** Risk assessment if available. */
  riskLevel?: 'low' | 'medium' | 'high' | 'critical'
  /** Risk reason if available. */
  riskReason?: string
  /** Whether this is a retry after a previous denial. */
  isRetry?: boolean
  /** Profile check result if applicable. */
  profileResult?: ProfileCheckResult
  /** Additional context for the UI. */
  context?: Record<string, unknown>
}

/** User's response to a permission request. */
export interface PermissionResponse {
  /** The request ID this responds to. */
  requestId: string
  /** The decision. */
  decision: PermissionDecision
  /** Whether to remember this decision for similar future requests. */
  remember?: boolean
  /** Optional custom rule to add based on this decision. */
  customRule?: {
    target: string | ToolCategory
    condition?: (args: Record<string, unknown>) => boolean
  }
  /** Optional user message. */
  message?: string
}

/** Configuration for how the UI should behave. */
export interface UIConfig {
  /** Default decision if user doesn't respond (for headless). */
  defaultDecision?: PermissionDecision
  /** Timeout in ms before using default decision. Default: 30000. */
  timeout?: number
  /** Whether to show risk assessment. Default: true. */
  showRisk?: boolean
  /** Whether to show tool arguments. Default: true. */
  showArgs?: boolean
  /** Whether to allow "remember" checkbox. Default: true. */
  allowRemember?: boolean
  /** Custom prompt message template. */
  promptTemplate?: string
}

/** UI capabilities for feature detection. */
export interface UICapabilities {
  /** Supports interactive prompts. */
  interactive: boolean
  /** Supports rich formatting (colors, markdown). */
  richFormatting: boolean
  /** Supports streaming updates. */
  streaming: boolean
  /** Supports keyboard shortcuts. */
  keyboardShortcuts: boolean
  /** Supports multi-select. */
  multiSelect: boolean
}

/** Permission UI interface.
 * Implementations: TUI (interactive), Headless (auto), SDK (callback), Web (HTTP).
 */
export interface PermissionUI {
  /** Request permission for a tool call. */
  requestPermission(request: PermissionRequest): Promise<PermissionResponse>

  /** Notify UI of a permission decision made elsewhere. */
  notifyDecision?(request: PermissionRequest, response: PermissionResponse): void

  /** Notify UI of a tool call result. */
  notifyToolResult?(requestId: string, success: boolean, result?: unknown, error?: string): void

  /** Get UI capabilities. */
  getCapabilities(): UICapabilities

  /** Get UI configuration. */
  getConfig(): UIConfig

  /** Update UI configuration. */
  setConfig(config: Partial<UIConfig>): void

  /** Called when a session starts. */
  onSessionStart?(sessionId: string): void

  /** Called when a session ends. */
  onSessionEnd?(sessionId: string): void

  /** Called when permission mode changes. */
  onModeChange?(oldMode: string, newMode: string): void
}

/** Batch permission request for multiple tools. */
export interface BatchPermissionRequest {
  /** Unique batch ID. */
  id: string
  /** Individual requests. */
  requests: PermissionRequest[]
  /** Whether all must be approved together. */
  allOrNothing: boolean
  /** Session ID. */
  sessionId: string
}

/** Batch permission response. */
export interface BatchPermissionResponse {
  batchId: string
  responses: Map<string, PermissionResponse>
}

/** Extended UI with batch support. */
export interface BatchPermissionUI extends PermissionUI {
  requestBatchPermission(batch: BatchPermissionRequest): Promise<BatchPermissionResponse>
}

/** Headless UI configuration. */
export interface HeadlessUIConfig extends UIConfig {
  /** Auto-approve tools matching these patterns. */
  autoApprovePatterns?: (string | RegExp)[]
  /** Auto-deny tools matching these patterns. */
  autoDenyPatterns?: (string | RegExp)[]
  /** Callback for custom decision logic. */
  customDecider?: (request: PermissionRequest) => Promise<PermissionDecision>
}

/** SDK callback-based UI configuration. */
export interface SDKUIConfig extends UIConfig {
  /** Callback when permission is requested. */
  onRequest: (request: PermissionRequest) => Promise<PermissionResponse>
  /** Callback for tool results. */
  onResult?: (requestId: string, success: boolean, result?: unknown, error?: string) => void
}

/** Mock UI for testing. */
export class MockPermissionUI implements PermissionUI {
  private responses: Map<string, PermissionResponse> = new Map()
  private defaultDecision: PermissionDecision = 'allow'
  private callLog: Array<{
    request: PermissionRequest | Pick<PermissionRequest, 'id'>
    response: PermissionResponse | Pick<PermissionResponse, 'decision'>
  }> = []

  constructor(
    defaultDecision: PermissionDecision = 'allow',
    private responsesMap?: Map<string, PermissionDecision>,
  ) {
    this.defaultDecision = defaultDecision
  }

  async requestPermission(request: PermissionRequest): Promise<PermissionResponse> {
    let decision = this.defaultDecision

    // Check for request-specific response first
    const specificResponse = this.responses.get(request.id)
    if (specificResponse) {
      decision = specificResponse.decision
    } else {
      const mapped = this.responsesMap?.get(request.id) ?? this.responsesMap?.get(request.tool.name)
      if (mapped !== undefined) decision = mapped
    }

    const response: PermissionResponse = {
      requestId: request.id,
      decision,
      remember: false,
    }

    this.responses.set(request.id, response)
    this.callLog.push({ request, response })

    return response
  }

  notifyDecision(request: PermissionRequest, response: PermissionResponse): void {
    this.callLog.push({ request, response })
  }

  notifyToolResult(_requestId: string, success: boolean, _result?: unknown, _error?: string): void {
    this.callLog.push({
      request: { id: _requestId },
      response: { decision: success ? 'allow' : 'deny' },
    })
  }

  getCapabilities(): UICapabilities {
    return {
      interactive: false,
      richFormatting: false,
      streaming: false,
      keyboardShortcuts: false,
      multiSelect: false,
    }
  }

  getConfig(): UIConfig {
    return {
      defaultDecision: this.defaultDecision,
      timeout: 30000,
      showRisk: true,
      showArgs: true,
      allowRemember: true,
    }
  }

  setConfig(config: Partial<UIConfig>): void {
    if (config.defaultDecision) {
      this.defaultDecision = config.defaultDecision
    }
  }

  onSessionStart?(_sessionId: string): void {
    // Default: no-op
  }

  onSessionEnd?(_sessionId: string): void {
    // Default: no-op
  }

  onModeChange?(_oldMode: string, _newMode: string): void {
    // Default: no-op
  }

  /** Get call log for verification. */
  getCallLog() {
    return this.callLog
  }

  /** Set response for a specific request ID. */
  setResponse(requestId: string, decision: PermissionDecision): void {
    this.responses.set(requestId, { requestId, decision })
  }

  /** Set response for a tool name. */
  setToolResponse(toolName: string, decision: PermissionDecision): void {
    if (!this.responsesMap) this.responsesMap = new Map()
    this.responsesMap.set(toolName, decision)
  }

  /** Clear state. */
  clear(): void {
    this.responses.clear()
    this.callLog = []
  }
}

/** Auto-approve UI for headless/CI. */
export class AutoApproveUI extends MockPermissionUI {
  constructor(config: HeadlessUIConfig = {}) {
    super('allow')
    const customDecider = config.customDecider
    if (customDecider) {
      // Override requestPermission to use custom decider
      this.requestPermission = async (request) => {
        const decision = await customDecider(request)
        return { requestId: request.id, decision }
      }
    }
  }
}

/** Auto-deny UI for headless/CI. */
export class AutoDenyUI extends MockPermissionUI {
  constructor() {
    super('deny')
  }
}

/** Interactive UI base class for TUI implementations. */
export abstract class InteractivePermissionUI implements PermissionUI {
  protected config: UIConfig = {
    timeout: 30000,
    showRisk: true,
    showArgs: true,
    allowRemember: true,
  }

  abstract requestPermission(request: PermissionRequest): Promise<PermissionResponse>

  notifyDecision?(_request: PermissionRequest, _response: PermissionResponse): void {
    // Default: no-op
  }

  notifyToolResult?(
    _requestId: string,
    _success: boolean,
    _result?: unknown,
    _error?: string,
  ): void {
    // Default: no-op
  }

  getCapabilities(): UICapabilities {
    return {
      interactive: true,
      richFormatting: true,
      streaming: true,
      keyboardShortcuts: true,
      multiSelect: false,
    }
  }

  getConfig(): UIConfig {
    return { ...this.config }
  }

  setConfig(config: Partial<UIConfig>): void {
    this.config = { ...this.config, ...config }
  }

  onSessionStart?(_sessionId: string): void {
    // Default: no-op
  }

  onSessionEnd?(_sessionId: string): void {
    // Default: no-op
  }

  onModeChange?(_oldMode: string, _newMode: string): void {
    // Default: no-op
  }

  /** Format tool arguments for display. */
  protected formatArgs(args: Record<string, unknown>): string {
    if (!args || Object.keys(args).length === 0) return '(no arguments)'
    return Object.entries(args)
      .map(
        ([k, v]) =>
          `${k}: ${typeof v === 'string' && v.length > 100 ? `${v.slice(0, 100)}...` : v}`,
      )
      .join(', ')
  }

  /** Format risk level for display. */
  protected formatRisk(riskLevel?: string): string {
    if (!riskLevel) return 'Unknown'
    const colors: Record<string, string> = {
      low: '\x1b[32m', // green
      medium: '\x1b[33m', // yellow
      high: '\x1b[31m', // red
      critical: '\x1b[35m', // magenta
    }
    const reset = '\x1b[0m'
    return `${colors[riskLevel] || ''}${riskLevel.toUpperCase()}${reset}`
  }
}

/** Factory for creating UI instances. */
export interface PermissionUIFactory {
  createUI(config?: UIConfig): PermissionUI
  createHeadlessUI(config?: HeadlessUIConfig): PermissionUI
  createSDKUI(config: SDKUIConfig): PermissionUI
}

/** Default UI factory. */
export class DefaultPermissionUIFactory implements PermissionUIFactory {
  createUI(config?: UIConfig): PermissionUI {
    return new MockPermissionUI(config?.defaultDecision ?? 'allow')
  }

  createHeadlessUI(config?: HeadlessUIConfig): PermissionUI {
    return new AutoApproveUI(config)
  }

  createSDKUI(config: SDKUIConfig): PermissionUI {
    const ui = new MockPermissionUI('allow')
    // Override with SDK callbacks
    ui.requestPermission = async (request) => {
      return config.onRequest(request)
    }
    if (config.onResult) {
      ui.notifyToolResult = config.onResult
    }
    return ui
  }
}

/** Global UI factory. */
let globalFactory: PermissionUIFactory = new DefaultPermissionUIFactory()

/** Get the global UI factory. */
export function getUIFactory(): PermissionUIFactory {
  return globalFactory
}

/** Set the global UI factory. */
export function setUIFactory(factory: PermissionUIFactory): void {
  globalFactory = factory
}

/** Create a permission request from a tool call. */
export async function createPermissionRequest(
  tool: AgentTool,
  args: Record<string, unknown>,
  sessionId: string,
  permissionMode: string,
  options: {
    category?: ToolCategory
    riskLevel?: 'low' | 'medium' | 'high' | 'critical'
    riskReason?: string
    isRetry?: boolean
    profileResult?: ProfileCheckResult
    context?: Record<string, unknown>
  } = {},
): Promise<PermissionRequest> {
  const { getToolCategory } = await import('./modes')
  return {
    id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date().toISOString(),
    tool,
    args,
    category: options.category ?? getToolCategory(tool.name),
    sessionId,
    permissionMode,
    riskLevel: options.riskLevel,
    riskReason: options.riskReason,
    isRetry: options.isRetry,
    profileResult: options.profileResult,
    context: options.context,
  }
}

/** Check if a response indicates the user wants to apply this decision broadly. */
export function shouldRemember(response: PermissionResponse): boolean {
  return response.remember === true
}

/** Check if a response includes a custom rule. */
export function hasCustomRule(response: PermissionResponse): boolean {
  return !!response.customRule
}
