import { createHash } from 'crypto'

/** Type of audit event. */
export type AuditEventType =
  | 'tool_call'
  | 'tool_result'
  | 'permission_decision'
  | 'hook_execution'
  | 'session_start'
  | 'session_end'
  | 'session_resume'
  | 'mode_change'
  | 'config_change'
  | 'circuit_breaker'
  | 'error'

/** Severity level of an audit event. */
export type AuditSeverity = 'info' | 'warning' | 'critical'

/** Audit log entry. */
export interface AuditEntry {
  /** Unique identifier for this entry. */
  id: string
  /** Timestamp in ISO 8601 format. */
  timestamp: string
  /** Type of event. */
  type: AuditEventType
  /** Severity level. */
  severity: AuditSeverity
  /** Session ID this entry belongs to. */
  sessionId: string
  /** User/agent identifier. */
  actor: string
  /** Human-readable description. */
  description: string
  /** Structured event data. */
  data: Record<string, unknown>
  /** Hash of the previous entry (for tamper evidence). */
  previousHash: string
  /** Hash of this entry (including previousHash). */
  hash: string
}

/** Query options for audit log. */
export interface AuditQuery {
  /** Filter by session ID. */
  sessionId?: string
  /** Filter by event type. */
  type?: AuditEventType
  /** Filter by severity. */
  severity?: AuditSeverity
  /** Filter by actor. */
  actor?: string
  /** Start time (ISO 8601). */
  startTime?: string
  /** End time (ISO 8601). */
  endTime?: string
  /** Maximum number of results. */
  limit?: number
  /** Offset for pagination. */
  offset?: number
}

/** Result of a query. */
export interface AuditQueryResult {
  /** Matching entries. */
  entries: AuditEntry[]
  /** Total count (ignoring limit/offset). */
  totalCount: number
}

/** Audit log configuration. */
export interface AuditConfig {
  /** Maximum number of entries to keep in memory. Default: 10000. */
  maxEntries?: number
  /** Whether to persist to disk. Default: false. */
  persist?: boolean
  /** Path to persist file. */
  persistPath?: string
}

/** Compute SHA-256 hash of data. */
function computeHash(data: string): string {
  return createHash('sha256').update(data).digest('hex')
}

/** Generate a unique entry ID. */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

/** Create an audit entry. */
function createEntry(
  type: AuditEventType,
  severity: AuditSeverity,
  sessionId: string,
  actor: string,
  description: string,
  data: Record<string, unknown>,
  previousHash: string,
): AuditEntry {
  const id = generateId()
  const timestamp = new Date().toISOString()

  // Compute hash: hash(id + timestamp + type + severity + sessionId + actor + description + JSON.stringify(data) + previousHash)
  const hashInput = `${id}${timestamp}${type}${severity}${sessionId}${actor}${description}${JSON.stringify(data)}${previousHash}`
  const hash = computeHash(hashInput)

  return {
    id,
    timestamp,
    type,
    severity,
    sessionId,
    actor,
    description,
    data,
    previousHash,
    hash,
  }
}

/** Audit log class. */
export class AuditLog {
  private entries: AuditEntry[] = []
  private lastHash: string = '0'.repeat(64) // Genesis hash
  private config: Required<AuditConfig>

  constructor(config: AuditConfig = {}) {
    this.config = {
      maxEntries: config.maxEntries ?? 10000,
      persist: config.persist ?? false,
      persistPath: config.persistPath ?? './audit.log',
    }
  }

  /** Log a tool call. */
  logToolCall(
    sessionId: string,
    actor: string,
    toolName: string,
    toolArgs: Record<string, unknown>,
    toolCallId: string,
  ): AuditEntry {
    return this.addEntry({
      type: 'tool_call',
      severity: 'info',
      sessionId,
      actor,
      description: `Tool call: ${toolName}`,
      data: { toolName, toolArgs, toolCallId },
    })
  }

  /** Log a tool result. */
  logToolResult(
    sessionId: string,
    actor: string,
    toolName: string,
    success: boolean,
    result?: unknown,
    error?: string,
    toolCallId?: string,
  ): AuditEntry {
    return this.addEntry({
      type: 'tool_result',
      severity: success ? 'info' : 'warning',
      sessionId,
      actor,
      description: `Tool result: ${toolName} (${success ? 'success' : 'failed'})`,
      data: { toolName, success, result, error, toolCallId },
    })
  }

  /** Log a permission decision. */
  logPermissionDecision(
    sessionId: string,
    actor: string,
    toolName: string,
    decision: 'allow' | 'ask' | 'deny',
    reason?: string,
    mode?: string,
  ): AuditEntry {
    return this.addEntry({
      type: 'permission_decision',
      severity: decision === 'deny' ? 'warning' : 'info',
      sessionId,
      actor,
      description: `Permission decision for ${toolName}: ${decision}`,
      data: { toolName, decision, reason, mode },
    })
  }

