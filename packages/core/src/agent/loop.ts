import type { Message } from '../session/message'
import { assembleContext } from './context'
import { applySteering } from './steering'
import type {
  AgentModel,
  AgentRequestMessage,
  AgentTool,
  AgentToolCall,
  AgentToolDefinition,
  AgentUsage,
  AgentUsageChunk,
} from './types'

/**
 * The streaming agent loop — the heart of the system.
 *
 * Each iteration assembles context (system + history + tools), streams the
 * model response (emitting text / thinking / tool-call deltas live), then
 * either finishes (no tool calls) or executes every tool call and feeds the
 * results back for the next iteration. Handles permission checks before tool
 * execution, context-budget overflow, maxIterations, and graceful
 * cancellation.
 */

export type LoopStopReason =
  | 'complete'
  | 'max-iterations'
  | 'cancelled'
  | 'context-overflow'
  | 'error'

export type LoopEvent =
  | { readonly type: 'turn'; readonly turn: number }
  | { readonly type: 'text'; readonly delta: string }
  | { readonly type: 'thinking'; readonly delta: string }
  | {
      readonly type: 'tool-call-delta'
      readonly toolCallId: string
      readonly name?: string
      readonly delta: string
    }
  | { readonly type: 'tool-call'; readonly toolCall: AgentToolCall }
  | {
      readonly type: 'tool-result'
      readonly toolCallId: string
      readonly toolName: string
      readonly error?: string
      readonly durationMs: number
    }
  | { readonly type: 'usage'; readonly usage: AgentUsage }
  | { readonly type: 'finish'; readonly reason: LoopStopReason }
  | { readonly type: 'error'; readonly error: unknown }
  | { readonly type: 'steering-injected'; readonly content: string; readonly turn: number }

export interface AgentLoopOptions {
  model: AgentModel
  /** Conversation history (core Messages; already hydrated). */
  messages: readonly Message[]
  system?: string
  tools?: readonly AgentTool[]
  maxIterations?: number
  abortSignal?: AbortSignal
  /** Return false to withhold permission; the tool then receives a denial result. */
  permissionCheck?: (
    name: string,
    args: Record<string, unknown>,
    tool: AgentTool,
  ) => boolean | Promise<boolean>
  onEvent?: (event: LoopEvent) => void
  /** Optional steering controller for injecting follow-up messages mid-execution. */
  steering?: import('./steering').SteeringController
}

export interface AgentRunResult {
  reason: LoopStopReason
  /** Final assistant text (last model turn that produced no tool calls). */
  response: string
  /** Full conversation, including appended tool-call/tool-result turns. */
  messages: Message[]
  turns: number
  usage: AgentUsage
  error?: unknown
}

interface StreamingTurn {
  text: string
  thinking?: string
  toolCalls: AgentToolCall[]
  usage?: AgentUsageChunk
}

const emptyUsage = (): AgentUsage => ({ input: 0, output: 0, total: 0 })

function addUsage(target: AgentUsage, partial: AgentUsageChunk | undefined): AgentUsage {
  if (!partial) return target
  return {
    input: target.input + partial.input,
    output: target.output + partial.output,
    total: target.total + partial.total,
    cacheRead: (target.cacheRead ?? 0) + (partial.cacheRead ?? 0),
    cacheWrite: (target.cacheWrite ?? 0) + (partial.cacheWrite ?? 0),
  }
}

async function streamTurn(
  options: AgentLoopOptions,
  requestMessages: AgentRequestMessage[],
  toolDefinitions: AgentToolDefinition[],
  outputBudget: number,
  emit: (event: LoopEvent) => void,
): Promise<StreamingTurn> {
  const { model } = options
  const turn: StreamingTurn = { text: '', toolCalls: [] }
  const partials = new Map<string, { name?: string; argsText: string }>()

  for await (const chunk of model.stream({
    messages: requestMessages,
    tools: toolDefinitions,
    system: options.system,
    maxTokens: outputBudget,
    abortSignal: options.abortSignal,
  })) {
    switch (chunk.type) {
      case 'text-delta':
        turn.text += chunk.delta
        emit({ type: 'text', delta: chunk.delta })
        break
      case 'thinking-delta':
        turn.thinking = (turn.thinking ?? '') + chunk.delta
        emit({ type: 'thinking', delta: chunk.delta })
        break
      case 'tool-call':
        turn.toolCalls.push(chunk.toolCall)
        emit({ type: 'tool-call', toolCall: chunk.toolCall })
        break
      case 'tool-call-delta': {
        const id = chunk.toolCallId
        const partial = partials.get(id) ?? { argsText: '' }
        if (chunk.name) partial.name = chunk.name
        partial.argsText += chunk.delta
        partials.set(id, partial)
        emit({ type: 'tool-call-delta', toolCallId: id, name: partial.name, delta: chunk.delta })
        break
      }
      case 'usage':
        turn.usage = chunk.usage
        break
      case 'finish':
        // Finish chunk signals end of this turn - parse partials and return
        for (const [id, partial] of partials) {
          let args: Record<string, unknown> = {}
          try {
            args = partial.argsText.trim() ? JSON.parse(partial.argsText) : {}
          } catch {
            args = { _parseError: 'tool arguments were not valid JSON' }
          }
          const call: AgentToolCall = {
            id,
            name: partial.name ?? 'unknown',
            args,
          }
          turn.toolCalls.push(call)
          emit({ type: 'tool-call', toolCall: call })
        }
        return turn
    }
  }

  return turn
}

