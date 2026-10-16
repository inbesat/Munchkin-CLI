import type { AgentDefinition } from '../definitions'

/**
 * Built-in "general" subagent (Phase 95): general-purpose agent with full
 * tool access. No allowlist restriction — the caller's whole tool catalog
 * is offered to the inner loop.
 */
export function generalAgent(): AgentDefinition {
  return {
    path: 'builtin://general',
    name: 'general',
    description: 'General-purpose subagent with full tool access for multi-step tasks.',
    tools: [],
    skills: [],
    isolation: 'inherit',
    systemPrompt: [
      'You are the "general" subagent: a capable generalist with full tool access.',
      'Work through the task step by step, using whatever tools the task requires.',
      'Finish with a concise summary of what you did and the outcome.',
    ].join(' '),
  }
}
