import { type AgentLoopOptions, type LoopStopReason, runAgentLoop } from '../agent/loop'
import type { AgentModel, AgentTool, AgentUsage } from '../agent/types'
import type { Message } from '../session/message'

/**
 * Subagent spawning (Phase 93): run the Phase-33 agent loop in complete
 * isolation — its own context window, system prompt, and tool allowlist —
 * and hand back a single summary message for the parent.
 */

export interface SpawnSubagentOptions {
  model: AgentModel
  /** The subagent's task; becomes its only user message. */
  task: string
  /** Isolated system prompt (the parent's prompt is never inherited). */
  systemPrompt?: string
  /** Full candidate tool set; narrowed by `allowedTools` when provided. */
  tools?: readonly AgentTool[]
  /** Allowlist of tool names the subagent may use. Default: all provided tools. */
  allowedTools?: readonly string[]
  maxIterations?: number
  timeoutMs?: number
  abortSignal?: AbortSignal
  onEvent?: AgentLoopOptions['onEvent']
}

export interface SubagentRunResult {
  /** Single summary message returned to the parent. */
  summary: string
  stopReason: LoopStopReason
  turns: number
  usage: AgentUsage
  /** Child transcript (isolated; parent messages are absent by construction). */
  messages: readonly Message[]
  error?: unknown
}

const DEFAULT_SUBAGENT_SYSTEM = [
  'You are a focused subagent inside the forge CLI.',
  'Complete exactly the task given; never ask follow-up questions.',
  'Summarize the outcome concisely in your final message.',
].join(' ')

const DEFAULT_MAX_ITERATIONS = 25
const DEFAULT_TIMEOUT_MS = 300_000

/** Spawn an isolated subagent run. Never throws for run failures: failures
 * surface in `stopReason: 'error'` + `error` on the result. */
export async function spawnSubagent(options: SpawnSubagentOptions): Promise<SubagentRunResult> {
  const { tools = [], allowedTools, timeoutMs = DEFAULT_TIMEOUT_MS } = options

  const allowlist = allowedTools
  const childTools = allowlist ? tools.filter((tool) => allowlist.includes(tool.name)) : tools

  const messages = buildInitialMessages(options.task)

  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(new Error('subagent timeout')),
    Math.max(1, timeoutMs),
  )
  const external = options.abortSignal
  const signal =
    external !== undefined ? AbortSignal.any([external, controller.signal]) : controller.signal

  // Tool executes must not outlive the spawn: a hung tool promise would
  // deadlock the loop even after the timeout aborts (stress-suite finding).
  const armedTools: AgentTool[] = childTools.map((tool) => ({
    ...tool,
    execute: async (args: Record<string, unknown>, toolSignal?: AbortSignal): Promise<string> => {
      if (controller.signal.aborted) {
        throw new Error('tool execution aborted: subagent timed out')
      }
      return Promise.race([
        tool.execute(args, toolSignal),
        new Promise<string>((_resolve, reject) => {
          controller.signal.addEventListener(
            'abort',
            () => reject(new Error('tool execution aborted: subagent timed out')),
            { once: true },
          )
        }),
      ])
    },
  }))

  try {
    const runPromise = runAgentLoop({
      model: options.model,
      system: options.systemPrompt ?? DEFAULT_SUBAGENT_SYSTEM,
      messages,
      tools: armedTools,
      maxIterations: options.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      abortSignal: signal,
      onEvent: options.onEvent,
    })
    // The loop honors `signal`, but a model may ignore it — the timeout must
    // still terminate the spawn regardless (stress-suite finding, Phase 102).
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(new Error('subagent timed out')), {
        once: true,
      })
    })
    const run = await Promise.race([runPromise, timeoutPromise])
    return {
      summary: run.response,
      stopReason: run.reason,
      turns: run.turns,
      usage: run.usage,
      messages: run.messages,
      error: run.error,
    }
  } catch (error) {
    return {
      summary: '',
      stopReason: 'error',
      turns: 0,
      usage: { input: 0, output: 0, total: 0 },
      messages: [],
      error,
    }
  } finally {
    clearTimeout(timeout)
  }
}

function buildInitialMessages(task: string): readonly Message[] {
  return [{ role: 'user', parts: [{ type: 'text', text: task }], content: task }]
}
