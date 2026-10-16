import type { LoopEvent } from '@forge/core'
import type { SSEHub } from '../services/sse-hub'

/**
 * Translates raw agent-loop events into typed, named SSE events and fans them out
 * through the {@link SSEHub}. This is the "bridge" between the streaming agent loop
 * and every connected SSE client (TUI, web, IDE). Each loop event becomes one or
 * more SSE `event:` frames keyed by type so clients can subscribe selectively.
 */
export class SSEBridge {
  constructor(private hub: SSEHub) {}

  /** Translate a raw agent-loop event into typed SSE frames and broadcast them. */
  emitLoopEvent(sessionId: string, event: LoopEvent): void {
    switch (event.type) {
      case 'text':
        this.hub.broadcast('text_delta', { sessionId, delta: event.delta }, sessionId)
        break
      case 'thinking':
        this.hub.broadcast('thinking_delta', { sessionId, delta: event.delta }, sessionId)
        break
      case 'tool-call':
        this.hub.broadcast('tool_call', { sessionId, toolCall: event.toolCall }, sessionId)
        break
      case 'tool-call-delta':
        this.hub.broadcast(
          'tool_call_delta',
          { sessionId, toolCallId: event.toolCallId, name: event.name, delta: event.delta },
          sessionId,
        )
        break
      case 'tool-result':
        this.hub.broadcast(
          'tool_result',
          {
            sessionId,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            error: event.error,
            durationMs: event.durationMs,
          },
          sessionId,
        )
        break
      case 'turn':
        this.hub.broadcast('turn', { sessionId, turn: event.turn }, sessionId)
        break
      case 'usage':
        this.hub.broadcast('usage', { sessionId, usage: event.usage }, sessionId)
        break
      case 'finish':
        this.hub.broadcast('agent_done', { sessionId, reason: event.reason }, sessionId)
        break
      case 'error':
        this.hub.broadcast('agent_error', { sessionId, error: String(event.error) }, sessionId)
        break
      case 'steering-injected':
        this.hub.broadcast(
          'steering',
          { sessionId, content: event.content, turn: event.turn },
          sessionId,
        )
        break
    }
  }

  /** Direct broadcast passthrough (lifecycle events, /broadcast route). */
  broadcast(
    event: string,
    data: unknown,
    sessionId?: string,
  ): { delivered: number; failed: number; sessionId?: string } {
    return this.hub.broadcast(event, data, sessionId)
  }

  stats() {
    return this.hub.stats()
  }
}
