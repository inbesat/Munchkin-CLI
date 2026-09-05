import { Logger, getLogger } from '@forge/core'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * API key model (Phase 81).
 *
 * Tokens look like `frg_<env>_<random>` where `<env>` is a free-form label
 * (`live`, `dev`, `ci`, …) and `<random>` is 32 url-safe bytes. Only the
 * SHA-256 hash is stored on disk, so a leaked `keys.json` can't be used
 * directly — every presentation re-hashes the candidate and compares with
 * `timingSafeEqual`.
 *
 * Per-key rate limiting is a token bucket: `capacity` tokens, refilling at
 * `refillPerSec` tokens/sec, max burst = capacity. `consume()` deducts a
 * token (returning `false` if empty) and is the gate the auth middleware
 * checks on every request.
 */

export const AUTH_KEY_PREFIX = 'frg_'

export interface AuthKeyMetadata {
  /** Public id of the key (sha-256 of the env + random, hex). */
  id: string
  name: string
  /** Free-form environment label, e.g. `live` or `dev`. */
  env: string
  scopes: string[]
  createdAt: number
  lastUsedAt?: number
  /** Token bucket: capacity (max burst) and refill rate. */
  rateLimit: { capacity: number; refillPerSec: number }
  /** Optional human description. */
  description?: string
}

interface AuthKeyRecord extends AuthKeyMetadata {
  /** SHA-256 hex of the secret (without the `frg_` prefix). */
  hash: string
}

export interface CreateKeyOptions {
  name: string
  env?: string
  scopes?: string[]
  description?: string
  rateLimit?: { capacity?: number; refillPerSec?: number }
}

export interface CreateKeyResult {
  metadata: AuthKeyMetadata
  /** The full token, only ever returned at creation time. */
  secret: string
}

export type ValidateResult =
  | { ok: true; key: AuthKeyMetadata }
  | { ok: false; reason: 'missing' | 'malformed' | 'unknown' | 'rate-limited' | 'revoked' }

export interface AuthStoreOptions {
  /** Directory where `keys.json` is persisted. Created if missing. */
  baseDir: string
  /** Filename within `baseDir`. */
  fileName?: string
  logger?: Logger
  /** Test hook: override the wall clock. */
  now?: () => number
}

/**
 * Append-only key registry. Backed by a single JSON file; reads load the
 * whole table, writes serialize the whole table. Fine for the 1..1000
 * keys a single forge deployment will ever have.
 */
export class AuthStore {
  private baseDir: string
  private fileName: string
  private filePath: string
  private log: Logger
  private now: () => number
  private records: AuthKeyRecord[] = []
  private buckets = new Map<string, { tokens: number; updatedAt: number }>()
  private loaded = false

  constructor(options: AuthStoreOptions) {
    this.baseDir = options.baseDir
    this.fileName = options.fileName ?? 'keys.json'
    this.filePath = path.join(this.baseDir, this.fileName)
    this.log = options.logger ?? getLogger()
    this.now = options.now ?? Date.now
  }

