import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import {
  AuditLog,
  createAuditLog,
  getGlobalAuditLog,
  setGlobalAuditLog,
  clearGlobalAuditLog,
  AuditEventType,
  AuditSeverity,
  AuditEntry,
  AuditQuery,
} from './audit'

describe('Audit Log', () => {
  let auditLog: AuditLog

  beforeEach(() => {
    auditLog = createAuditLog({ maxEntries: 1000 })
    clearGlobalAuditLog()
  })

  afterEach(() => {
    clearGlobalAuditLog()
  })

  describe('Basic logging', () => {
    it('logs tool calls', () => {
      const entry = auditLog.logToolCall('session-1', 'agent', 'bash', { command: 'ls' }, 'call-1')
      expect(entry.type).toBe('tool_call')
      expect(entry.sessionId).toBe('session-1')
      expect(entry.actor).toBe('agent')
      expect(entry.data.toolName).toBe('bash')
      expect(entry.data.toolArgs).toEqual({ command: 'ls' })
      expect(entry.data.toolCallId).toBe('call-1')
      expect(entry.severity).toBe('info')
    })

    it('logs tool results', () => {
      const entry = auditLog.logToolResult('session-1', 'agent', 'bash', true, 'output', undefined, 'call-1')
      expect(entry.type).toBe('tool_result')
      expect(entry.data.success).toBe(true)
      expect(entry.data.result).toBe('output')
    })

    it('logs failed tool results', () => {
      const entry = auditLog.logToolResult('session-1', 'agent', 'bash', false, undefined, 'command not found', 'call-1')
      expect(entry.type).toBe('tool_result')
      expect(entry.data.success).toBe(false)
      expect(entry.data.error).toBe('command not found')
      expect(entry.severity).toBe('warning')
    })

    it('logs permission decisions', () => {
      const entry = auditLog.logPermissionDecision('session-1', 'agent', 'bash', 'allow', 'default mode', 'default')
      expect(entry.type).toBe('permission_decision')
      expect(entry.data.decision).toBe('allow')
      expect(entry.data.reason).toBe('default mode')
    })

    it('logs permission denials as warning', () => {
      const entry = auditLog.logPermissionDecision('session-1', 'agent', 'bash', 'deny', 'circuit breaker', 'bypass')
      expect(entry.severity).toBe('warning')
    })

    it('logs hook executions', () => {
      const entry = auditLog.logHookExecution('session-1', 'agent', 'pre_tool', true, { modified: true })
      expect(entry.type).toBe('hook_execution')
      expect(entry.data.hookName).toBe('pre_tool')
    })

    it('logs session events', () => {
      const start = auditLog.logSessionEvent('session_start', 'session-1', 'agent', { cwd: '/project' })
      expect(start.type).toBe('session_start')

      const end = auditLog.logSessionEvent('session_end', 'session-1', 'agent', { duration: 1000 })
      expect(end.type).toBe('session_end')

      const resume = auditLog.logSessionEvent('session_resume', 'session-1', 'agent', { previousSession: 'session-0' })
      expect(resume.type).toBe('session_resume')
    })

    it('logs mode changes', () => {
      const entry = auditLog.logModeChange('session-1', 'agent', 'default', 'acceptEdits')
      expect(entry.type).toBe('mode_change')
      expect(entry.data.oldMode).toBe('default')
      expect(entry.data.newMode).toBe('acceptEdits')
    })

    it('logs config changes', () => {
      const entry = auditLog.logConfigChange('session-1', 'agent', 'maxTokens', 4096, 8192)
      expect(entry.type).toBe('config_change')
      expect(entry.data.configKey).toBe('maxTokens')
      expect(entry.data.oldValue).toBe(4096)
      expect(entry.data.newValue).toBe(8192)
    })

    it('logs circuit breaker triggers', () => {
      const entry = auditLog.logCircuitBreaker('session-1', 'agent', 'rm-rf-root', 'Delete Root', 'rm -rf /', 'prompt')
      expect(entry.type).toBe('circuit_breaker')
      expect(entry.severity).toBe('critical')
      expect(entry.data.breakerId).toBe('rm-rf-root')
      expect(entry.data.action).toBe('prompt')
    })

    it('logs errors', () => {
      const error = new Error('Something went wrong')
      const entry = auditLog.logError('session-1', 'agent', error, { context: 'test' })
      expect(entry.type).toBe('error')
      expect(entry.severity).toBe('critical')
      expect(entry.data.error).toBe('Something went wrong')
      expect(entry.data.stack).toContain('Error: Something went wrong')
    })

    it('logs string errors', () => {
      const entry = auditLog.logError('session-1', 'agent', 'String error')
      expect(entry.data.error).toBe('String error')
    })
  })

  describe('Hash chain', () => {
    it('creates genesis hash for first entry', () => {
      const entry = auditLog.logToolCall('session-1', 'agent', 'bash', {}, 'call-1')
      expect(entry.previousHash).toBe('0'.repeat(64))
      expect(entry.hash).toBeDefined()
      expect(entry.hash.length).toBe(64)
    })

    it('chains hashes correctly', () => {
      const entry1 = auditLog.logToolCall('session-1', 'agent', 'bash', {}, 'call-1')
      const entry2 = auditLog.logToolCall('session-1', 'agent', 'bash', {}, 'call-2')
      expect(entry2.previousHash).toBe(entry1.hash)
    })

    it('verifyIntegrity passes for valid chain', () => {
      auditLog.logToolCall('session-1', 'agent', 'bash', {}, 'call-1')
      auditLog.logToolCall('session-1', 'agent', 'bash', {}, 'call-2')
      auditLog.logToolCall('session-1', 'agent', 'bash', {}, 'call-3')

      const result = auditLog.verifyIntegrity()
      expect(result.valid).toBe(true)
    })

    it('verifyIntegrity detects tampered entry', () => {
      auditLog.logToolCall('session-1', 'agent', 'bash', {}, 'call-1')
      auditLog.logToolCall('session-1', 'agent', 'bash', {}, 'call-2')

      // Tamper with the first entry's hash directly
      const entries = (auditLog as any).entries
      entries[0].hash = 'invalid-hash'

      const result = auditLog.verifyIntegrity()
      expect(result.valid).toBe(false)
      expect(result.brokenAt).toBe(0)
    })

    it('verifyIntegrity detects tampered hash', () => {
      auditLog.logToolCall('session-1', 'agent', 'bash', {}, 'call-1')

      const entries = (auditLog as any).entries
      entries[0].hash = 'invalid-hash'

      const result = auditLog.verifyIntegrity()
      expect(result.valid).toBe(false)
      expect(result.brokenAt).toBe(0)
    })

    it('getChainHead returns last hash', () => {
      const entry1 = auditLog.logToolCall('session-1', 'agent', 'bash', {}, 'call-1')
      const entry2 = auditLog.logToolCall('session-1', 'agent', 'bash', {}, 'call-2')

      expect(auditLog.getChainHead()).toBe(entry2.hash)
    })
  })

  describe('Querying', () => {
    beforeEach(() => {
      // Add various entries
      auditLog.logToolCall('session-1', 'agent', 'bash', { command: 'ls' }, 'call-1')
      auditLog.logToolCall('session-1', 'agent', 'bash', { command: 'cat file.txt' }, 'call-2')
      auditLog.logToolCall('session-2', 'agent', 'read', { path: 'file.txt' }, 'call-3')
      auditLog.logPermissionDecision('session-1', 'agent', 'bash', 'allow', 'default mode')
      auditLog.logPermissionDecision('session-1', 'agent', 'write', 'deny', 'circuit breaker')
      auditLog.logCircuitBreaker('session-1', 'agent', 'rm-rf-root', 'Delete Root', 'rm -rf /', 'deny')
      auditLog.logError('session-1', 'agent', new Error('Test error'))
    })

    it('queries by sessionId', () => {
      const result = auditLog.query({ sessionId: 'session-1' })
      expect(result.totalCount).toBe(6) // 3 tool calls + 2 permissions + 1 circuit breaker + 1 error
      expect(result.entries.every((e) => e.sessionId === 'session-1')).toBe(true)
    })

    it('queries by type', () => {
      const result = auditLog.query({ type: 'tool_call' })
      expect(result.totalCount).toBe(3)
      expect(result.entries.every((e) => e.type === 'tool_call')).toBe(true)
    })

    it('queries by severity', () => {
      const result = auditLog.query({ severity: 'critical' })
      expect(result.totalCount).toBe(2) // 1 circuit breaker + 1 error
      expect(result.entries.every((e) => e.severity === 'critical')).toBe(true)
    })

    it('queries by actor', () => {
      const result = auditLog.query({ actor: 'agent' })
      expect(result.totalCount).toBe(7)
    })

    it('queries by time range', () => {
      const now = new Date()
      const past = new Date(now.getTime() - 60000).toISOString()
      const future = new Date(now.getTime() + 60000).toISOString()

      const result = auditLog.query({ startTime: past, endTime: future })
      expect(result.totalCount).toBe(7)
    })

    it('limits results', () => {
      const result = auditLog.query({ limit: 3 })
      expect(result.entries.length).toBe(3)
      expect(result.totalCount).toBe(7)
    })

    it('paginates with offset', () => {
      const page1 = auditLog.query({ limit: 3, offset: 0 })
      const page2 = auditLog.query({ limit: 3, offset: 3 })

      expect(page1.entries.length).toBe(3)
      expect(page2.entries.length).toBe(3)
      expect(page1.entries[0].id).not.toBe(page2.entries[0].id)
    })

    it('returns newest first', () => {
      const result = auditLog.query({ limit: 10 })
      for (let i = 1; i < result.entries.length; i++) {
        expect(new Date(result.entries[i - 1].timestamp).getTime())
          .toBeGreaterThanOrEqual(new Date(result.entries[i].timestamp).getTime())
      }
    })

    it('getSessionEntries returns all for session', () => {
      const entries = auditLog.getSessionEntries('session-1')
      expect(entries.length).toBe(6)
    })

    it('getToolCalls returns only tool calls', () => {
      const calls = auditLog.getToolCalls('session-1')
      expect(calls.length).toBe(2)
      expect(calls.every((e) => e.type === 'tool_call')).toBe(true)
    })

    it('getPermissionDecisions returns only permission decisions', () => {
      const decisions = auditLog.getPermissionDecisions('session-1')
      expect(decisions.length).toBe(2)
      expect(decisions.every((e) => e.type === 'permission_decision')).toBe(true)
    })

    it('getCircuitBreakers returns only circuit breakers', () => {
      const breakers = auditLog.getCircuitBreakers('session-1')
      expect(breakers.length).toBe(1)
      expect(breakers[0].type).toBe('circuit_breaker')
    })

    it('getErrors returns only errors', () => {
      const errors = auditLog.getErrors('session-1')
      expect(errors.length).toBe(1)
      expect(errors[0].type).toBe('error')
    })
  })

  describe('Max entries limit', () => {
    it('trims old entries when over limit', () => {
      const smallLog = createAuditLog({ maxEntries: 5 })
      for (let i = 0; i < 10; i++) {
        smallLog.logToolCall('session-1', 'agent', 'bash', { i }, `call-${i}`)
        // Small delay to ensure different timestamps
        if (i < 9) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1)
      }
      expect(smallLog.getCount()).toBe(5)
      // Should keep the last 5
      const entries = smallLog.getAllEntries()
      // Check that we have the right set of values (5-9)
      const values = entries.map((e) => e.data.toolArgs.i).sort((a, b) => a - b)
      expect(values).toEqual([5, 6, 7, 8, 9])
    })
  })

  describe('Export/Import', () => {
    it('exports as JSONL', () => {
      auditLog.logToolCall('session-1', 'agent', 'bash', { command: 'ls' }, 'call-1')
      auditLog.logToolCall('session-1', 'agent', 'bash', { command: 'cat' }, 'call-2')

      const jsonl = auditLog.exportJSONL()
      const lines = jsonl.trim().split('\n')
      expect(lines.length).toBe(2)
      expect(JSON.parse(lines[0]).type).toBe('tool_call')
    })

    it('imports from JSONL', () => {
      auditLog.logToolCall('session-1', 'agent', 'bash', { command: 'ls' }, 'call-1')
      const jsonl = auditLog.exportJSONL()

      const newLog = createAuditLog()
      const result = newLog.importJSONL(jsonl)

      expect(result.imported).toBe(1)
      expect(result.errors.length).toBe(0)
      expect(newLog.getCount()).toBe(1)
    })

    it('import rejects invalid hash', () => {
      auditLog.logToolCall('session-1', 'agent', 'bash', { command: 'ls' }, 'call-1')
      let jsonl = auditLog.exportJSONL()

      // Tamper with the hash
      const lines = jsonl.split('\n')
      const entry = JSON.parse(lines[0])
      entry.hash = 'invalid'
      jsonl = JSON.stringify(entry)

      const newLog = createAuditLog()
      const result = newLog.importJSONL(jsonl)

      expect(result.imported).toBe(0)
      expect(result.errors.length).toBe(1)
    })
  })

  describe('Global audit log', () => {
    it('getGlobalAuditLog creates singleton', () => {
      const log1 = getGlobalAuditLog()
      const log2 = getGlobalAuditLog()
      expect(log1).toBe(log2)
    })

    it('setGlobalAuditLog replaces singleton', () => {
      const customLog = createAuditLog({ maxEntries: 5 })
      setGlobalAuditLog(customLog)
      expect(getGlobalAuditLog()).toBe(customLog)
    })

    it('clearGlobalAuditLog resets singleton', () => {
      getGlobalAuditLog()
      clearGlobalAuditLog()
      // Next call creates new instance
      const log = getGlobalAuditLog()
      expect(log).toBeDefined()
    })
  })

  describe('Entry structure', () => {
    it('entries have all required fields', () => {
      const entry = auditLog.logToolCall('session-1', 'agent', 'bash', { command: 'ls' }, 'call-1')

      expect(entry).toHaveProperty('id')
      expect(entry).toHaveProperty('timestamp')
      expect(entry).toHaveProperty('type')
      expect(entry).toHaveProperty('severity')
      expect(entry).toHaveProperty('sessionId')
      expect(entry).toHaveProperty('actor')
      expect(entry).toHaveProperty('description')
      expect(entry).toHaveProperty('data')
      expect(entry).toHaveProperty('previousHash')
      expect(entry).toHaveProperty('hash')
    })

    it('id is unique', () => {
      const entry1 = auditLog.logToolCall('session-1', 'agent', 'bash', {}, 'call-1')
      const entry2 = auditLog.logToolCall('session-1', 'agent', 'bash', {}, 'call-2')
      expect(entry1.id).not.toBe(entry2.id)
    })

    it('timestamp is valid ISO 8601', () => {
      const entry = auditLog.logToolCall('session-1', 'agent', 'bash', {}, 'call-1')
      const date = new Date(entry.timestamp)
      expect(date.toString()).not.toBe('Invalid Date')
    })
  })

  describe('Data integrity', () => {
    it('stores complex data objects', () => {
      const complexData = {
        nested: { a: 1, b: 'test' },
        array: [1, 2, 3],
        nullValue: null,
        undefinedValue: undefined,
      }
      const entry = auditLog.logToolCall('session-1', 'agent', 'bash', complexData, 'call-1')
      expect(entry.data.toolArgs).toEqual(complexData)
      expect(entry.data.toolName).toBe('bash')
      expect(entry.data.toolCallId).toBe('call-1')
    })

    it('data is immutable after logging', () => {
      const entry = auditLog.logToolCall('session-1', 'agent', 'bash', { cmd: 'ls' }, 'call-1')
      // Modifying the returned entry shouldn't affect the stored one
      entry.data.toolArgs.cmd = 'tampered'
      const stored = auditLog.getToolCalls('session-1')[0]
      expect(stored.data.toolArgs.cmd).toBe('ls')
    })
  })
})