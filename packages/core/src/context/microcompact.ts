import { toRequestMessages } from '../agent/context'
import type { SessionEvent } from '../events'
import { assembleContextMessages } from '../session/hydration'
import type { Message, ToolResultPart } from '../session/message'

export interface MicrocompactOptions {
  maxToolResultsToKeep?: number
  summarizeToolResults?: boolean
  summaryPrefix?: string
}

export interface MicrocompactResult {
  success: boolean
  messagesRemoved: number
  tokensSaved: number
  message: string
  /** Effective context, not a rewrite of the session's append-only events. */
  messages: Message[]
}

export interface ToolResultSummary {
  toolCallId: string
  toolName: string
  summary: string
  originalLength: number
  summarizedLength: number
}

const DEFAULT_SUMMARY_PREFIX = '[Tool Result Summary]'

export class Microcompactor {
  private options: Required<MicrocompactOptions>

  constructor(options: MicrocompactOptions = {}) {
    this.options = {
      maxToolResultsToKeep: 10,
      summarizeToolResults: true,
      summaryPrefix: DEFAULT_SUMMARY_PREFIX,
      ...options,
    }
    this.validateOptions(this.options)
  }

  shouldMicrocompact(events: SessionEvent[]): boolean {
    return this.projectMessages(assembleContextMessages(events)).messagesRemoved > 0
  }

  async microcompact(events: SessionEvent[]): Promise<MicrocompactResult> {
    return this.microcompactMessages(assembleContextMessages(events))
  }

  async microcompactMessages(messages: readonly Message[]): Promise<MicrocompactResult> {
    const result = this.projectMessages(messages)
    const success = result.messagesRemoved > 0
    return {
      ...result,
      success,
      message: success
        ? `Microcompact complete. ${result.messagesRemoved} tool result messages processed. Tokens saved: ${result.tokensSaved.toLocaleString()}`
        : 'Microcompact not needed. No older tool results can be reduced.',
    }
  }

  private projectMessages(
    messages: readonly Message[],
  ): Omit<MicrocompactResult, 'success' | 'message'> {
    const count = messages.reduce(
      (total, message) =>
        total +
        (message.role === 'user'
          ? message.parts.filter((p) => p.type === 'tool_result').length
          : 0),
      0,
    )
    const eligible = Math.max(0, count - this.options.maxToolResultsToKeep)
    let seen = 0
    let messagesRemoved = 0
    const projected = messages.map((message): Message => {
      if (message.role !== 'user') return message
      let changed = false
      const parts = message.parts.map((part) => {
        if (part.type !== 'tool_result' || seen++ >= eligible) return part
        const result = this.summarizeResult(part)
        if (result === part) return part
        changed = true
        return result
      })
      if (!changed) return message
      messagesRemoved++
      const content = parts
        .map((part) => (part.type === 'text' ? part.text : JSON.stringify(part.result)))
        .join('\n')
      return { ...message, parts, content }
    })
    const tokens = (items: readonly Message[]) =>
      Math.ceil(JSON.stringify(toRequestMessages(items)).length / 4)
    return {
      messages: projected,
      messagesRemoved,
      tokensSaved: Math.max(0, tokens(messages) - tokens(projected)),
    }
  }

  private summarizeResult(part: ToolResultPart): ToolResultPart {
    const text = JSON.stringify(part.result) ?? 'null'
    if (
      text.length <= 500 ||
      (typeof part.result === 'string' && part.result.startsWith(this.options.summaryPrefix))
    )
      return part
    const prefix = `${this.options.summaryPrefix} ${part.toolName}: `
    const summary = this.options.summarizeToolResults
      ? `${prefix}${text.slice(0, 350)}... [truncated, ${text.length} chars total]`
      : `${prefix}[omitted, ${text.length} chars total]`
    if (JSON.stringify(summary).length >= text.length) return part
    // Keep the result envelope and IDs even when verbose output is omitted.
    return { ...part, result: summary }
  }

  getOptions(): MicrocompactOptions {
    return { ...this.options }
  }

  updateOptions(options: Partial<MicrocompactOptions>): void {
    const next = { ...this.options, ...options }
    this.validateOptions(next)
    this.options = next
  }

  private validateOptions(options: Required<MicrocompactOptions>): void {
    if (!Number.isSafeInteger(options.maxToolResultsToKeep) || options.maxToolResultsToKeep < 0) {
      throw new RangeError('maxToolResultsToKeep must be a nonnegative integer')
    }
    if (
      typeof options.summarizeToolResults !== 'boolean' ||
      typeof options.summaryPrefix !== 'string' ||
      !options.summaryPrefix.trim()
    )
      throw new TypeError('Invalid microcompact options')
  }
}

export function createMicrocompactor(options: MicrocompactOptions = {}): Microcompactor {
  return new Microcompactor(options)
}

export async function microcompactIfNeeded(
  microcompactor: Microcompactor,
  events: SessionEvent[],
): Promise<MicrocompactResult | null> {
  return microcompactor.shouldMicrocompact(events) ? microcompactor.microcompact(events) : null
}
