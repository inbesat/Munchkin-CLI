/**
 * Skill auto-trigger (Phase 107): load skills into context automatically
 * when the user's request semantically matches a skill's description.
 *
 * "Semantic" here = lightweight offline heuristics (stemmed token overlap +
 * character-trigram Jaccard) — no network, no embedding API. The
 * `embedder` option accepts a real embedding-backed similarity function to
 * upgrade later without changing call sites.
 */
import type { LoadedSkill } from './loader'
import { type LoadSkillsOptions, loadSkills } from './loader'

export interface SemanticScoreOptions {
  /**
   * Pluggable similarity (0..1). Default: max(stemmed-token overlap ratio,
   * character-trigram Jaccard).
   */
  embedder?: (conversation: string, text: string) => number
}

function stem(token: string): string {
  return token.replace(/(ing|ed|es|s)$/, '').replace(/^(the|a|an|to|this|that|it|is|please)$/, '')
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0)
}

function trigrams(text: string): Set<string> {
  const normalized = ` ${text.toLowerCase()} `
  const grams = new Set<string>()
  for (let i = 0; i < normalized.length - 2; i++) {
    grams.add(normalized.slice(i, i + 3))
  }
  return grams
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const item of a) {
    if (b.has(item)) intersection += 1
  }
  return intersection / (a.size + b.size - intersection)
}

/** Lightweight offline semantic similarity in [0, 1]. */
export function semanticSimilarity(conversation: string, text: string): number {
  const convoTokens = tokenize(conversation)
    .map(stem)
    .filter((t) => t.length > 1)
  const textTokens = [...new Set(tokenize(text).map(stem))].filter((t) => t.length > 1)
  let stemOverlap = 0
  for (const token of textTokens) {
    if (convoTokens.includes(token)) stemOverlap += 1
  }
  const stemRatio = textTokens.length === 0 ? 0 : stemOverlap / textTokens.length
  const trigramScore = jaccard(trigrams(conversation), trigrams(text))
  return Math.max(stemRatio, trigramScore)
}

export interface AutoTriggerOptions {
  /** Similarity threshold for auto-loading (default 0.3). */
  minScore?: number
  /** Cap the returned matches (default 3). */
  maxResults?: number
  embedder?: SemanticScoreOptions['embedder']
}

export interface AutoTriggerMatch {
  skill: LoadedSkill
  score: number
  via: 'semantic' | 'trigger'
}

/**
 * Auto-trigger matching: scores each skill's description (and triggers) for
 * semantic similarity against the conversation; returns matches above the
 * threshold, sorted descending, capped at `maxResults`.
 */
export function autoTriggerSkills(
  skills: readonly LoadedSkill[],
  conversation: string,
  options: AutoTriggerOptions = {},
): AutoTriggerMatch[] {
  const minScore = options.minScore ?? 0.3
  const maxResults = options.maxResults ?? 3
  const similarity = options.embedder ?? semanticSimilarity
  const lowerConversation = conversation.toLowerCase()

  const matches: AutoTriggerMatch[] = []
  for (const skill of skills) {
    let score = similarity(conversation, skill.description)
    let via: AutoTriggerMatch['via'] = 'semantic'

    for (const trigger of skill.triggers) {
      // Exact trigger phrases remain the strongest signal.
      if (lowerConversation.includes(trigger.toLowerCase())) {
        score = Math.max(score, 1)
        via = 'trigger'
        break
      }
      score = Math.max(score, similarity(conversation, trigger))
    }

    if (score >= minScore) {
      matches.push({ skill, score: Math.min(1, score), via })
    }
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, maxResults)
}

/** Convenience: Phase-106 load + Phase-107 auto-trigger in one call. */
export async function loadAndAutoTrigger(
  options: LoadSkillsOptions,
  conversation: string,
  triggerOptions: AutoTriggerOptions = {},
): Promise<AutoTriggerMatch[]> {
  const { skills } = loadSkills(options)
  return autoTriggerSkills(skills, conversation, triggerOptions)
}
