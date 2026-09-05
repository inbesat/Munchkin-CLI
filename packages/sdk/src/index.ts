// @forge/sdk - Typed TypeScript client for the Forge server API.
// Phase 76: hand-rolled SDK that mirrors the OpenAPI 3.1 spec at
// /api/openapi.json (Phase 74). Zero runtime dependencies — uses fetch.

export const VERSION = '0.1.0'

export { ForgeClient, type ForgeClientOptions } from './client'
export { ForgeApiError, ForgeTransportError } from './errors'
export { SSEParser, parseSSEData } from './sse'
export { streamSSE, type SSEFrameHandler, type StreamOptions } from './stream'
export type * from './types'
