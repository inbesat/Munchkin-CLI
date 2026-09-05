import { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { Logger, getLogger, isForgeError, ErrorCode } from '@forge/core'
import type { ErrorResponse } from '../types'

export function createErrorHandlerMiddleware(logger?: Logger) {
  const log = logger ?? getLogger()

  return async (c: Context, next: Next) => {
    try {
      return await next()
    } catch (err) {
      const requestId = c.get('requestId') ?? 'unknown'

      if (err instanceof HTTPException) {
        const response: ErrorResponse = {
          error: { code: 'HTTP_ERROR', message: err.message, details: { status: err.status } },
        }
        log.warn('HTTP exception', { requestId, status: err.status, message: err.message })
        return c.json(response, err.status as any)
      }

      if (isForgeError(err)) {
        const status = forgeErrorToStatus(err.code)
        const response: ErrorResponse = {
          error: {
            code: err.code,
            message: err.message,
            details: { severity: err.severity, recovery: err.recovery },
          },
        }
        log.warn('Forge error', { requestId, code: err.code, message: err.message })
        return c.json(response, status as any)
      }

      const message = err instanceof Error ? err.message : 'Internal server error'
      const response: ErrorResponse = {
        error: {
          code: 'INTERNAL_ERROR',
          message,
          details: err instanceof Error ? { stack: err.stack } : undefined,
        },
      }
      log.error('Unhandled error', { requestId, err, message })
      return c.json(response, 500)
    }
  }
}

function forgeErrorToStatus(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.CONFIG_INVALID:
    case ErrorCode.CONFIG_MISSING_FIELD:
    case ErrorCode.CONFIG_READ_FAILED:
    case ErrorCode.CONFIG_WRITE_FAILED:
    case ErrorCode.CONFIG_NOT_FOUND:
      return 400
    case ErrorCode.PERMISSION_DENIED:
    case ErrorCode.PERMISSION_MODE_INVALID:
    case ErrorCode.PERMISSION_RULE_CONFLICT:
    case ErrorCode.PERMISSION_BYPASS_BLOCKED:
    case ErrorCode.TOOL_PERMISSION_DENIED:
      return 403
    case ErrorCode.SESSION_NOT_FOUND:
    case ErrorCode.SESSION_EXPIRED:
    case ErrorCode.SESSION_RESUME_FAILED:
    case ErrorCode.PROVIDER_NOT_FOUND:
    case ErrorCode.PROVIDER_INVALID_MODEL:
    case ErrorCode.TOOL_NOT_FOUND:
    case ErrorCode.MCP_TOOL_NOT_FOUND:
    case ErrorCode.MCP_SERVER_NOT_FOUND:
    case ErrorCode.PLUGIN_NOT_FOUND:
    case ErrorCode.SANDBOX_NOT_AVAILABLE:
    case ErrorCode.GIT_NOT_REPO:
      return 404
    case ErrorCode.PROVIDER_RATE_LIMITED:
    case ErrorCode.TOOL_RATE_LIMITED:
      return 429
    case ErrorCode.CONTEXT_OVERFLOW:
    case ErrorCode.CONTEXT_TOKEN_LIMIT:
      return 413
    case ErrorCode.PROVIDER_TIMEOUT:
    case ErrorCode.PROVIDER_STREAM_ERROR:
    case ErrorCode.PROVIDER_REQUEST_FAILED:
    case ErrorCode.PROVIDER_OVERLOADED:
    case ErrorCode.MCP_SERVER_TIMEOUT:
    case ErrorCode.MCP_SERVER_CONNECTION_FAILED:
    case ErrorCode.SANDBOX_NETWORK_DENIED:
    case ErrorCode.GIT_PUSH_FAILED:
      return 502
    default:
      return 500
  }
}

export function errorToResponse(err: unknown, _requestId?: string): { response: ErrorResponse; status: number } {
  if (err instanceof HTTPException) {
    return {
      response: { error: { code: 'HTTP_ERROR', message: err.message, details: { status: err.status } } },
      status: err.status,
    }
  }

  if (isForgeError(err)) {
    return {
      response: {
        error: {
          code: err.code,
          message: err.message,
          details: { severity: err.severity, recovery: err.recovery },
        },
      },
      status: forgeErrorToStatus(err.code),
    }
  }

  const message = err instanceof Error ? err.message : 'Internal server error'
  return {
    response: {
      error: {
        code: 'INTERNAL_ERROR',
        message,
        details: err instanceof Error ? { stack: err.stack } : undefined,
      },
    },
    status: 500,
  }
}
