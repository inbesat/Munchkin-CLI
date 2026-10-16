/**
 * Forge JSON-RPC capability handshake (Phase 80).
 *
 * Modeled on the LSP `initialize` / `initialized` exchange — a small,
 * boring, two-call handshake that lets the server and client agree on
 * what the session supports. Kept deliberately tiny so Python/editor/
 * CI clients can implement it with ~10 lines.
 *
 * Wire flow:
 *   1. client → server:  initialize { clientInfo, capabilities, protocolVersion }
 *   2. server → client:  result { serverInfo, capabilities, protocolVersion }
 *   3. client → server:  initialized {}    (notification, no params required)
 */

export const FORGE_PROTOCOL_VERSION = '1.0'

/** What a client advertises it can do. */
export interface ClientCapabilities {
  /** Stream live prompt events over RPC (text_delta, tool_call, ...). */
  streaming?: boolean
  /** Honor `$/cancelRequest` for in-flight prompts. */
  cancellation?: boolean
  /** Read prompt/tool errors as structured JSON-RPC errors with `data`. */
  structuredErrors?: boolean
  /** Free-form extension bag (e.g. ACP / custom surfaces). */
  experimental?: Record<string, boolean>
}

/** What the server advertises back. */
export interface ServerCapabilities {
  streaming: boolean
  cancellation: boolean
  structuredErrors: boolean
  /** Methods supported in addition to the always-on core surface. */
  methods: string[]
  /** Free-form extension bag. */
  experimental?: Record<string, boolean>
}

export interface InitializeParams {
  /** Protocol version the client speaks (defaults to FORGE_PROTOCOL_VERSION). */
  protocolVersion?: string
  clientInfo?: { name: string; version: string }
  capabilities?: ClientCapabilities
}

export interface InitializeResult {
  protocolVersion: string
  serverInfo: { name: string; version: string }
  capabilities: ServerCapabilities
}

export const FORGE_DEFAULT_SERVER_INFO = { name: 'forge', version: '0.1.0' }

/**
 * Compute the server-side `InitializeResult` for a given client `InitializeParams`.
 * Negotiation rule: both sides must support a feature for it to be enabled.
 */
export function negotiate(
  params: InitializeParams,
  serverInfo: { name: string; version: string },
  supportedMethods: string[],
): InitializeResult {
  const clientCaps = params.capabilities ?? {}
  const negotiated: ServerCapabilities = {
    streaming: clientCaps.streaming === true,
    cancellation: clientCaps.cancellation === true,
    structuredErrors: clientCaps.structuredErrors === true,
    methods: supportedMethods,
  }
  return {
    protocolVersion: params.protocolVersion ?? FORGE_PROTOCOL_VERSION,
    serverInfo,
    capabilities: negotiated,
  }
}
