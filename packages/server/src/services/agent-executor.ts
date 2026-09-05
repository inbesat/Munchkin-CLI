import {
  runAgentLoop,
  createEvent,
  SessionLog,
  Logger,
  getLogger,
} from '@forge/core'
import type {
  LoopEvent,
  LoopStopReason,
  AgentLoopOptions,
  AgentRunResult,
  AgentTool,
  Message,
} from '@forge/core'
import { ModelResolver } from './model-resolver'
import { SSEBridge } from '../sse/bridge'

export interface AgentExecutorOptions {
  baseDir: string
  modelResolver: ModelResolver
  tools?: AgentTool[]
  eventSink?: SSEBridge
  logger?: Logger
}

/**
 * Runs the streaming agent loop for a session and persists every loop event back
 * into the session's append-only event log. The loop model and tool set are
 * injected so the executor can be tested without real providers.
 */
export class AgentExecutor {
  private baseDir: string
  private modelResolver: ModelResolver
  private tools: AgentTool[]
  private eventSink?: SSEBridge
  private log: Logger

  constructor(options: AgentExecutorOptions) {
    this.baseDir = options.baseDir
    this.modelResolver = options.modelResolver
    this.tools = options.tools ?? []
    this.eventSink = options.eventSink
    this.log = options.logger ?? getLogger()
  }

  async executePrompt(
    sessionId: string,
    prompt: string,
    options: {
      modelId?: string
      systemPrompt?: string
      tools?: string[]
      maxIterations?: number
      abortSignal?: AbortSignal
    },
    onEvent?: (event: LoopEvent) => void,
  ): Promise<AgentRunResult> {
    const log = new SessionLog(this.baseDir, sessionId)
    if (!(await log.exists())) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const history = await this.loadMessages(log)
    const userMessage: Message = {
      role: 'user',
      content: prompt,
      parts: [{ type: 'text', text: prompt }],
    }
    history.push(userMessage)

    await log.append(createEvent('session.message', sessionId, { role: 'user', content: prompt }))

    const model = await this.modelResolver(options.modelId ?? 'auto')
    const toolSet = this.selectTools(options.tools)

    const loopOptions: AgentLoopOptions = {
      model,
      messages: history,
      system: options.systemPrompt,
      tools: toolSet,
      maxIterations: options.maxIterations ?? 20,
      abortSignal: options.abortSignal,
      permissionCheck: async () => true,
      onEvent: (event) => {
        this.handleLoopEvent(sessionId, event)
        onEvent?.(event)
      },
    }

    this.log.info('Starting agent loop', { sessionId, model: model.id, promptLength: prompt.length })

    const result = await runAgentLoop(loopOptions)
    await this.persistResult(sessionId, result)

    return result
  }

  private async loadMessages(log: SessionLog): Promise<Message[]> {
    const messages: Message[] = []
    for await (const event of log.iterate()) {
      if (event.type === 'session.message') {
        const p = event.payload as { role: 'user' | 'assistant'; content: string }
        messages.push({
          role: p.role,
          content: p.content,
          parts: [{ type: 'text', text: p.content }],
        })
      }
    }
    return messages
  }

  private selectTools(names?: string[]): AgentTool[] {
    if (!names || names.length === 0) return this.tools
    return this.tools.filter((t) => names.includes(t.name))
  }

  private handleLoopEvent(sessionId: string, event: LoopEvent): void {
    this.eventSink?.emitLoopEvent(sessionId, event)
  }

  private async persistResult(
    sessionId: string,
    result: AgentRunResult,
  ): Promise<void> {
    const log = new SessionLog(this.baseDir, sessionId)
    const text = result.response
    const usage = result.usage

    const messageEvent = createEvent('session.message', sessionId, {
      role: 'assistant',
      content: text,
      tokens: { input: usage.input, output: usage.output },
    })
    await log.append(messageEvent)

    if (result.reason !== 'complete') {
      await log.append(
        createEvent('session.ended', sessionId, {
          reason: mapReason(result.reason),
          totalTokens: { input: usage.input, output: usage.output },
          totalCost: usage.total / 1_000_000,
        }),
      )
    }

    this.log.info('Agent loop finished', { sessionId, turns: result.turns, reason: result.reason })
  }
}

function mapReason(reason: LoopStopReason): 'user' | 'error' | 'max_iterations' | 'compaction' {
  switch (reason) {
    case 'max-iterations':
      return 'max_iterations'
    case 'error':
      return 'error'
    case 'cancelled':
      return 'user'
    default:
      return 'error'
  }
}

export function createAgentExecutor(options: AgentExecutorOptions): AgentExecutor {
  return new AgentExecutor(options)
}
