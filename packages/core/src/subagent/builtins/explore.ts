import type { AgentDefinition } from '../definitions'

/**
 * Built-in "explore" subagent (Phase 95): fast, read-only codebase search.
 * Ships with forge — no user configuration required.
 */
export function exploreAgent(): AgentDefinition {
  return {
    path: 'builtin://explore',
    name: 'explore',
    description: 'Fast read-only codebase search; finds code, files, and definitions.',
    tools: ['read', 'glob', 'grep'],
    skills: [],
    isolation: 'inherit',
    systemPrompt: [
      'You are the "explore" subagent: a fast, READ-ONLY codebase search specialist.',
      'Your tools are limited to read/glob/grep — you cannot modify anything.',
      'Find code, files, and definitions relevant to the task, then report:',
      'the exact file paths and line references you found, and a one-line',
      'summary of what each contains. Be terse and factual; never speculate',
      'about code you did not open.',
    ].join(' '),
  }
}
