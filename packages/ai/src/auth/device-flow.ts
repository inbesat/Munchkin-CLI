import { AuthFlowError, type AuthProviderName } from './errors'
import { type ExchangeResult, openBrowser } from './oauth'

export interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete?: string
  expires_in: number
  interval?: number
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  error?: string
}

export function parseDeviceCodeResponse(payload: unknown): DeviceCodeResponse {
  const body = payload as Partial<DeviceCodeResponse>
  if (
    !body ||
    typeof body.device_code !== 'string' ||
    typeof body.user_code !== 'string' ||
    typeof body.verification_uri !== 'string' ||
    typeof body.expires_in !== 'number'
  ) {
    throw new AuthFlowError('unknown', 'invalid_token_response', 'Malformed device-code response')
  }
  if (!body.user_code)
    throw new AuthFlowError('unknown', 'invalid_token_response', 'Missing user_code')
  return body as DeviceCodeResponse
}

export function tokenResponseToTokens(payload: unknown): ExchangeResult {
  const body = payload as TokenResponse
  if (typeof body?.access_token !== 'string' || !body.access_token) {
    throw new AuthFlowError(
      'unknown',
      'invalid_token_response',
      'Token endpoint returned no access_token',
    )
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt:
      typeof body.expires_in === 'number' ? Date.now() + body.expires_in * 1000 : undefined,
    scopes: body.scope?.split(' ').filter(Boolean),
  }
}

export interface DeviceFlowOptions {
  provider: AuthProviderName
  /** POST /login/device/code */
  requestDeviceCode: () => Promise<unknown>
  /** POST token endpoint; receives the device_code */
  requestToken: (deviceCode: string) => Promise<unknown>
  /** Base of the authorization page shown in the browser */
  verificationUri?: (device: DeviceCodeResponse) => string
  openBrowserFn?: (url: string, userCode: string) => Promise<void>
  pollIntervalMs?: number
  /** Extra delay tacked onto the interval after a `slow_down` (RFC 8628 §3.5) */
  slowDownBackoffMs?: number
  timeoutMs?: number
}

const POLL_BACKOFF = 5_000

/**
 * Device authorization grant (RFC 8628): poll until the user approves on the
 * device's site. Handles `authorization_pending`, `slow_down`, `access_denied`,
 * and expiry of the device code.
 */
export async function runDeviceFlow(opts: DeviceFlowOptions): Promise<ExchangeResult> {
  const open = opts.openBrowserFn ?? ((uri: string) => openBrowser(uri))
  const devicePayload = parseDeviceCodeResponse(await opts.requestDeviceCode())
  const verificationUri = opts.verificationUri?.(devicePayload) ?? devicePayload.verification_uri
  await open(verificationUri, devicePayload.user_code)

  const intervalMs = Math.max(
    opts.pollIntervalMs ?? (devicePayload.interval ?? POLL_BACKOFF / 1000) * 1000,
    500,
  )
  const timeoutMs = opts.timeoutMs ?? (devicePayload.expires_in * 1000 || 900_000)
  const deadline = Date.now() + timeoutMs
  let interval = intervalMs

  for (;;) {
    if (Date.now() >= deadline) {
      throw new AuthFlowError(
        opts.provider,
        'device_flow_timeout',
        'Device flow timed out waiting for approval',
      )
    }
    const payload = (await opts.requestToken(devicePayload.device_code)) as TokenResponse
    if (typeof payload?.access_token === 'string') {
      return tokenResponseToTokens(payload)
    }
    switch (payload?.error) {
      case 'access_denied':
        throw new AuthFlowError(
          opts.provider,
          'authorization_denied',
          'Device flow was denied by the user',
        )
      case 'slow_down':
        interval += opts.slowDownBackoffMs ?? POLL_BACKOFF
        break
      case 'authorization_pending':
      case 'expired_token':
      case undefined:
        break
      default:
        throw new AuthFlowError(
          opts.provider,
          'refresh_failed',
          `Device flow failed: ${payload?.error ?? 'unknown error'}`,
        )
    }
    await sleep(interval)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export type { ExchangeResult, TokenResponse }
