import { describe, expect, it } from 'bun:test'
import { type SessionEvent, createEvent } from '../events'
import { assembleMessages, hydrateMessages } from './hydration'
import { isAssistantMessage, isUserMessage } from './message'

function makeEvents(): SessionEvent[] {
  const events: SessionEvent[] = []

  events.push(
    createEvent('session.created', 's1', {
      model: 'claude-sonnet-4-20250514',
      cwd: '/tmp',
    }),
  )

  events.push(
    createEvent('session.message', 's1', {
      role: 'user',
      content: 'What files are in the project?',
    }),
  )

  events.push(
    createEvent('session.message', 's1', {
      role: 'assistant',
      content: 'Let me check the project structure.',
      tokens: { input: 50, output: 20 },
    }),
  )

  events.push(
    createEvent('session.tool_call', 's1', {
      toolCallId: 'tc-1',
      toolName: 'bash',
      args: { command: 'ls -la' },
    }),
  )

  events.push(
    createEvent('session.tool_result', 's1', {
      toolCallId: 'tc-1',
      toolName: 'bash',
      result:
        'total 8\ndrwxr-xr-x 2 user user 4096 Jan 1 00:00 .\n-rw-r--r-- 1 user user  100 Jan 1 00:00 app.ts',
      durationMs: 25,
    }),
  )

  events.push(
    createEvent('session.message', 's1', {
      role: 'assistant',
      content:
        'The project contains:\n- `app.ts` (100 bytes)\n- Directory structure with standard Unix permissions',
    }),
  )

  return events
}

describe('assembleMessages', () => {
  it('creates user and assistant messages', () => {
    const events = makeEvents()
    const messages = assembleMessages(events)

    expect(messages.length).toBeGreaterThanOrEqual(2)

    const userMsgs = messages.filter((m) => m.role === 'user')
    const assistantMsgs = messages.filter((m) => m.role === 'assistant')

    expect(userMsgs.length).toBeGreaterThanOrEqual(1)
    expect(assistantMsgs.length).toBeGreaterThanOrEqual(1)
  })

  it('user message has correct content', () => {
    const events = makeEvents()
    const messages = assembleMessages(events)

    const firstUser = messages.find((m) => m.role === 'user' && isUserMessage(m))
    expect(firstUser).toBeDefined()
    if (firstUser && isUserMessage(firstUser)) {
      expect(firstUser.content).toBe('What files are in the project?')
    }
  })

  it('assistant message has text content', () => {
    const events = makeEvents()
    const messages = assembleMessages(events)

    const assistantMsgs = messages.filter((m) => m.role === 'assistant')
    expect(assistantMsgs.length).toBeGreaterThanOrEqual(1)

    const firstAssistant = assistantMsgs[0]
    expect(isAssistantMessage(firstAssistant)).toBe(true)
    if (isAssistantMessage(firstAssistant)) {
      expect(firstAssistant.content).toBe('Let me check the project structure.')
    }
  })

  it('tool calls are included in assistant message', () => {
    const events = makeEvents()
    const messages = assembleMessages(events)

    const assistantWithToolCalls = messages.filter(
      (m) =>
        m.role === 'assistant' && isAssistantMessage(m) && m.toolCalls && m.toolCalls.length > 0,
    )

    expect(assistantWithToolCalls.length).toBeGreaterThanOrEqual(1)
    const msg = assistantWithToolCalls[0]
    if (isAssistantMessage(msg) && msg.toolCalls) {
      expect(msg.toolCalls[0].toolName).toBe('bash')
      expect(msg.toolCalls[0].args).toEqual({ command: 'ls -la' })
    }
  })

  it('tool results become user messages', () => {
    const events = makeEvents()
    const messages = assembleMessages(events)

    const toolResultMsgs = messages.filter(
      (m) => m.role === 'user' && isUserMessage(m) && m.parts.some((p) => p.type === 'tool_result'),
    )

    expect(toolResultMsgs.length).toBe(1)
  })

  it('handles empty events', () => {
    const messages = assembleMessages([])
    expect(messages).toHaveLength(0)
  })

  it('handles multiple tool calls', () => {
    const events: SessionEvent[] = [
      createEvent('session.created', 's1', { model: 'gpt-4o', cwd: '/tmp' }),
      createEvent('session.message', 's1', { role: 'user', content: 'do two things' }),
      createEvent('session.message', 's1', { role: 'assistant', content: 'sure' }),
      createEvent('session.tool_call', 's1', {
        toolCallId: 'tc-1',
        toolName: 'bash',
        args: { command: 'ls' },
      }),
      createEvent('session.tool_call', 's1', {
        toolCallId: 'tc-2',
        toolName: 'bash',
        args: { command: 'pwd' },
      }),
      createEvent('session.tool_result', 's1', {
        toolCallId: 'tc-1',
        toolName: 'bash',
        result: 'file1.txt',
      }),
      createEvent('session.tool_result', 's1', {
        toolCallId: 'tc-2',
        toolName: 'bash',
        result: '/tmp',
      }),
    ]

    const messages = assembleMessages(events)
    const assistantWithCalls = messages.filter(
      (m) => isAssistantMessage(m) && m.toolCalls && m.toolCalls.length === 2,
    )
    expect(assistantWithCalls.length).toBe(1)
  })

  it('error events become user messages', () => {
    const events: SessionEvent[] = [
      createEvent('session.created', 's1', { model: 'gpt-4o', cwd: '/tmp' }),
      createEvent('session.error', 's1', {
        code: 'FORGE_3001',
        message: 'Rate limit exceeded',
        severity: 'error',
      }),
    ]

    const messages = assembleMessages(events)
    const errorMsg = messages.find((m) => isUserMessage(m) && m.content.includes('FORGE_3001'))
    expect(errorMsg).toBeDefined()
  })
})