  /** Load the on-disk key file. Idempotent. */
  async load(): Promise<void> {
    if (this.loaded) return
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as { keys: AuthKeyRecord[] }
      this.records = parsed.keys ?? []
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      if (e.code !== 'ENOENT') throw err
      this.records = []
    }
    this.loaded = true
  }

  /** Persist the current records. Creates the directory if needed. */
  async save(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true })
    const payload = JSON.stringify({ keys: this.records, version: 1 }, null, 2)
    await fs.writeFile(this.filePath, payload, { mode: 0o600 })
  }

  // ── Key CRUD ────────────────────────────────────────────

  async createKey(options: CreateKeyOptions): Promise<CreateKeyResult> {
    await this.load()
    const env = options.env ?? 'live'
    const random = randomBytes(32).toString('base64url')
    const secret = `${AUTH_KEY_PREFIX}${env}_${random}`
    const id = hashKeyId(secret)
    const now = this.now()
    const record: AuthKeyRecord = {
      id,
      name: options.name,
      env,
      scopes: options.scopes ?? ['*'],
      createdAt: now,
      hash: hashSecret(secret),
      rateLimit: {
        capacity: options.rateLimit?.capacity ?? 60,
        refillPerSec: options.rateLimit?.refillPerSec ?? 10,
      },
      ...(options.description ? { description: options.description } : {}),
    }
    this.records.push(record)
    await this.save()
    this.log.info('auth key created', { id, name: record.name, env })
    return {
      metadata: publicMetadata(record),
      secret,
    }
  }

  async listKeys(): Promise<AuthKeyMetadata[]> {
    await this.load()
    return this.records.map(publicMetadata)
  }

  /** Cheap check used by the auth middleware to decide whether to enforce auth. */
  async hasKeys(): Promise<boolean> {
    await this.load()
    return this.records.length > 0
  }

  async getKey(id: string): Promise<AuthKeyMetadata | null> {
    await this.load()
    const r = this.records.find((rec) => rec.id === id)
    return r ? publicMetadata(r) : null
  }

  async revokeKey(id: string): Promise<boolean> {
    await this.load()
    const before = this.records.length
    this.records = this.records.filter((r) => r.id !== id)
    if (this.records.length === before) return false
    this.buckets.delete(id)
    await this.save()
    this.log.info('auth key revoked', { id })
    return true
  }

  // ── Authentication ─────────────────────────────────────

  /**
   * Validate a presented bearer token. Always updates `lastUsedAt` and
   * decrements the per-key token bucket on success. Returns the matched
   * key (without the hash) or a typed failure reason.
   */
  async validate(presented: string | undefined | null): Promise<ValidateResult> {
    await this.load()
    if (!presented) return { ok: false, reason: 'missing' }
    if (!presented.startsWith(AUTH_KEY_PREFIX)) return { ok: false, reason: 'malformed' }
    const id = hashKeyId(presented)
    const record = this.records.find((r) => r.id === id)
    if (!record) return { ok: false, reason: 'unknown' }
    if (!verifySecret(presented, record.hash)) {
      // Defense in depth: the sha-256 hash should already be unique enough,
      // but the runtime check catches a malformed record (hash mismatch).
      return { ok: false, reason: 'unknown' }
    }
    if (!this.consume(id, record.rateLimit)) {
      return { ok: false, reason: 'rate-limited' }
    }
    record.lastUsedAt = this.now()
    // Don't await save on the hot path; persist on revoke/create.
    return { ok: true, key: publicMetadata(record) }
  }

  /** Snapshot of per-key rate-limit state (for the dashboard / metrics). */
  rateLimitState(): Array<{ id: string; tokens: number; capacity: number; refillPerSec: number }> {
    return this.records.map((r) => {
      const b = this.buckets.get(r.id) ?? { tokens: r.rateLimit.capacity, updatedAt: this.now() }
      return {
        id: r.id,
        tokens: Number(b.tokens.toFixed(3)),
        capacity: r.rateLimit.capacity,
        refillPerSec: r.rateLimit.refillPerSec,
      }
    })
  }

  // ── Token bucket ───────────────────────────────────────

  private consume(keyId: string, limit: { capacity: number; refillPerSec: number }): boolean {
    const now = this.now() / 1000
    let bucket = this.buckets.get(keyId)
    if (!bucket) {
      bucket = { tokens: limit.capacity, updatedAt: now }
      this.buckets.set(keyId, bucket)
    } else {
      const elapsed = now - bucket.updatedAt
      bucket.tokens = Math.min(limit.capacity, bucket.tokens + elapsed * limit.refillPerSec)
      bucket.updatedAt = now
    }
    if (bucket.tokens < 1) return false
    bucket.tokens -= 1
    return true
  }

  // ── Maintenance ────────────────────────────────────────

  /** Drop all keys (used by tests and by `forge auth reset`). */
  async reset(): Promise<void> {
    this.records = []
    this.buckets.clear()
    await this.save()
  }
}

// ── Helpers ─────────────────────────────────────────────

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

function hashKeyId(secret: string): string {
  // Stable public id = sha-256 of the secret, first 16 hex chars. The
  // secret itself is never stored; the full hash is, which is enough to
  // verify on the next request.
  return createHash('sha256').update(secret).digest('hex').slice(0, 16)
}

function verifySecret(secret: string, storedHash: string): boolean {
  const presented = Buffer.from(hashSecret(secret), 'hex')
  const expected = Buffer.from(storedHash, 'hex')
  if (presented.length !== expected.length) return false
  return timingSafeEqual(presented, expected)
}

function publicMetadata(r: AuthKeyRecord): AuthKeyMetadata {
  const meta: AuthKeyMetadata = {
    id: r.id,
    name: r.name,
    env: r.env,
    scopes: [...r.scopes],
    createdAt: r.createdAt,
    rateLimit: { ...r.rateLimit },
  }
  if (r.lastUsedAt !== undefined) meta.lastUsedAt = r.lastUsedAt
  if (r.description !== undefined) meta.description = r.description
  return meta
}