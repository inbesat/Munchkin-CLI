import type { Message, UserMessage } from '../session/message'

/** A steering message to inject into the agent loop. */
export interface SteeringMessage {
  /** The message content. */
  content: string
  /** Optional metadata for the steering message. */
  metadata?: Record<string, unknown>
}

/** Steering controller — manages pending steering messages for an agent loop. */
export class SteeringController {
  private pending: SteeringMessage[] = []
  private closed = false

  /** Add a steering message to be injected on the next loop iteration. */
  push(message: SteeringMessage): void {
    if (this.closed) {
      throw new Error('Steering controller is closed')
    }
    this.pending.push(message)
  }

  /** Take all pending steering messages and clear the queue. */
  takeAll(): SteeringMessage[] {
    const messages = [...this.pending]
    this.pending = []
    return messages
  }

  /** Check if there are pending steering messages. */
  hasPending(): boolean {
    return this.pending.length > 0
  }

  /** Number of pending steering messages. */
  get pendingCount(): number {
    return this.pending.length
  }

  /** Close the controller, preventing further pushes. */
  close(): void {
    this.closed = true
  }

  /** Check if the controller is closed. */
  isClosed(): boolean {
    return this.closed
  }
}

/** Convert a steering message to a core UserMessage. */
export function steeringToMessage(steering: SteeringMessage): UserMessage {
  return {
    role: 'user',
    parts: [{ type: 'text', text: steering.content }],
    content: steering.content,
  }
}

/** Options for running the agent loop with steering. */
export interface SteeringAgentLoopOptions {
  /** The steering controller instance. */
  steering: SteeringController
  /** Called when a steering message is injected. */
  onSteeringInjected?: (message: SteeringMessage) => void
}

/** Apply pending steering messages to the message history. */
export function applySteering(
  messages: readonly Message[],
  steering: SteeringController,
  onInjected?: (message: SteeringMessage) => void,
): Message[] {
  const pending = steering.takeAll()
  if (pending.length === 0) return [...messages]

  const result: Message[] = [...messages]
  for (const steeringMsg of pending) {
    const msg = steeringToMessage(steeringMsg)
    result.push(msg)
    onInjected?.(steeringMsg)
  }
  return result
}