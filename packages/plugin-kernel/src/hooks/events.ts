/** Hook system event type definitions (Phase 103). */

/**
 * Every lifecycle event the hook engine can fire. The eleven blueprint-named
 * events come first; the remainder extend coverage across the agent loop,
 * permissions, compaction, teams, and session lifecycle (Phase 103: ~30 total).
 */
export const LIFECYCLE_EVENTS = [
  // Blueprint-named core lifecycle events
  'SessionStart',
  'SessionEnd',
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'Stop',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'PostCompact',
  // Agent loop + conversation
  'AssistantResponse',
  'ConversationTurn',
  'SteeringInjected',
  'GoalSet',
  'GoalCleared',
  'GoalMet',
  // Tools
  'ToolError',
  'ToolPermissionDenied',
  'ToolPermissionGranted',
  // Permissions
  'PermissionRequested',
  'PermissionPromptShown',
  'PermissionModeChanged',
  // Compaction + context
  'ContextWarning',
  'ContextOverflow',
  'ContextBudgetChanged',
  // Subagents + orchestration
  'SubagentCompleted',
  'SubagentFailed',
  'TeamTaskDelegated',
  'TeamTaskCompleted',
  'BackgroundTaskStarted',
  'BackgroundTaskFinished',
  // Cross-harness
  'CrossHarnessDelegated',
  'CrossHarnessCompleted',
] as const

export type HookEventName = (typeof LIFECYCLE_EVENTS)[number]

/** Payloads for the blueprint-named events; others pass opaque records. */
export interface HookEventPayloads {
  SessionStart: { sessionId: string; model?: string }
  SessionEnd: { sessionId: string; reason?: string }
  PreToolUse: { toolName: string; args?: Record<string, unknown> }
  PostToolUse: { toolName: string; result?: string; durationMs?: number }
  UserPromptSubmit: { prompt: string }
  Stop: { reason?: string }
  SubagentStart: { name: string; task?: string }
  SubagentStop: { name: string; summary?: string }
  PreCompact: { beforeTokens: number }
  PostCompact: { afterTokens: number; tokensSaved?: number }
}

/** Payload for any event not in the typed set above. */
export type GenericHookPayload = Record<string, unknown>
