export interface KillSwitch {
  /** True when the upstream (keyed by its base URL) is hard-disabled */
  isDisabled(upstreamKey: string): boolean
}

export interface KillSwitchAdmin {
  disable(upstreamKey: string): void
  enable(upstreamKey: string): void
  list(): readonly string[]
}

/**
 * In-memory kill switch — sufficient for operator-initiated disables and for
 * tests. The SQLite-backed quota engine in `quota.ts` offers persistent
 * switches; both implement the same interface so the proxy can't tell them
 * apart.
 */
export class MemoryKillSwitch implements KillSwitch, KillSwitchAdmin {
  #disabled = new Set<string>()

  isDisabled(upstreamKey: string): boolean {
    return this.#disabled.has(upstreamKey)
  }

  disable(upstreamKey: string): void {
    this.#disabled.add(upstreamKey)
  }

  enable(upstreamKey: string): void {
    this.#disabled.delete(upstreamKey)
  }

  list(): readonly string[] {
    return Array.from(this.#disabled).sort()
  }
}
