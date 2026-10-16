/**
 * Skill matching (Phase 106): deterministic matching of skills to a
 * conversation by triggers and description keywords. (Phase 107 layers
 * semantic auto-triggering on top of this.)
 */

import type { LoadedSkill } from './loader'

export interface SkillMatch {
  skill: LoadedSkill
  score: number
  /** Which signals matched (triggers / description keywords). */
  via: Array<'trigger' | 'description'>
}

const TRIGGER_WEIGHT = 2
const DESCRIPTION_WEIGHT = 1

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter((token) => token.length > 2)
}

/**
 * Rank skills against a conversation. A skill matches when a trigger phrase
 * appears in the conversation or enough description keywords overlap.
 * Returns matches sorted by score (descending).
 */
export function matchSkills(
  skills: readonly LoadedSkill[],
  conversation: string,
  options: { minScore?: number } = {},
): SkillMatch[] {
  const minScore = options.minScore ?? 1
  const haystack = conversation.toLowerCase()

  const matches: SkillMatch[] = []
  for (const skill of skills) {
    let score = 0
    const via: SkillMatch['via'] = []

    for (const trigger of skill.triggers) {
      if (haystack.includes(trigger.toLowerCase())) {
        score += TRIGGER_WEIGHT
        if (!via.includes('trigger')) via.push('trigger')
      }
    }

    const conversationTokens = new Set(tokenize(conversation))
    const descriptionTokens = tokenize(skill.description)
    if (descriptionTokens.length > 0) {
      const overlap = descriptionTokens.filter((token) => conversationTokens.has(token)).length
      if (overlap / descriptionTokens.length >= 0.5 && overlap >= 2) {
        score += DESCRIPTION_WEIGHT * overlap
        if (!via.includes('description')) via.push('description')
      }
    }

    if (score >= minScore) matches.push({ skill, score, via })
  }

  return matches.sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name))
}

/** Manual `/skill-name` invocation; accepts an optional leading slash. */
export function invokeSkill(skills: readonly LoadedSkill[], name: string): LoadedSkill | undefined {
  const normalized = name.startsWith('/') ? name.slice(1) : name
  return skills.find((skill) => skill.name === normalized)
}

/** One prompt reminder line per skill, for system-prompt assembly. */
export function reminderLine(skill: LoadedSkill): string {
  const triggers = skill.triggers.length > 0 ? ` (triggers: ${skill.triggers.join(', ')})` : ''
  return `- /${skill.name}: ${skill.description}${triggers}`
}
