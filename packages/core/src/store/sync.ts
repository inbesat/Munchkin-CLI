import type { SessionMeta, SessionStore } from './session-store'

export interface SyncResult {
  synced: number
  failed: number
  errors: Array<{ sessionId: string; error: string }>
}

export class StoreSync {
  private store: SessionStore

  constructor(store: SessionStore) {
    this.store = store
  }

  async syncAll(): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, failed: 0, errors: [] }
    const metas = await this.store.syncAll()
    result.synced = metas.length
    return result
  }

  async syncSession(sessionId: string): Promise<SessionMeta | null> {
    return this.store.syncFromEvents(sessionId)
  }

  getStore(): SessionStore {
    return this.store
  }
}