export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentRunResult> {
  const { model, onEvent } = options
  const maxIterations = options.maxIterations ?? 50
  const emit = (event: LoopEvent) => onEvent?.(event)

  const contextWindow = model.config.capabilities.contextWindow
  const maxOutput = model.config.capabilities.maxTokens || 4096
  const outputReserve = Math.min(maxOutput, Math.floor(contextWindow / 2))
  const inputBudget = Math.max(0, contextWindow - outputReserve)

  let messages = [...options.messages]
  let usage = emptyUsage()
  let turns = 0
  let response = ''
  let error: unknown
  let reason: LoopStopReason = 'complete'

  const signal = options.abortSignal
  const isAborted = () => signal?.aborted ?? false

  try {
    for (;;) {
      if (isAborted()) {
        reason = 'cancelled'
        break
      }
      if (turns >= maxIterations) {
        reason = 'max-iterations'
        break
      }

      // Apply any pending steering messages before assembling context
      if (options.steering?.hasPending()) {
        messages = applySteering(messages, options.steering, (msg) => {
          emit({ type: 'steering-injected', content: msg.content, turn: turns + 1 })
        })
      }

      const context = assembleContext({
        messages,
        system: options.system,
        tools: options.tools,
        inputBudget,
      })
      if (context.overflow) {
        reason = 'context-overflow'
        break
      }
      messages = context.messages as Message[]

      turns += 1
      emit({ type: 'turn', turn: turns })

      const turn = await streamTurn(
        options,
        [...context.requestMessages] as AgentRequestMessage[],
        [...context.toolDefinitions] as AgentToolDefinition[],
        outputReserve,
        emit,
      )
      response = turn.text
      usage = addUsage(usage, turn.usage)
      emit({ type: 'usage', usage: { ...usage } })

      if (turn.toolCalls.length === 0) {
        break
      }

      // ── Execute tool calls and feed results back ──
      const toolResults: Array<{
        toolCallId: string
        toolName: string
        result: string
        error?: string
        durationMs: number
      }> = []
      for (const call of turn.toolCalls) {
        const tool = (options.tools ?? []).find((t) => t.name === call.name)
        const allowed = tool
          ? !options.permissionCheck || (await options.permissionCheck(call.name, call.args, tool))
          : false
        const start = performance.now()
        let result = ''
        let toolError: string | undefined
        if (!tool) {
          toolError = `unknown tool: ${call.name}`
        } else if (!allowed) {
          toolError = `permission denied by user or policy`
        } else {
          try {
            result = await tool.execute(call.args, signal)
          } catch (err) {
            toolError = err instanceof Error ? err.message : String(err)
          }
        }
        const durationMs = Math.round(performance.now() - start)
        toolResults.push({
          toolCallId: call.id,
          toolName: call.name,
          result,
          error: toolError,
          durationMs,
        })
        emit({
          type: 'tool-result',
          toolCallId: call.id,
          toolName: call.name,
          error: toolError,
          durationMs,
        })
      }

      const toolCallParts = turn.toolCalls.map((tc) => ({
        type: 'tool_call' as const,
        toolCallId: tc.id,
        toolName: tc.name,
        args: tc.args,
      }))
      const assistantMessage: Message = {
        role: 'assistant',
        parts: [
          ...(turn.thinking ? [{ type: 'thinking' as const, thinking: turn.thinking }] : []),
          ...(turn.text ? [{ type: 'text' as const, text: turn.text }] : []),
          ...toolCallParts,
        ],
        content: turn.text,
        toolCalls: toolCallParts,
        ...(turn.thinking ? { thinking: turn.thinking } : {}),
      }

      const resultsContent = toolResults
        .map((tr) => `[${tr.toolName}] ${tr.error ? `Error: ${tr.error}` : tr.result}`)
        .join('\n')

      const userMessage: Message = {
        role: 'user',
        parts: toolResults.map((tr) => ({ type: 'tool_result' as const, ...tr })),
        content: resultsContent,
      }

      messages.push(assistantMessage, userMessage)
    }
  } catch (err) {
    if (isAborted()) {
      reason = 'cancelled'
    } else {
      reason = 'error'
      error = err
      emit({ type: 'error', error: err })
    }
  }

  emit({ type: 'finish', reason })
  return { reason, response, messages, turns, usage, ...(error !== undefined ? { error } : {}) }
}
