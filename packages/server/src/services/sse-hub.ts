import { type Logger, getLogger } from '@forge/core'

export interface SSEClient {
  id: string
  controller: ReadableStreamDefaultController<string>
  sessionIds: Set<string>
  connectedAt: number
  /** Last event id this client acknowledged (used for late-join replay). */
  lastEventId?: string
}

export interface SSEStats {
  totalClients: number
  clients: Array<{ id: string; sessionIds: string[]; connectedAt: number; duration: number }>
}

export interface SessionPresence {
  sessionId: string
  clientCount: number
  clientIds: string[]
}

export interface BroadcastResult {
  delivered: number
  failed: number
  sessionId?: string
}

/**
 * In-memory registry of connected SSE clients. Agent loop events are pushed
 * here and fanned out to every client subscribed to the relevant session.
 *
 * Phase 78 extends the hub with:
 *  - per-session client indexes (so a broadcast never scans the full set)
 *  - explicit attach/detach so clients can change subscriptions mid-stream
 *  - per-session presence so dashboards can show who's watching
 *  - per-broadcast failure accounting (so one dead client doesn't mask a
 *    real fan-out count)
 */
export class SSEHub {
  private clients = new Map<string, SSEClient>()
  /** sessionId -> set of client ids subscribed to it. */
  private sessionIndex = new Map<string, Set<string>>()
  private log: Logger

  constructor(logger?: Logger) {
    this.log = logger ?? getLogger()
  }

  register(client: SSEClient): void {
    this.clients.set(client.id, client)
    for (const sessionId of client.sessionIds) {
      this.indexSession(sessionId, client.id)
    }
    this.log.info('SSE client connected', {
      clientId: client.id,
      sessionIds: [...client.sessionIds],
    })
  }

  unregister(clientId: string): void {
    const client = this.clients.get(clientId)
    if (!client) return
    for (const sessionId of client.sessionIds) {
      this.deindexSession(sessionId, clientId)
    }
    this.clients.delete(clientId)
    this.log.info('SSE client disconnected', { clientId })
  }

  /**
   * Add a session to a client's subscription set. Idempotent. Updates the
   * session index in O(1) and is safe to call from a runtime handler while
   * a stream is open.
   */
  attach(clientId: string, sessionId: string): boolean {
    const client = this.clients.get(clientId)
    if (!client) return false
    if (client.sessionIds.has(sessionId)) return true
    client.sessionIds.add(sessionId)
    this.indexSession(sessionId, clientId)
    this.log.info('SSE client attached', { clientId, sessionId })
    return true
  }

  /** Drop a session from a client's subscription set. Idempotent. */
  detach(clientId: string, sessionId: string): boolean {
    const client = this.clients.get(clientId)
    if (!client) return false
    if (!client.sessionIds.delete(sessionId)) return true
    this.deindexSession(sessionId, clientId)
    this.log.info('SSE client detached', { clientId, sessionId })
    return true
  }

  /** Broadcast an event to every client subscribed to `sessionId` (or all if omitted). */
  broadcast(event: string, data: unknown, sessionId?: string): BroadcastResult {
    const message = formatSSE({ event, data: JSON.stringify(data) })
    const targets = sessionId
      ? this.clientsForSession(sessionId)
      : Array.from(this.clients.values())
    let delivered = 0
    let failed = 0
    for (const client of targets) {
      if (!this.enqueueSafe(client, message)) {
        failed++
        continue
      }
      delivered++
    }
    return { delivered, failed, sessionId }
  }

  /**
   * Enqueue `message` to every client subscribed to `sessionId` that has NOT
   * already seen an event id >= `fromId` (Last-Event-ID replay hint).
   * Used by late-join replay so a client that resumes after a disconnect
   * doesn't get events it already processed.
   *
   * Returns the number of clients the message was enqueued to.
   */
  broadcastSince(
    event: string,
    data: unknown,
    sessionId: string,
    fromId?: string,
  ): BroadcastResult {
    const message = formatSSE({
      event,
      data: JSON.stringify(data),
      ...(fromId !== undefined ? { id: fromId } : {}),
    })
    const targets = this.clientsForSession(sessionId)
    let delivered = 0
    let failed = 0
    for (const client of targets) {
      if (fromId !== undefined && client.lastEventId && client.lastEventId >= fromId) {
        // Client has already seen at least this event id.
        continue
      }
      if (!this.enqueueSafe(client, message)) {
        failed++
        continue
      }
      delivered++
    }
    return { delivered, failed, sessionId }
  }

  /** Return a snapshot of who's currently watching `sessionId`. */
  presence(sessionId: string): SessionPresence {
    const ids = this.sessionIndex.get(sessionId)
    return {
      sessionId,
      clientCount: ids?.size ?? 0,
      clientIds: ids ? Array.from(ids) : [],
    }
  }

  /** All known sessions with at least one attached client. */
  activeSessions(): string[] {
    return Array.from(this.sessionIndex.keys()).filter((id) => {
      const set = this.sessionIndex.get(id)
      return set !== undefined && set.size > 0
    })
  }

  stats(): SSEStats {
    return {
      totalClients: this.clients.size,
      clients: Array.from(this.clients.values()).map((c) => ({
        id: c.id,
        sessionIds: Array.from(c.sessionIds),
        connectedAt: c.connectedAt,
        duration: Date.now() - c.connectedAt,
      })),
    }
  }

  /** Internal helper: enqueue a message to a client; auto-prune on failure. */
  private enqueueSafe(client: SSEClient, message: string): boolean {
    try {
      client.controller.enqueue(message)
      return true
    } catch {
      // Controller closed; clean up so future broadcasts skip it.
      this.unregister(client.id)
      return false
    }
  }

  private indexSession(sessionId: string, clientId: string): void {
    let set = this.sessionIndex.get(sessionId)
    if (!set) {
      set = new Set()
      this.sessionIndex.set(sessionId, set)
    }
    set.add(clientId)
  }

  private deindexSession(sessionId: string, clientId: string): void {
    const set = this.sessionIndex.get(sessionId)
    if (!set) return
    set.delete(clientId)
    if (set.size === 0) this.sessionIndex.delete(sessionId)
  }

  private clientsForSession(sessionId: string): SSEClient[] {
    const ids = this.sessionIndex.get(sessionId)
    if (!ids) return []
    const out: SSEClient[] = []
    for (const id of ids) {
      const c = this.clients.get(id)
      if (c) out.push(c)
    }
    return out
  }
}

export function formatSSE(sse: {
  event: string
  data: string
  id?: string
  retry?: number
}): string {
  let out = ''
  if (sse.id) out += `id: ${sse.id}\n`
  if (sse.retry) out += `retry: ${sse.retry}\n`
  out += `event: ${sse.event}\n`
  out += `data: ${sse.data}\n\n`
  return out
}
