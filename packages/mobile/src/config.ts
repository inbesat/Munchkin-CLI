/**
 * Connection config persistence for the mobile companion app (Phase 155).
 *
 * Storage errors become results — load/save/clear never throw, so screen
 * code can react to failures without try/catch noise. The storage seam is
 * shaped like AsyncStorage (getItem/setItem/removeItem) so the RN adapter
 * is the platform module itself.
 */

export interface ConnectionConfig {
  /** Base URL of the forge server, no trailing slash (e.g. http://192.168.1.10:3000). */
  serverUrl: string
  /** API key minted with `forge auth create` (sent as a Bearer token). */
  token: string
  /** Optional display name for the connection. */
  name?: string
}

/** Minimal async KV surface — structurally satisfied by AsyncStorage. */
export interface ConnectionStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

const STORAGE_KEY = 'forge.connection'

export function createMemoryStorage(): ConnectionStorage {
  const store = new Map<string, string>()
  return {
    async getItem(key) {
      return store.get(key) ?? null
    },
    async setItem(key, value) {
      store.set(key, value)
    },
    async removeItem(key) {
      store.delete(key)
    },
  }
}

export type ConfigValidation = { ok: true; config: ConnectionConfig } | { ok: false; error: string }

export function validateConnectionConfig(raw: unknown): ConfigValidation {
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, error: 'connection config must be an object' }
  }
  const candidate = raw as Record<string, unknown>
  const serverUrl = candidate.serverUrl
  if (typeof serverUrl !== 'string' || serverUrl.trim() === '') {
    return { ok: false, error: 'serverUrl is required' }
  }
  let parsed: URL
  try {
    parsed = new URL(serverUrl.trim())
  } catch {
    return { ok: false, error: 'serverUrl must be a valid URL' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'serverUrl must use http or https' }
  }
  const token = candidate.token
  if (typeof token !== 'string' || token.trim() === '') {
    return { ok: false, error: 'token is required' }
  }
  const name = candidate.name
  const config: ConnectionConfig = {
    serverUrl: `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}`,
    token: token.trim(),
    ...(typeof name === 'string' && name.trim() !== '' ? { name: name.trim() } : {}),
  }
  return { ok: true, config }
}

export async function loadConnection(
  storage: ConnectionStorage,
): Promise<{ ok: true; config: ConnectionConfig | null } | { ok: false; error: string }> {
  try {
    const raw = await storage.getItem(STORAGE_KEY)
    if (raw === null) return { ok: true, config: null }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { ok: true, config: null } // corrupt data is treated as "not configured"
    }
    const validation = validateConnectionConfig(parsed)
    if (!validation.ok) return { ok: true, config: null }
    return { ok: true, config: validation.config }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function saveConnection(
  storage: ConnectionStorage,
  config: ConnectionConfig,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const validation = validateConnectionConfig(config)
  if (!validation.ok) return { ok: false, error: validation.error }
  try {
    await storage.setItem(STORAGE_KEY, JSON.stringify(validation.config))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function clearConnection(
  storage: ConnectionStorage,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await storage.removeItem(STORAGE_KEY)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
