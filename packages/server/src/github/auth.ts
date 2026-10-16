/**
 * GitHub App authentication (Phase 142).
 *
 * App-level requests are signed with an RS256 JWT (app id as `iss`), which is
 * exchanged for a per-installation access token. Both helpers are no-throw.
 */

import { createSign } from 'node:crypto'

/** RS256 app JWT - GitHub allows a 10-minute maximum lifetime. */
export function buildAppJwt(
  appId: string | number,
  privateKeyPem: string,
  nowMs: number = Date.now(),
): string {
  const issuedAt = Math.floor(nowMs / 1000) - 60
  const expiresAt = issuedAt + 600
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({ iat: issuedAt, exp: expiresAt, iss: String(appId) }))
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${payload}`)
  return `${header}.${payload}.${base64url(signer.sign(privateKeyPem))}`
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

export interface InstallationTokenOptions {
  appId: string | number
  privateKeyPem: string
  installationId: number
  fetchImpl: typeof fetch
  apiBase?: string
  nowMs?: number
}

export type InstallationTokenResult = { ok: true; token: string } | { ok: false; error: string }

/** Exchange an app JWT for an installation access token. Never throws. */
export async function createInstallationToken(
  options: InstallationTokenOptions,
): Promise<InstallationTokenResult> {
  const apiBase = (options.apiBase ?? 'https://api.github.com').replace(/\/+$/, '')
  let jwt: string
  try {
    jwt = buildAppJwt(options.appId, options.privateKeyPem, options.nowMs)
  } catch (error) {
    return {
      ok: false,
      error: `cannot sign app JWT: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
  try {
    const response = await options.fetchImpl(
      `${apiBase}/app/installations/${options.installationId}/access_tokens`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${jwt}`,
          'User-Agent': 'forge',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    )
    if (!response.ok) {
      return { ok: false, error: `installation token request failed [${response.status}]` }
    }
    const body = (await response.json()) as { token?: unknown }
    if (typeof body.token !== 'string' || body.token.length === 0) {
      return { ok: false, error: 'installation token missing in response' }
    }
    return { ok: true, token: body.token }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
