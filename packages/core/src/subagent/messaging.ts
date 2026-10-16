/**
 * Cross-session messaging (Phase 98): a shared, ordered, in-memory message
 * bus so agents in different sessions (agent teams) can communicate.
 *
 * Delivery model: every envelope goes into one ordered log; each session
 * owns a read cursor, so inboxes are independent, late-registered sessions
 * still receive their backlog, and `to: '*'` broadcasts fan out at read
 * time to every session.
 */

export interface SessionMessage {
  readonly id: string
  /** Sending session id. */
  readonly from: string
  /** Recipient session id, or '*' for a broadcast. */
  readonly to: string
  readonly content: string
  readonly sentAt: number
}

export interface SessionMessageFilter {
  /** Only return messages from this sender. */
  from?: string
}

/** A per-session view over the shared bus. */
export interface SessionInbox {
  /** Drain messages addressed to this session (directed or broadcast). */
  receive(filter?: SessionMessageFilter): SessionMessage[]
  /** Live push for new matching messages; returns an unsubscribe function. */
  subscribe(listener: (message: SessionMessage) => void): () => void
}

export class SessionMessageBus {
  private log: SessionMessage[] = []
  private cursors = new Map<string, number>()
  private listeners = new Map<string, Set<(message: SessionMessage) => void>>()
  private counter = 0

  /** Send a directed message or broadcast (`to: '*'`). Returns the envelope id. */
  send(from: string, to: string, content: string): string {
    this.counter += 1
    const id = `msg-${this.counter}`
    const envelope: SessionMessage = { id, from, to, content, sentAt: Date.now() }
    this.log.push(envelope)
    if (to === '*') {
      for (const [sessionId, set] of this.listeners) {
        if (sessionId === from) continue
        for (const listener of set) listener(envelope)
      }
    } else {
      for (const listener of this.listeners.get(to) ?? []) listener(envelope)
    }
    return id
  }

  /** Get (and lazily create) the inbox for a session. */
  inbox(sessionId: string): SessionInbox {
    if (!this.cursors.has(sessionId)) this.cursors.set(sessionId, 0)
    const bus = this
    return {
      receive: (filter?: SessionMessageFilter) => bus.receive(sessionId, filter),
      subscribe: (listener: (message: SessionMessage) => void) =>
        bus.subscribe(sessionId, undefined, listener),
    }
  }

  /** All envelopes ever sent, oldest first (introspection/testing). */
  allMessages(): readonly SessionMessage[] {
    return this.log
  }

  private receive(sessionId: string, filter?: SessionMessageFilter): SessionMessage[] {
    const cursor = this.cursors.get(sessionId) ?? 0
    const delivered: SessionMessage[] = []
    for (let index = cursor; index < this.log.length; index++) {
      const envelope = this.log[index]
      if (!envelope) continue
      if (envelope.to !== sessionId && envelope.to !== '*') continue
      if (envelope.from === sessionId) continue
      if (filter?.from !== undefined && envelope.from !== filter.from) continue
      delivered.push(envelope)
    }
    this.cursors.set(sessionId, this.log.length)
    return delivered
  }

  private subscribe(
    sessionId: string,
    filter: SessionMessageFilter | undefined,
    listener: (message: SessionMessage) => void,
  ): () => void {
    const set = this.listeners.get(sessionId) ?? new Set()
    const wrapped = (message: SessionMessage): void => {
      if (filter?.from !== undefined && message.from !== filter.from) return
      listener(message)
    }
    set.add(wrapped)
    this.listeners.set(sessionId, set)
    return () => {
      set.delete(wrapped)
      if (set.size === 0) this.listeners.delete(sessionId)
    }
  }
}