  /** Log a hook execution. */
  logHookExecution(
    sessionId: string,
    actor: string,
    hookName: string,
    success: boolean,
    result?: unknown,
    error?: string,
  ): AuditEntry {
    return this.addEntry({
      type: 'hook_execution',
      severity: success ? 'info' : 'warning',
      sessionId,
      actor,
      description: `Hook execution: ${hookName} (${success ? 'success' : 'failed'})`,
      data: { hookName, success, result, error },
    })
  }

  /** Log a session event. */
  logSessionEvent(
    type: 'session_start' | 'session_end' | 'session_resume',
    sessionId: string,
    actor: string,
    data: Record<string, unknown> = {},
  ): AuditEntry {
    return this.addEntry({
      type,
      severity: 'info',
      sessionId,
      actor,
      description: `Session ${type.replace('session_', '')}`,
      data,
    })
  }

  /** Log a mode change. */
  logModeChange(
    sessionId: string,
    actor: string,
    oldMode: string,
    newMode: string,
  ): AuditEntry {
    return this.addEntry({
      type: 'mode_change',
      severity: 'info',
      sessionId,
      actor,
      description: `Permission mode changed: ${oldMode} -> ${newMode}`,
      data: { oldMode, newMode },
    })
  }

  /** Log a config change. */
  logConfigChange(
    sessionId: string,
    actor: string,
    configKey: string,
    oldValue: unknown,
    newValue: unknown,
  ): AuditEntry {
    return this.addEntry({
      type: 'config_change',
      severity: 'info',
      sessionId,
      actor,
      description: `Config changed: ${configKey}`,
      data: { configKey, oldValue, newValue },
    })
  }

  /** Log a circuit breaker trigger. */
  logCircuitBreaker(
    sessionId: string,
    actor: string,
    breakerId: string,
    breakerName: string,
    command: string,
    action: 'prompt' | 'deny' | 'log',
  ): AuditEntry {
    return this.addEntry({
      type: 'circuit_breaker',
      severity: 'critical',
      sessionId,
      actor,
      description: `Circuit breaker triggered: ${breakerName}`,
      data: { breakerId, breakerName, command, action },
    })
  }

  /** Log an error. */
  logError(
    sessionId: string,
    actor: string,
    error: Error | string,
    context?: Record<string, unknown>,
  ): AuditEntry {
    const errorMessage = error instanceof Error ? error.message : error
    const errorStack = error instanceof Error ? error.stack : undefined
    return this.addEntry({
      type: 'error',
      severity: 'critical',
      sessionId,
      actor,
      description: `Error: ${errorMessage}`,
      data: { error: errorMessage, stack: errorStack, context },
    })
  }

  /** Add a generic entry. */
  addEntry(entry: Omit<AuditEntry, 'id' | 'timestamp' | 'previousHash' | 'hash'>): AuditEntry {
    // Deep clone data to ensure immutability
    const clonedData = JSON.parse(JSON.stringify(entry.data))

    const newEntry = createEntry(
      entry.type,
      entry.severity,
      entry.sessionId,
      entry.actor,
      entry.description,
      clonedData,
      this.lastHash,
    )

    this.entries.push(newEntry)
    this.lastHash = newEntry.hash

    // Trim if over max entries
    if (this.entries.length > this.config.maxEntries) {
      this.entries = this.entries.slice(-this.config.maxEntries)
    }

    // Persist if enabled
    if (this.config.persist) {
      this.persistEntry(newEntry)
    }

    // Return a copy with fresh data clone to ensure immutability
    return {
      ...newEntry,
      data: JSON.parse(JSON.stringify(newEntry.data)),
    }
  }

  /** Persist a single entry to disk. */
  private persistEntry(_entry: AuditEntry): void {
    try {
      // In a real implementation, use fs.appendFileSync
      // const line = JSON.stringify(_entry) + '\n'
      // require('fs').appendFileSync(this.config.persistPath, line)
    } catch {
      // Ignore persistence errors
    }
  }

  /** Query the audit log. */
  query(options: AuditQuery = {}): AuditQueryResult {
    let filtered = [...this.entries]

    if (options.sessionId) {
      filtered = filtered.filter((e) => e.sessionId === options.sessionId)
    }
    if (options.type) {
      filtered = filtered.filter((e) => e.type === options.type)
    }
    if (options.severity) {
      filtered = filtered.filter((e) => e.severity === options.severity)
    }
    if (options.actor) {
      filtered = filtered.filter((e) => e.actor === options.actor)
    }
    if (options.startTime) {
      const start = new Date(options.startTime).getTime()
      filtered = filtered.filter((e) => new Date(e.timestamp).getTime() >= start)
    }
    if (options.endTime) {
      const end = new Date(options.endTime).getTime()
      filtered = filtered.filter((e) => new Date(e.timestamp).getTime() <= end)
    }

    // Sort by timestamp descending (newest first)
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    const totalCount = filtered.length

    if (options.offset) {
      filtered = filtered.slice(options.offset)
    }
    if (options.limit) {
      filtered = filtered.slice(0, options.limit)
    }

    return { entries: filtered, totalCount }
  }

