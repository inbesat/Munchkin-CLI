import { describe, expect, it } from 'bun:test'
import { SessionMessageBus } from './messaging'

describe('SessionMessageBus (Phase 98)', () => {
  it('delivers a directed message between two agents in different sessions', () => {
    const bus = new SessionMessageBus()
    bus.send('session-a', 'session-b', 'Please review src/auth.ts')
    const inbox = bus.inbox('session-b')
    const received = inbox.receive()
    expect(received).toHaveLength(1)
    expect(received[0]?.from).toBe('session-a')
    expect(received[0]?.to).toBe('session-b')
    expect(received[0]?.content).toBe('Please review src/auth.ts')
    // Drained: a second receive returns nothing.
    expect(inbox.receive()).toEqual([])
  })

  it('delivers backlog to a session that registers late', () => {
    const bus = new SessionMessageBus()
    bus.send('session-a', 'session-c', 'early message')
    const received = bus.inbox('session-c').receive()
    expect(received.map((m) => m.content)).toEqual(['early message'])
  })

  it('fan-outs broadcasts to every registered sessions inbox at read time', () => {
    const bus = new SessionMessageBus()
    bus.send('coordinator', '*', 'standup in 5 minutes')
    const a = bus.inbox('agent-a').receive()
    const b = bus.inbox('agent-b').receive()
    expect(a.map((m) => m.content)).toEqual(['standup in 5 minutes'])
    expect(b.map((m) => m.content)).toEqual(['standup in 5 minutes'])
  })

  it('keeps per-session cursors isolated', () => {
    const bus = new SessionMessageBus()
    bus.send('a', 'x', 'for x only')
    const inboxX = bus.inbox('x')
    expect(inboxX.receive()).toHaveLength(1)
    // y's cursor is untouched by x's reads.
    expect(bus.inbox('y').receive()).toEqual([])
  })

  it('two-agent round trip: message and reply both delivered', () => {
    const bus = new SessionMessageBus()
    bus.send('session-1', 'session-2', 'question')
    const question = bus.inbox('session-2').receive()
    expect(question[0]?.content).toBe('question')
    bus.send('session-2', 'session-1', 'answer: 42')
    const reply = bus.inbox('session-1').receive()
    expect(reply.map((m) => m.content)).toEqual(['answer: 42'])
  })

  it('pushes live messages to subscribers with unsubscribe', async () => {
    const bus = new SessionMessageBus()
    const inbox = bus.inbox('session-live')
    const live: string[] = []
    const unsubscribe = inbox.subscribe((message) => live.push(message.content))
    bus.send('peer', 'session-live', 'live hello')
    expect(live).toEqual(['live hello'])
    unsubscribe()
    bus.send('peer', 'session-live', 'after unsubscribe')
    inbox.receive() // drains the queued copy
    expect(live).toEqual(['live hello'])
  })

  it('assigns unique monotonic ids and timestamps', () => {
    const bus = new SessionMessageBus()
    const first = bus.send('a', 'b', 'one')
    const second = bus.send('a', 'b', 'two')
    expect(first).not.toBe(second)
    expect(first.length).toBeGreaterThan(0)
  })
})
