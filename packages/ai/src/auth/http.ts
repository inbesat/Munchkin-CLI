import { type AuthErrorCode, AuthFlowError, type AuthProviderName } from './errors'

/**
 * POST `application/x-www-form-urlencoded` to an OAuth endpoint and parse the
 * JSON response. Throws `AuthFlowError` on transport/HTTP/parse failures so
 * every provider flow reports through the same taxonomy.
 */
export async function postForm(
  provider: AuthProviderName,
  code: AuthErrorCode,
  url: string,
  body: Record<string, string>,
): Promise<unknown> {
  let resp: Response
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams(body).toString(),
    })
  } catch (cause) {
    throw new AuthFlowError(provider, code, `Request to ${url} failed`, { cause })
  }

  const text = await resp.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new AuthFlowError(
      provider,
      code,
      `OAuth endpoint returned non-JSON (${resp.status}): ${text.slice(0, 200)}`,
    )
  }

  if (!resp.ok) {
    const rawError = (json as { error?: string; error_description?: string } | null)?.error
    throw new AuthFlowError(
      provider,
      code,
      `OAuth endpoint HTTP ${resp.status}${rawError ? ` (${rawError})` : ''}`,
    )
  }
  return json
}

const B64URL = /^[A-Za-z0-9_=-]+$/

/**
 * Best-effort decode of an OAuth `id_token` (JWT) to pull the account
 * identifier (email or `sub`) for display in logs.
 */
export function idTokenAccount(idToken: string | undefined): string | undefined {
  if (!idToken) return undefined
  const parts = idToken.split('.')
  if (parts.length < 2) return undefined
  const payload = parts[1] ?? ''
  if (!B64URL.test(payload) || payload.length % 4 === 1) return undefined
  try {
    const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=')
    const decoded = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
    const json = JSON.parse(decoded) as { email?: string; sub?: string }
    return json.email ?? json.sub
  } catch {
    return undefined
  }
}
