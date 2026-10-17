import { beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionLog, createEvent } from '../events'
import { exportSession } from './export'

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'forge-export-'))
})

async function createTestSession(sessionId: string) {
  const log = new SessionLog(tempDir, sessionId)

  await log.append(
    createEvent('session.created', sessionId, {
      model: 'claude-sonnet-4-20250514',
      cwd: '/tmp/project',
      title: 'Code Review Session',
    }),
  )

  await log.append(
    createEvent('session.message', sessionId, {
      role: 'user',
      content: 'Review this code for bugs',
    }),
  )

  await log.append(
    createEvent('session.tool_call', sessionId, {
      toolCallId: 'tc-1',
      toolName: 'read',
      args: { filePath: '/tmp/project/app.ts' },
    }),
  )

  await log.append(
    createEvent('session.tool_result', sessionId, {
      toolCallId: 'tc-1',
      toolName: 'read',
      result: 'const x = 1',
      durationMs: 25,
    }),
  )

  await log.append(
    createEvent('session.message', sessionId, {
      role: 'assistant',
      content:
        'Found a bug: missing null check on line 3.\n```typescript\nif (user) {\n  console.log(user.name)\n}\n```',
      tokens: { input: 150, output: 80 },
    }),
  )

  await log.append(
    createEvent('session.error', sessionId, {
      code: 'FORGE_3001',
      message: 'Rate limit exceeded',
      severity: 'warn',
      recovery: 'Retry after 30s',
    }),
  )

  await log.append(
    createEvent('session.ended', sessionId, {
      reason: 'user',
      totalTokens: { input: 150, output: 80 },
      totalCost: 0.0035,
    }),
  )
}

describe('exportSession', () => {
  it('throws for nonexistent session', async () => {
    await expect(
      exportSession({
        baseDir: tempDir,
        sessionId: 'nonexistent',
        format: 'markdown',
      }),
    ).rejects.toThrow('not found')
  })

  it('exports to markdown format', async () => {
    await createTestSession('s1')

    const result = await exportSession({
      baseDir: tempDir,
      sessionId: 's1',
      format: 'markdown',
    })

    expect(result.format).toBe('markdown')
    expect(result.sessionId).toBe('s1')
    expect(result.eventCount).toBeGreaterThan(0)
    expect(result.messageCount).toBe(2)
    expect(result.content).toContain('# Code Review Session')
    expect(result.content).toContain('**Model:** claude-sonnet-4-20250514')
    expect(result.content).toContain('**User**')
    expect(result.content).toContain('Review this code for bugs')
    expect(result.content).toContain('**Assistant**')
    expect(result.content).toContain('Found a bug: missing null check')
    expect(result.content).toContain('```typescript')
  })

  it('exports markdown with tool calls', async () => {
    await createTestSession('s2')

    const result = await exportSession({
      baseDir: tempDir,
      sessionId: 's2',
      format: 'markdown',
      includeToolCalls: true,
    })

    expect(result.content).toContain('**Tool Call:** `read`')
    expect(result.content).toContain('Tool Result')
  })

  it('exports markdown without tool calls', async () => {
    await createTestSession('s3')

    const result = await exportSession({
      baseDir: tempDir,
      sessionId: 's3',
      format: 'markdown',
      includeToolCalls: false,
    })

    expect(result.content).not.toContain('Tool Call')
    expect(result.content).not.toContain('Tool Result')
  })

  it('exports markdown with errors', async () => {
    await createTestSession('s4')

    const result = await exportSession({
      baseDir: tempDir,
      sessionId: 's4',
      format: 'markdown',
      includeErrors: true,
    })

    expect(result.content).toContain('FORGE_3001')
    expect(result.content).toContain('Rate limit exceeded')
  })

  it('exports markdown without errors', async () => {
    await createTestSession('s5')

    const result = await exportSession({
      baseDir: tempDir,
      sessionId: 's5',
      format: 'markdown',
      includeErrors: false,
    })

    expect(result.content).not.toContain('FORGE_3001')
  })

  it('exports markdown without metadata', async () => {
    await createTestSession('s6')

    const result = await exportSession({
      baseDir: tempDir,
      sessionId: 's6',
      format: 'markdown',
      includeMetadata: false,
    })

    expect(result.content).not.toContain('# Code Review Session')
    expect(result.content).toContain('Review this code for bugs')
  })

  it('exports to JSON format', async () => {
    await createTestSession('s7')

    const result = await exportSession({
      baseDir: tempDir,
      sessionId: 's7',
      format: 'json',
    })

    expect(result.format).toBe('json')
    const parsed = JSON.parse(result.content)
    expect(parsed.schemaVersion).toBe(1)
    expect(parsed.events).toBeArray()
    expect(parsed.events.length).toBeGreaterThan(0)
    expect(parsed.events[0].type).toBe('session.created')
  })

  it('JSON preserves all event data', async () => {
    await createTestSession('s8')

    const result = await exportSession({
      baseDir: tempDir,
      sessionId: 's8',
      format: 'json',
    })

    const parsed = JSON.parse(result.content)
    const types = parsed.events.map((e: { type: string }) => e.type)
    expect(types).toContain('session.created')
    expect(types).toContain('session.message')
    expect(types).toContain('session.tool_call')
    expect(types).toContain('session.tool_result')
    expect(types).toContain('session.error')
    expect(types).toContain('session.ended')
  })

  it('exports to text format', async () => {
    await createTestSession('s9')

    const result = await exportSession({
      baseDir: tempDir,
      sessionId: 's9',
      format: 'text',
    })

    expect(result.format).toBe('text')
    expect(result.content).toContain('Session: Code Review Session')
    expect(result.content).toContain('Model: claude-sonnet-4-20250514')
    expect(result.content).toContain('[USER]')
    expect(result.content).toContain('Review this code for bugs')
    expect(result.content).toContain('[ASSISTANT]')
    expect(result.content).toContain('Found a bug')
  })

  it('text includes tool calls', async () => {
    await createTestSession('s10')

    const result = await exportSession({
      baseDir: tempDir,
      sessionId: 's10',
      format: 'text',
      includeToolCalls: true,
    })

    expect(result.content).toContain('Tool: read')
    expect(result.content).toContain('Result: OK')
  })

  it('text includes errors', async () => {
    await createTestSession('s11')

    const result = await exportSession({
      baseDir: tempDir,
      sessionId: 's11',
      format: 'text',
      includeErrors: true,
    })

    expect(result.content).toContain('Error [FORGE_3001]')
  })

  it('text includes session end info', async () => {
    await createTestSession('s12')

    const result = await exportSession({
      baseDir: tempDir,
      sessionId: 's12',
      format: 'text',
    })

    expect(result.content).toContain('Ended: user')
    expect(result.content).toContain('Cost: $0.0035')
  })

  it('markdown includes session end info', async () => {
    await createTestSession('s13')

    const result = await exportSession({
      baseDir: tempDir,
      sessionId: 's13',
      format: 'markdown',
    })

    expect(result.content).toContain('**Session ended:** user')
    expect(result.content).toContain('$0.0035')
  })

  it('JSON roundtrips correctly', async () => {
    await createTestSession('s14')

    const result = await exportSession({
      baseDir: tempDir,
      sessionId: 's14',
      format: 'json',
    })

    const parsed = JSON.parse(result.content)
    const reStringified = JSON.stringify(parsed, null, 2)
    expect(reStringified).toBe(result.content)
  })
})
