import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { type AuthErrorCode, AuthFlowError, type AuthProviderName } from './errors'

export interface OAuthTokens {
  provider: AuthProviderName
  accessToken: string
  /** Present when the provider issues revocable refresh tokens */
  refreshToken?: string
  /** Expiry as epoch ms; used for proactive refresh */
  expiresAt?: number
  scopes?: string[]
  /** Account identifier (email / GitHub login / numeric id) */
  account?: string
}

export interface TokenStore {
  save(tokens: OAuthTokens): void
  load(provider: AuthProviderName): OAuthTokens | null
  clear(provider: AuthProviderName): void
}

export function defaultCredentialPath(): string {
  // Windows: ~\.forge\credentials.json — macOS/Linux: ~/.forge/credentials.json
  return join(homedir(), '.forge', 'credentials.json')
}

function readJson(filePath: string): Record<string, OAuthTokens> {
  if (!existsSync(filePath)) return {}
  const raw = readFileSync(filePath, 'utf8')
  if (!raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, OAuthTokens>
    }
  } catch {
    // fall through — corrupt credential store is treated as empty but throws storage error
  }
  throw new AuthFlowError('unknown', 'storage_read_failed', `Corrupt credential store: ${filePath}`)
}

/**
 * Encrypted-at-rest is the OS keychain's job; until forge wires a keychain
 * backend this vault keeps the token file on a 600/0400-style permission so
 * other local users can't read it. Windows ignores POSIX mode bits — permissions
 * mirror the per-user profile directory instead.
 */
export class FileTokenVault implements TokenStore {
  readonly filePath: string

  constructor(filePath = defaultCredentialPath()) {
    this.filePath = filePath
  }

  save(tokens: OAuthTokens): void {
    const all = this.readSafe()
    all[tokens.provider] = tokens
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      writeFileSync(this.filePath, `${JSON.stringify(all, null, 2)}\n`, { mode: 0o600 })
      try {
        chmodSync(this.filePath, 0o600)
      } catch {
        // non-POSIX — directory profile already isolates the file
      }
    } catch (cause) {
      throw new AuthFlowError(
        tokens.provider,
        'storage_write_failed',
        `Cannot write ${this.filePath}`,
        {
          cause,
        },
      )
    }
  }

  load(provider: AuthProviderName): OAuthTokens | null {
    const all = this.readSafe()
    return all[provider] ?? null
  }

  clear(provider: AuthProviderName): void {
    const all = this.readSafe()
    delete all[provider]
    try {
      writeFileSync(this.filePath, `${JSON.stringify(all, null, 2)}\n`, { mode: 0o600 })
    } catch (cause) {
      throw new AuthFlowError(provider, 'storage_write_failed', `Cannot write ${this.filePath}`, {
        cause,
      })
    }
  }

  remove(): void {
    if (existsSync(this.filePath)) rmSync(this.filePath, { force: true })
  }

  private readSafe(): Record<string, OAuthTokens> {
    try {
      return readJson(this.filePath)
    } catch (err) {
      if (err instanceof AuthFlowError) throw err
      throw new AuthFlowError('unknown', 'storage_read_failed', `Cannot read ${this.filePath}`, {
        cause: err,
      })
    }
  }
}

export type { AuthErrorCode }

export function validateTokens(
  provider: AuthProviderName,
  tokens: OAuthTokens | null,
): OAuthTokens {
  if (!tokens || !tokens.accessToken) {
    throw new AuthFlowError(
      provider,
      'not_authenticated',
      `No saved credentials for ${provider}; run login first`,
    )
  }
  return tokens
}

export function isExpired(tokens: OAuthTokens, skewMs = 60_000): boolean {
  if (!tokens.expiresAt) return false
  return tokens.expiresAt <= Date.now() + skewMs
}