describe('hydrateMessages', () => {
  it('projects successive compactions without resurrecting summarized messages', () => {
    const events = [
      createEvent('session.message', 's1', { role: 'user', content: 'old question' }),
      createEvent('session.message', 's1', { role: 'assistant', content: 'old answer' }),
      createEvent('session.message', 's1', { role: 'user', content: 'recent question' }),
      createEvent('session.compaction', 's1', {
        beforeCount: 3, afterCount: 2, summary: 'first summary', tokensSaved: 1,
      }),
      createEvent('session.message', 's1', { role: 'assistant', content: 'recent answer' }),
      createEvent('session.message', 's1', { role: 'user', content: 'latest question' }),
      createEvent('session.compaction', 's1', {
        beforeCount: 4, afterCount: 2, summary: 'second summary', tokensSaved: 1,
      }),
    ]
    const result = hydrateMessages(events, { format: 'openai' })
    expect(result).toHaveLength(2)
    expect(result[0].content).toContain('second summary')
    expect(result[1].content).toBe('latest question')
    expect(JSON.stringify(result)).not.toContain('old question')
    expect(JSON.stringify(result)).not.toContain('first summary')
    expect(assembleMessages(events).some((m) => m.content.includes('old question'))).toBe(true)
  })

  it('does not apply empty failure compaction markers', () => {
    const events = makeEvents()
    const before = hydrateMessages(events, { format: 'openai' })
    events.push(createEvent('session.compaction', 's1', {
      beforeCount: 0, afterCount: 0, summary: '', tokensSaved: 0,
    }))
    expect(hydrateMessages(events, { format: 'openai' })).toEqual(before)
  })

  it('produces Anthropic format', () => {
    const events = makeEvents()
    const result = hydrateMessages(events, { format: 'anthropic' })

    expect(result.length).toBeGreaterThanOrEqual(2)
    expect(result[0].role).toBe('user')
    expect(result[1].role).toBe('assistant')
  })

  it('Anthropic format uses tool_use for tool calls', () => {
    const events = makeEvents()
    const result = hydrateMessages(events, { format: 'anthropic' })

    const assistantWithToolUse = result.filter(
      (m) =>
        m.role === 'assistant' &&
        Array.isArray(m.content) &&
        m.content.some((p: any) => p.type === 'tool_use'),
    )

    expect(assistantWithToolUse.length).toBe(1)
    const content = assistantWithToolUse[0].content as any[]
    const toolUse = content.find((p: any) => p.type === 'tool_use')
    expect(toolUse.name).toBe('bash')
    expect(toolUse.input).toEqual({ command: 'ls -la' })
  })

  it('produces OpenAI format', () => {
    const events = makeEvents()
    const result = hydrateMessages(events, { format: 'openai' })

    expect(result.length).toBeGreaterThanOrEqual(2)
    expect(result[0].role).toBe('user')
  })

  it('OpenAI format uses tool_calls array', () => {
    const events = makeEvents()
    const result = hydrateMessages(events, { format: 'openai' })

    const assistantWithToolCalls = result.filter(
      (m) => m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0,
    )

    expect(assistantWithToolCalls.length).toBe(1)
    const tc = assistantWithToolCalls[0].tool_calls?.[0]
    expect(tc.type).toBe('function')
    expect(tc.function.name).toBe('bash')
    expect(JSON.parse(tc.function.arguments)).toEqual({ command: 'ls -la' })
  })

  it('OpenAI format uses role=tool for tool results', () => {
    const events = makeEvents()
    const result = hydrateMessages(events, { format: 'openai' })

    const toolMessages = result.filter((m) => m.role === 'tool')
    expect(toolMessages.length).toBe(1)
    expect(toolMessages[0].tool_call_id).toBe('tc-1')
  })

  it('produces Google format', () => {
    const events = makeEvents()
    const result = hydrateMessages(events, { format: 'google' })

    expect(result.length).toBeGreaterThanOrEqual(2)
    expect(result[0].role).toBe('user')
  })

  it('Google format uses functionCall', () => {
    const events = makeEvents()
    const result = hydrateMessages(events, { format: 'google' })

    const modelWithFnCall = result.filter(
      (m) =>
        m.role === 'model' &&
        Array.isArray(m.content) &&
        m.content.some((p: any) => p.type === 'functionCall'),
    )

    expect(modelWithFnCall.length).toBe(1)
    const content = modelWithFnCall[0].content as any[]
    const fnCall = content.find((p: any) => p.type === 'functionCall')
    expect(fnCall.functionCall.name).toBe('bash')
    expect(fnCall.functionCall.args).toEqual({ command: 'ls -la' })
  })

  it('Google format uses functionResponse for tool results', () => {
    const events = makeEvents()
    const result = hydrateMessages(events, { format: 'google' })

    const userWithFnResponse = result.filter(
      (m) =>
        m.role === 'user' &&
        Array.isArray(m.content) &&
        m.content.some((p: any) => p.type === 'functionResponse'),
    )

    expect(userWithFnResponse.length).toBe(1)
  })

  it('includes system message when provided', () => {
    const events = makeEvents()
    const result = hydrateMessages(events, {
      format: 'anthropic',
      includeSystem: true,
      systemPrompt: 'You are a helpful coding assistant.',
    })

    expect(result[0].role).toBe('system')
    expect(result[0].content).toBe('You are a helpful coding assistant.')
  })

  it('handles events with no tool calls', () => {
    const events: SessionEvent[] = [
      createEvent('session.created', 's1', { model: 'gpt-4o', cwd: '/tmp' }),
      createEvent('session.message', 's1', { role: 'user', content: 'hello' }),
      createEvent('session.message', 's1', { role: 'assistant', content: 'hi there' }),
    ]

    const anthropic = hydrateMessages(events, { format: 'anthropic' })
    const openai = hydrateMessages(events, { format: 'openai' })
    const google = hydrateMessages(events, { format: 'google' })

    expect(anthropic.length).toBe(2)
    expect(openai.length).toBe(2)
    expect(google.length).toBe(2)

    expect(anthropic[1].role).toBe('assistant')
    expect(openai[1].role).toBe('assistant')
    expect(google[1].role).toBe('model')
  })
})
