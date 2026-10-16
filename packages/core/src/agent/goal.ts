import { runAgentLoop } from './loop'
import type { AgentModel, AgentTool } from './types'

/**
 * Goal mode (Phase 101): the agent keeps working across multiple agent-loop
 * runs until a completion condition is met. `/goal <condition>` sets the
 * goal; `/goal clear` stops the autonomous loop (aborting an in-flight run).
 */

const GOAL_MET_SENTINEL = '[GOAL_MET]'
const DEFAULT_MAX_GOAL_ROUNDS = 10

let activeDescription: string | null = null
let activeRunController: AbortController | null = null

/** Set the active goal (TUI `/goal <condition>`). */
export function setGoal(description: string): void {
  activeDescription = description
}

/** Clear the goal and abort an in-flight goal loop (TUI `/goal clear`). */
export function clearGoal(): void {
  activeDescription = null
  activeRunController?.abort()
  activeRunController = null
}

/** Whether a goal is currently active. */
export function goalIsActive(): boolean {
  return activeDescription !== null
}

/** Current goal description, or null when unset/cleared. */
export function currentGoal(): string | null {
  return activeDescription
}

export interface GoalLoopOptions {
  model: AgentModel
  task: string
  system?: string
  tools?: readonly AgentTool[]
  /** Cap on autonomous rounds (default 10). */
  maxGoalRounds?: number
  abortSignal?: AbortSignal
  /** Override completion detection; default looks for the `[GOAL_MET]` sentinel. */
  isComplete?: (response: string) => boolean
  maxIterations?: number
  onRound?: (round: number, response: string) => void
}

export interface GoalResult {
  goalMet: boolean
  rounds: number
  summary: string
  stopReason: 'goal-met' | 'max-rounds' | 'aborted'
}

function defaultDetector(response: string): boolean {
  return response.includes(GOAL_MET_SENTINEL)
}

/**
 * Run the agent loop repeatedly until the goal is met (default: the final
 * response contains `[GOAL_MET]`), the round cap is hit, or an abort fires.
 */
export async function runGoalLoop(options: GoalLoopOptions): Promise<GoalResult> {
  if (options.abortSignal?.aborted) {
    return { goalMet: false, rounds: 0, summary: '', stopReason: 'aborted' }
  }

  const maxRounds = options.maxGoalRounds ?? DEFAULT_MAX_GOAL_ROUNDS
  const isComplete = options.isComplete ?? defaultDetector
  const controller = new AbortController()
  const signal = options.abortSignal
    ? AbortSignal.any([options.abortSignal, controller.signal])
    : controller.signal
  activeRunController = controller

  const transcript: string[] = []
  let priorWork = ''

  try {
    for (let round = 1; round <= maxRounds; round++) {
      const continuation =
        priorWork.length > 0
          ? `${options.task}\n\nGoal: it is not yet met. Progress so far:\n${priorWork}\n\nContinue working. When the goal is fully achieved, end your final message with ${GOAL_MET_SENTINEL}.`
          : `${options.task}\n\nWhen the goal is fully achieved, end your final message with ${GOAL_MET_SENTINEL}. Until then, keep working and describe progress in your final message.`

      const run = await runAgentLoop({
        model: options.model,
        system: options.system,
        messages: [
          { role: 'user', parts: [{ type: 'text', text: continuation }], content: continuation },
        ],
        tools: options.tools,
        maxIterations: options.maxIterations,
        abortSignal: signal,
      })
      transcript.push(run.response)
      priorWork = transcript.join('\n')
      options.onRound?.(round, run.response)

      if (isComplete(run.response)) {
        return { goalMet: true, rounds: round, summary: run.response, stopReason: 'goal-met' }
      }
      if (signal.aborted) {
        return { goalMet: false, rounds: round, summary: run.response, stopReason: 'aborted' }
      }
    }

    return {
      goalMet: false,
      rounds: maxRounds,
      summary: transcript.at(-1) ?? '',
      stopReason: 'max-rounds',
    }
  } finally {
    if (activeRunController === controller) activeRunController = null
  }
}
