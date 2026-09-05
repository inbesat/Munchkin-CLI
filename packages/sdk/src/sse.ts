import type { ParsedSSEFrame } from './types'

/**
 * Stateful SSE parser. Consumes a `ReadableStream<string>` of raw SSE wire
 * bytes and yields one parsed frame per logical event (blank-line delimited).
 *
 * Spec: https://html.spec.whatwg.org/multipage/server-sent-events.html
 *  - `event: <name>` sets the event name (default `message`)
 *  - `data: <payload>` is concatenated with newlines and must be non-empty
 *  - `id: <id>` sets the last event ID
 *  - `retry: <ms>` sets the reconnect interval
 *  - Lines beginning with `:` are comments (ignored)
 *  - A blank line dispatches the accumulated frame
 */
export class SSEParser {
  private buffer = ''
  private eventName = 'message'
  private dataLines: string[] = []
  private lastId?: string
  private retry?: number

  /** Feed a chunk of raw wire bytes; return any complete frames. */
  push(chunk: string): ParsedSSEFrame[] {
    this.buffer += chunk
    const frames: ParsedSSEFrame[] = []

    let sepIndex = this.buffer.indexOf('\n')
    while (sepIndex >= 0) {
      const rawLine = this.buffer.slice(0, sepIndex)
      this.buffer = this.buffer.slice(sepIndex + 1)

      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
      if (line === '') {
        const frame = this.flushFrame()
        if (frame) frames.push(frame)
      } else if (!line.startsWith(':')) {
        this.consumeLine(line)
      }
      sepIndex = this.buffer.indexOf('\n')
    }

    return frames
  }

  /** Flush whatever is buffered (call when stream ends). */
  end(): ParsedSSEFrame[] {
    const trailing: ParsedSSEFrame[] = []
    if (this.buffer.length > 0) {
      const line = this.buffer.endsWith('\r') ? this.buffer.slice(0, -1) : this.buffer
      if (line.length > 0 && !line.startsWith(':')) this.consumeLine(line)
      this.buffer = ''
    }
    const final = this.flushFrame()
    if (final) trailing.push(final)
    return trailing
  }

  private consumeLine(line: string): void {
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)

    switch (field) {
      case 'event':
        this.eventName = value
        break
      case 'data':
        this.dataLines.push(value)
        break
      case 'id':
        if (!value.includes('\u0000')) this.lastId = value
        break
      case 'retry': {
        const n = Number.parseInt(value, 10)
        if (Number.isFinite(n) && n >= 0) this.retry = n
        break
      }
      default:
        break
    }
  }

  private flushFrame(): ParsedSSEFrame | null {
    if (this.dataLines.length === 0) {
      this.eventName = 'message'
      return null
    }
    const payload = this.dataLines.join('\n')
    this.dataLines = []
    const frame: ParsedSSEFrame = { event: this.eventName, data: payload }
    if (this.lastId !== undefined) frame.id = this.lastId
    if (this.retry !== undefined) frame.retry = this.retry
    this.eventName = 'message'
    return frame
  }
}

/** Try to parse a SSE `data:` payload as JSON; fall back to the raw string. */
export function parseSSEData(payload: string): unknown {
  try {
    return JSON.parse(payload)
  } catch {
    return payload
  }
}
