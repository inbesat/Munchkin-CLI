/**
 * Auto-reconnect (Phase 118): wraps a client factory so dropped connections
 * are recovered transparently - probe the live client before each use,
 * drop dead ones, re-connect with bounded exponential backoff, and replay
 * state restoration (re-handshake, re-list tools) after recovery.
 * No-throw: failures surface as {ok:false, error} after the retry budget
 * is exhausted.
 */

export interface ReconnectProbe {
  ok: boolean
  error?: string
}

export interface ReconnectingMcpOptions<TClient> {
  /** Create and fully connect a fresh client. */
  connect: () => Promise<TClient>
  /** Cheap health probe; `{ok:false}` marks the client dead. */
  probe: (client: TClient) => Promise<ReconnectProbe>
  /** State restoration after a successful re-connect (re-handshake, tools). */
  onRestore?: (client: TClient) => Promise<void>
  maxRetries?: number
  baseBackoffMs?: number
}

export type ReconnectResult<TClient> =
  | { ok: true; client: TClient; reconnected: boolean }
  | { ok: false; error: string }

export class ReconnectingMcpClient<TClient> {
  private readonly options: Required<
    Pick<ReconnectingMcpOptions<TClient>, 'maxRetries' | 'baseBackoffMs'>
  > &
    ReconnectingMcpOptions<TClient>
  private active: TClient | null = null
  private recoveries = 0
  private everConnected = false

  constructor(options: ReconnectingMcpOptions<TClient>) {
    this.options = { maxRetries: 5, baseBackoffMs: 100, ...options }
  }

  get client(): TClient | null {
    return this.active
  }

  get recoveryCount(): number {
    return this.recoveries
  }

  /** Drop the current client explicitly (used by error paths). */
  invalidate(): void {
    this.active = null
  }

  /**
   * Return a live client: probes the active one, reconnects (with backoff)
   * when dead, and runs `onRestore` after every recovery.
   */
  async get(): Promise<ReconnectResult<TClient>> {
    if (this.active !== null) {
      const probe = await this.options.probe(this.active)
      if (probe.ok) return { ok: true, client: this.active, reconnected: false }
      this.active = null
    }

    const hadPreviousClient = this.recoveries > 0 || this.everConnected
    let lastError = 'unknown failure'
    for (let attempt = 0; attempt < this.options.maxRetries; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, this.options.baseBackoffMs * 2 ** (attempt - 1)))
      }
      try {
        const client = await this.options.connect()
        lastError = 'post-connect probe failed'
        const probe = await this.options.probe(client)
        if (!probe.ok) {
          lastError = probe.error ?? lastError
          continue
        }
        this.active = client
        this.everConnected = true
        if (hadPreviousClient && this.options.onRestore !== undefined) {
          try {
            await this.options.onRestore(client)
          } catch (error) {
            this.active = null
            lastError = `restore failed: ${error instanceof Error ? error.message : String(error)}`
            continue
          }
        }
        if (hadPreviousClient) this.recoveries++
        return { ok: true, client, reconnected: hadPreviousClient }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
      }
    }
    return {
      ok: false,
      error: `reconnect failed after ${this.options.maxRetries} attempts: ${lastError}`,
    }
  }
}
