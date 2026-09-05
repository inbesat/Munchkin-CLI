/**
 * Minimal JSON-RPC 2.0 codec over a newline-delimited byte stream.
 *
 * Spec: https://www.jsonrpc.org/specification
 *  - Request: `{ jsonrpc, id, method, params? }`
 *  - Success: `{ jsonrpc, id, result }`
 *  - Error:   `{ jsonrpc, id, error: { code, message, data? } }`
 *  - Notification (no id): `{ jsonrpc, method, params? }` — no response
 *  - Errors: parse = -32700, invalid-request = -32600, method-not-found = -32601,
 *    invalid-params = -32602, internal = -32603, server-defined = -32099..-32000
 */

export const RPC_VERSION = '2.0'

export type RpcId = number | string

export interface RpcRequest {
  jsonrpc: typeof RPC_VERSION
  id: RpcId
  method: string
  params?: unknown
}

export interface RpcNotification {
  jsonrpc: typeof RPC_VERSION
  method: string
  params?: unknown
}

export interface RpcSuccess {
  jsonrpc: typeof RPC_VERSION
  id: RpcId
  result: unknown
}

export interface RpcErrorBody {
  code: number
  message: string
  data?: unknown
}

export interface RpcError {
  jsonrpc: typeof RPC_VERSION
  id: RpcId | null
  error: RpcErrorBody
}

export type RpcMessage = RpcRequest | RpcNotification | RpcSuccess | RpcError

export const RpcErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const

export function isRequest(msg: RpcMessage): msg is RpcRequest {
  return 'id' in msg && 'method' in msg
}

export function isNotification(msg: RpcMessage): msg is RpcNotification {
  return !('id' in msg) && 'method' in msg
}

export function isResponse(msg: RpcMessage): msg is RpcSuccess | RpcError {
  return ('result' in msg || 'error' in msg) && !('method' in msg)
}

export function makeSuccess(id: RpcId, result: unknown): RpcSuccess {
  return { jsonrpc: RPC_VERSION, id, result }
}

export function makeError(id: RpcId | null, code: number, message: string, data?: unknown): RpcError {
  const err: RpcError = { jsonrpc: RPC_VERSION, id, error: { code, message } }
  if (data !== undefined) err.error.data = data
  return err
}

/** Encode one message as a UTF-8 string with a trailing newline. */
export function encodeMessage(msg: RpcMessage): string {
  return `${JSON.stringify(msg)}\n`
}

/** Try to parse one message. Throws on parse error or invalid shape. */
export function decodeMessage(line: string): RpcMessage {
  const trimmed = line.trim()
  if (trimmed.length === 0) {
    throw makeError(null, RpcErrorCodes.InvalidRequest, 'Empty line')
  }
  let raw: unknown
  try {
    raw = JSON.parse(trimmed)
  } catch (err) {
    throw makeError(null, RpcErrorCodes.ParseError, `Invalid JSON: ${(err as Error).message}`)
  }
  if (typeof raw !== 'object' || raw === null) {
    throw makeError(null, RpcErrorCodes.InvalidRequest, 'Expected an object')
  }
  const obj = raw as Record<string, unknown>
  if (obj.jsonrpc !== RPC_VERSION) {
    throw makeError(null, RpcErrorCodes.InvalidRequest, `Unsupported jsonrpc version: ${String(obj.jsonrpc)}`)
  }
  return obj as unknown as RpcMessage
}