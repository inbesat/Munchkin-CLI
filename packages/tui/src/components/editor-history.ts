export type EditorMode = 'prompt' | 'bash'

export interface EditorHistoryEntry {
  content: string
  timestamp: number
  mode: EditorMode
}

export class EditorHistory {
  private entries: EditorHistoryEntry[] = []
  private index = -1

  add(content: string, mode: EditorMode = 'prompt'): void {
    const trimmed = content.replace(/\s+$/, '')
    if (!trimmed) return
    const last = this.entries[this.entries.length - 1]
    if (last && last.content === trimmed && last.mode === mode) {
      return
    }
    this.entries.push({ content: trimmed, timestamp: Date.now(), mode })
    this.index = this.entries.length
  }

  previous(currentInput?: string): string | null {
    if (this.entries.length === 0) return null
    if (this.index > 0) {
      this.index--
      return this.entries[this.index].content
    }
    if (this.index === -1 && currentInput !== undefined) {
      this.index = this.entries.length
      return currentInput
    }
    return null
  }

  next(): string | null {
    if (this.index < this.entries.length - 1) {
      this.index++
      return this.entries[this.index].content
    }
    this.index = this.entries.length
    return null
  }

  reset(): void {
    this.index = this.entries.length
  }

  contains(content: string): boolean {
    return this.entries.some((e) => e.content === content)
  }

  all(): readonly EditorHistoryEntry[] {
    return this.entries
  }

  size(): number {
    return this.entries.length
  }

  clear(): void {
    this.entries = []
    this.index = -1
  }
}
