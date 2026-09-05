export const AuthErrorCode = {
  /** No tokens found in storage for the provider */
  NOT_AUTHENTICATED: 'not_authenticated',
  /** Token file exists but is malformed/unreadable */
  STORAGE_READ_FAILED: 'storage_read_failed',
  /** Token file could not be written */
  STORAGE_WRITE_FAILED: 'storage_write_failed',
  /** OAuth token endpoint returned an unrecognizable payload */
  INVALID_TOKEN_RESPONSE: 'invalid_token_response',
  /** User denied authorization (device flow `access_denied`) */
  AUTHORIZATION_DENIED: 'authorization_denied',
  /** Callback server never received the code before the timeout */
  CALLBACK_TIMEOUT: 'callback_timeout',
  /** Device flow ran out of time */
  DEVICE_FLOW_TIMEOUT: 'device_flow_timeout',
  /** Access token present but past its expiry */
  TOKEN_EXPIRED: 'token_expired',
  /** Refresh call failed (network, 4xx) */
  REFRESH_FAILED: 'refresh_failed',
  /** A token flow helper was invoked with invalid options */
  INVALID_OPTIONS: 'invalid_options',
} as const

export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode]

export type AuthProviderName = 'claude' | 'copilot' | 'chatgpt'

/**
 * Subscription-auth error. Phase 24 ships its own taxonomy inside
 * `@forge/ai`; Phase 25 maps these onto the `@forge/core` ForgeError
 * hierarchy (e.g. `FORGE_3001 PROVIDER_AUTH_FAILED`) plus a recovery hint.
 */
export class AuthFlowError extends Error {
  readonly provider: AuthProviderName | 'unknown'
  readonly code: AuthErrorCode
  readonly cause?: unknown

  constructor(
    provider: AuthProviderName | 'unknown',
    code: AuthErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message)
    this.name = 'AuthFlowError'
    this.provider = provider
    this.code = code
    this.cause = options?.cause
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      provider: this.provider,
      code: this.code,
      message: this.message,
    }
  }
}

export function isAuthFlowError(error: unknown): error is AuthFlowError {
  return error instanceof AuthFlowError
}
