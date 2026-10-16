/**
 * System prompt assembly pipeline (Phase 87). Composes the final system
 * prompt from ordered, priority-ranked sections: base instructions, project
 * memory, active skills, tool schemas, MCP tool schemas, runtime context.
 * When a token budget is given, lower-priority sections are truncated (if
 * they opted in) or dropped to keep the assembled prompt inside budget.
 */

export interface PromptSection {
  /** Stable identifier, e.g. 'base' | 'memory' | 'skills'. */
  id: string
  /** Body text; empty/whitespace-only sections are excluded. */
  content: string
  /** Ascending priority: lower composes earlier. */
  priority: number
  /** Allow truncation under budget pressure. Default: true. */
  truncate: boolean
  /** Smallest truncated size worth keeping; smaller sections are dropped. Default: 200 chars. */
  minChars: number
}

export type PromptSectionInput = {
  id: string
  content: string
  priority?: number
  truncate?: boolean
  minChars?: number
}

export interface ComposedSection {
  id: string
  priority: number
  included: boolean
  truncated: boolean
  content: string
  estimatedTokens: number
}

export interface ComposedPrompt {
  prompt: string
  sections: readonly ComposedSection[]
  estimatedTokens: number
}

const DEFAULT_PRIORITY = 300
const DEFAULT_MIN_CHARS = 200
/** ~4 chars/token, matching ContextBudgeter's CharTokenCounter. */
const CHARS_PER_TOKEN = 4
/** Header lines are wrapped around each section body. */
const HEADER_BUDGET_CHARS = 16

/** Build a section with pipeline defaults applied. */
export function section(
  id: string,
  content: string,
  opts: Partial<Omit<PromptSectionInput, 'id' | 'content'>> = {},
): PromptSection {
  return {
    id,
    content,
    priority: opts.priority ?? DEFAULT_PRIORITY,
    truncate: opts.truncate ?? true,
    minChars: opts.minChars ?? DEFAULT_MIN_CHARS,
  }
}

/** Estimate tokens for a string (chars/4, consistent with CharTokenCounter). */
export function estimateSectionTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/** Stable sort by ascending priority; equal priorities keep input order. */
export function applySectionOrder(sections: readonly PromptSection[]): PromptSection[] {
  return [...sections]
    .map((s, index) => ({ s, index }))
    .sort((a, b) => a.s.priority - b.s.priority || a.index - b.index)
    .map(({ s }) => s)
}

/**
 * Compose the system prompt. Sections are ordered by priority; when
 * `options.budgetTokens` is set, lower-priority sections are truncated
 * (if eligible) or dropped so the whole prompt fits the budget.
 */
export function composeSystemPrompt(
  input: readonly PromptSectionInput[],
  options: { budgetTokens?: number } = {},
): ComposedPrompt {
  const budgetChars =
    options.budgetTokens === undefined
      ? Number.POSITIVE_INFINITY
      : options.budgetTokens * CHARS_PER_TOKEN
  const ordered = applySectionOrder(
    input.map((s) => (isFullSection(s) ? s : section(s.id, s.content, s))),
  )

  let used = 0
  const composed: ComposedSection[] = []

  for (const s of ordered) {
    const body = s.content.trim()
    if (body.length === 0) {
      composed.push({
        id: s.id,
        priority: s.priority,
        included: false,
        truncated: false,
        content: '',
        estimatedTokens: 0,
      })
      continue
    }

    const remaining = budgetChars - used
    let effective = body
    let truncated = false

    if (remaining <= 0) {
      composed.push({
        id: s.id,
        priority: s.priority,
        included: false,
        truncated: false,
        content: '',
        estimatedTokens: 0,
      })
      continue
    }

    if (s.truncate && body.length > remaining) {
      const keep = Math.max(0, Math.min(remaining - HEADER_BUDGET_CHARS, remaining))
      if (keep < s.minChars) {
        composed.push({
          id: s.id,
          priority: s.priority,
          included: false,
          truncated: false,
          content: '',
          estimatedTokens: 0,
        })
        continue
      }
      effective = body.slice(0, keep).trimEnd()
      truncated = true
    } else if (body.length > remaining) {
      // Cannot truncate and does not fit: drop instead of blowing the budget.
      composed.push({
        id: s.id,
        priority: s.priority,
        included: false,
        truncated: false,
        content: '',
        estimatedTokens: 0,
      })
      continue
    }

    const rendered = renderSection(s.id, effective)
    used += rendered.length
    composed.push({
      id: s.id,
      priority: s.priority,
      included: true,
      truncated,
      content: effective,
      estimatedTokens: estimateSectionTokens(rendered),
    })
  }

  const prompt = composed
    .filter((s) => s.included)
    .map((s) => renderSection(s.id, s.content))
    .join('\n\n')

  return {
    prompt,
    sections: composed,
    estimatedTokens: estimateSectionTokens(prompt),
  }
}

function renderSection(id: string, content: string): string {
  return `<section id="${id}">\n${content}\n</section>`
}

function isFullSection(value: PromptSectionInput): value is PromptSection {
  return typeof (value as PromptSection).priority === 'number'
}
