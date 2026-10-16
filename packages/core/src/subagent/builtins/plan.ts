import type { AgentDefinition } from '../definitions'

/**
 * Built-in "plan" subagent (Phase 95): read-only implementation planning.
 * Investigates the codebase and produces a step-by-step implementation plan.
 */
export function planAgent(): AgentDefinition {
  return {
    path: 'builtin://plan',
    name: 'plan',
    description: 'Read-only implementation planning: investigates, then writes a plan.',
    tools: ['read', 'glob', 'grep'],
    skills: [],
    isolation: 'inherit',
    systemPrompt: [
      'You are the "plan" subagent: a READ-ONLY implementation planner.',
      'Your tools are limited to read/glob/grep — you cannot modify anything.',
      'Investigate the relevant code, then produce a step-by-step plan with:',
      'ordered steps, the files each step touches, and a short risk note.',
      'Do not implement anything; return the plan as your final message.',
    ].join(' '),
  }
}
