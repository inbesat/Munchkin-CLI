import { describe, expect, it } from 'bun:test'
import { sanitizeContent, sanitizeEvents } from './share'
import type { SessionEvent } from './types'

describe('sanitizeContent handles JSON-encoded secrets', () => {
  it('redacts secrets serialized as JSON object fields', () => {
    const content = '"apiKey":"example-secret-123456" "password":"another-test-password"'
    const sanitized = sanitizeContent(content)
    expect(sanitized).not.toContain('example-secret-123456')
    expect(sanitized).not.toContain('another-test-password')
  })

  it('redacts secrets inside JSON.stringify output including braces', () => {
    const json = JSON.stringify({ apiKey: 'super-secret-key-42', path: '/workspace/file.ts' })
    const sanitized = sanitizeContent(json)
    expect(sanitized).not.toContain('super-secret-key-42')
    expect(sanitized).toContain('/workspace/file.ts')
  })
})

describe('sanitizeEvents fails closed for tool arguments', () => {
  it('never returns original arguments when sanitization breaks the JSON', () => {
    const event = {
      id: 'e1',
      sessionId: 's1',
      timestamp: 0,
      schemaVersion: 1,
      type: 'session.tool_call',
      payload: {
        toolCallId: 'c1',
        toolName: 'bash',
        args: { apiKey: 'example-secret-123456', weird: 'quote"break' },
      },
    } as unknown as SessionEvent

    const sanitized = sanitizeEvents([event])[0]
    if (sanitized.type !== 'session.tool_call') throw new Error('unexpected event type')
    const serialized = JSON.stringify(sanitized.payload.args)
    expect(serialized).not.toContain('example-secret-123456')
  })
})
