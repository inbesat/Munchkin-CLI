import { WebSearchProvider, WebSearchResult, WebSearchOptions } from '../web-search'
import { ToolError, ErrorCode } from '../../errors'

/** Exa API base URL. */
const EXA_API_BASE = 'https://api.exa.ai'

/** Exa search response shape. */
interface ExaSearchResponse {
  results: ExaResult[]
  requestId: string
}

interface ExaResult {
  title: string
  url: string
  text: string
  highlights: string[]
  highlightScores: number[]
  publishedDate?: string
  author?: string
  score: number
}

/** Exa provider options (API key from config). */
export interface ExaProviderConfig {
  apiKey: string
}

/**
 * Exa (exa.ai) search provider — embeddings-based semantic search.
 * Requires EXA_API_KEY in config.
 */
export class ExaProvider implements WebSearchProvider {
  readonly name = 'exa'

  constructor(private readonly config: ExaProviderConfig) {
    if (!config.apiKey) {
      throw new ToolError(ErrorCode.CONFIG_NOT_FOUND, 'Exa API key not configured', 'webSearch')
    }
  }

  async search(query: string, options: WebSearchOptions = {}): Promise<WebSearchResult[]> {
    const { maxResults = 10, includeDomains, excludeDomains, recencyDays } = options

    const body: Record<string, unknown> = {
      query,
      numResults: Math.min(maxResults, 50),
      type: 'neural',
      useAutoprompt: true,
      text: { maxCharacters: 500 },
      highlights: { numSentences: 3, highlightsPerUrl: 1 },
    }

    if (includeDomains?.length) body.includeDomains = includeDomains
    if (excludeDomains?.length) body.excludeDomains = excludeDomains
    if (recencyDays) body.startPublishedDate = new Date(Date.now() - recencyDays * 86400000).toISOString().split('T')[0]

    const response = await fetch(`${EXA_API_BASE}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { message?: string }
      throw new ToolError(
        ErrorCode.TOOL_EXECUTION_FAILED,
        `Exa search failed: ${response.status} ${error.message ?? response.statusText}`,
        'webSearch',
      )
    }

    const data = (await response.json()) as ExaSearchResponse

    return data.results.map((r, i) => ({
      title: r.title,
      url: r.url,
      snippet: r.highlights[0] ?? r.text.slice(0, 300),
      score: r.score,
      index: i,
    }))
  }
}

/** Create Exa provider from config. */
export function createExaProvider(apiKey: string): ExaProvider {
  return new ExaProvider({ apiKey })
}