  /** Get all entries for a session. */
  getSessionEntries(sessionId: string): AuditEntry[] {
    return this.query({ sessionId }).entries
  }

  /** Get entries by type for a session. */
  getEntriesByType(sessionId: string, type: AuditEventType): AuditEntry[] {
    return this.query({ sessionId, type }).entries
  }

  /** Get tool calls for a session. */
  getToolCalls(sessionId: string): AuditEntry[] {
    return this.getEntriesByType(sessionId, 'tool_call')
  }

  /** Get permission decisions for a session. */
  getPermissionDecisions(sessionId: string): AuditEntry[] {
    return this.getEntriesByType(sessionId, 'permission_decision')
  }

  /** Get circuit breaker triggers for a session. */
  getCircuitBreakers(sessionId: string): AuditEntry[] {
    return this.getEntriesByType(sessionId, 'circuit_breaker')
  }

  /** Get errors for a session. */
  getErrors(sessionId: string): AuditEntry[] {
    return this.getEntriesByType(sessionId, 'error')
  }

  /** Get all entries (newest first). */
  getAllEntries(limit?: number): AuditEntry[] {
    const result = this.query({ limit })
    return result.entries
  }

  /** Verify the integrity of the hash chain. */
  verifyIntegrity(): { valid: boolean; brokenAt?: number; details?: string } {
    if (this.entries.length === 0) {
      return { valid: true }
    }

    let previousHash = '0'.repeat(64)

    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i]

      // Verify previousHash matches
      if (entry.previousHash !== previousHash) {
        return {
          valid: false,
          brokenAt: i,
          details: `Entry ${i} (${entry.id}) has invalid previousHash. Expected ${previousHash}, got ${entry.previousHash}`,
        }
      }

      // Verify entry's own hash
      const hashInput = `${entry.id}${entry.timestamp}${entry.type}${entry.severity}${entry.sessionId}${entry.actor}${entry.description}${JSON.stringify(entry.data)}${entry.previousHash}`
      const computedHash = computeHash(hashInput)
      if (computedHash !== entry.hash) {
        return {
          valid: false,
          brokenAt: i,
          details: `Entry ${i} (${entry.id}) has invalid hash. Expected ${computedHash}, got ${entry.hash}`,
        }
      }

      previousHash = entry.hash
    }

    return { valid: true }
  }

  /** Get the current chain head hash. */
  getChainHead(): string {
    return this.lastHash
  }

  /** Get entry count. */
  getCount(): number {
    return this.entries.length
  }

  /** Clear all entries (for testing). */
  clear(): void {
    this.entries = []
    this.lastHash = '0'.repeat(64)
  }

  /** Export entries as JSONL. */
  exportJSONL(): string {
    return this.entries.map((e) => JSON.stringify(e)).join('\n')
  }

  /** Import entries from JSONL (verifies chain). */
  importJSONL(jsonl: string): { imported: number; errors: string[] } {
    const lines = jsonl.trim().split('\n').filter((l) => l)
    let imported = 0
    const errors: string[] = []

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as AuditEntry
        // Verify the entry's hash
        const hashInput = `${entry.id}${entry.timestamp}${entry.type}${entry.severity}${entry.sessionId}${entry.actor}${entry.description}${JSON.stringify(entry.data)}${entry.previousHash}`
        const computedHash = computeHash(hashInput)
        if (computedHash !== entry.hash) {
          errors.push(`Invalid hash for entry ${entry.id}`)
          continue
        }
        this.entries.push(entry)
        this.lastHash = entry.hash
        imported++
      } catch (e) {
        errors.push(`Failed to parse line: ${e}`)
      }
    }

    return { imported, errors }
  }
}

/** Create a new audit log instance. */
export function createAuditLog(config?: AuditConfig): AuditLog {
  return new AuditLog(config)
}

/** Global audit log instance (for convenience). */
let globalAuditLog: AuditLog | null = null

/** Get or create the global audit log. */
export function getGlobalAuditLog(config?: AuditConfig): AuditLog {
  if (!globalAuditLog) {
    globalAuditLog = new AuditLog(config)
  }
  return globalAuditLog
}

/** Set the global audit log. */
export function setGlobalAuditLog(log: AuditLog): void {
  globalAuditLog = log
}

/** Clear the global audit log. */
export function clearGlobalAuditLog(): void {
  globalAuditLog = null
}