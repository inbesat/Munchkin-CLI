import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * Opt-in usage telemetry (Phase 147). Off by default. Events carry names,
 * counts, and durations only: string values are validated against a strict
 * character set and length cap, so code, prompts, file paths, tool arguments,
 * and personal data can never be transmitted.
 */

export const DEFAULT_TELEMETRY_ENDPOINT = 'https://telemetry.forge.dev/v1/events'

const SCHEMA_VERSION = 1
/** Safe value charset: no whitespace, no path separators, no colons, max 64 chars. */
const SAFE_STRING = /^[A-Za-z0-9._-]{1,64}$/
/** Event names: lowercase dotted tokens (e.g. `session.start`). */
const SAFE_NAME = /^[a-z][a-z0-9.-]{0,63}$/
const MAX_PROPERTIES = 20
const DEFAULT_MAX_EVENTS = 100

export interface TelemetryEvent {
  name: string
  properties?: Record<string, string | number | boolean>
}

export interface TelemetryPayload {
  schemaVersion: number
  installId: string
  events: TelemetryEvent[]
}

export type TelemetryTransport = (payload: TelemetryPayload) => Promise<void>

export interface TelemetryClientOptions {
  /** Override the transport (tests); default POSTs to the endpoint. */
  transport?: TelemetryTransport
  /** Buffer cap; oldest events are dropped beyond this. */
  maxEvents?: number
}

export interface TelemetryClient {
  readonly enabled: boolean
  /** Buffered (valid, unsent) event count. */
  readonly pending: number
  /** Events rejected by validation since start (never sent). */
  readonly dropped: number
  track(event: TelemetryEvent): void
  /** Send buffered events. Returns false on failure; events are kept for retry. */
  flush(): Promise<boolean>
}

/** Drop invalid property values; reject the whole event when its name is invalid. */
function sanitizeEvent(event: TelemetryEvent): TelemetryEvent | null {
  if (!SAFE_NAME.test(event.name)) return null
  const properties: Record<string, string | number | boolean> = {}
  let count = 0
  for (const [key, value] of Object.entries(event.properties ?? {})) {
    if (count >= MAX_PROPERTIES) break
    if (!SAFE_STRING.test(key)) continue
    if (typeof value === 'string') {
      if (!SAFE_STRING.test(value)) continue
    } else if (typeof value === 'number') {
      if (!Number.isFinite(value)) continue
    } else if (typeof value !== 'boolean') {
      continue
    }
    properties[key] = value
    count += 1
  }
  return { name: event.name, properties }
}

export function createTelemetryClient(
  config: { enabled: boolean; endpoint?: string },
  installId: string,
  options: TelemetryClientOptions = {},
): TelemetryClient {
  if (!SAFE_STRING.test(installId)) throw new Error('invalid telemetry install id')
  const enabled = config.enabled
  const endpoint = config.endpoint ?? DEFAULT_TELEMETRY_ENDPOINT
  const maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS
  const transport: TelemetryTransport =
    options.transport ??
    (async (payload) => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(`telemetry endpoint responded ${response.status}`)
    })

  let buffer: TelemetryEvent[] = []
  let dropped = 0

  return {
    enabled,
    get pending() {
      return buffer.length
    },
    get dropped() {
      return dropped
    },
    track(event) {
      if (!enabled) return
      const clean = sanitizeEvent(event)
      if (clean === null) {
        dropped += 1
        return
      }
      buffer.push(clean)
      if (buffer.length > maxEvents) buffer = buffer.slice(buffer.length - maxEvents)
    },
    async flush() {
      if (!enabled || buffer.length === 0) return true
      try {
        await transport({ schemaVersion: SCHEMA_VERSION, installId, events: [...buffer] })
        buffer = []
        return true
      } catch {
        // Telemetry is best-effort: keep the (capped) buffer for the next flush.
        return false
      }
    },
  }
}

/** Path of the persisted anonymous install id (global config dir). */
export function getInstallIdPath(): string {
  return join(homedir(), '.config', 'forge', 'telemetry-id')
}

/** Read the anonymous install id, creating it on first use. */
export function loadOrCreateInstallId(file: string = getInstallIdPath()): string {
  try {
    const existing = readFileSync(file, 'utf8').trim()
    if (SAFE_STRING.test(existing)) return existing
  } catch {
    // Missing or unreadable - create a fresh id below.
  }
  const id = randomUUID()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${id}\n`)
  return id
}
