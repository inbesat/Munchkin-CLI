import { WebSearchProvider, WebSearchResult, WebSearchOptions } from '../web-search'
import { ToolError, ErrorCode } from '../../errors'

/** Brave Search API base URL. */
const BRAVE_API_BASE = 'https://api.search.brave.com/res/v1'

/** Brave search response shape. */
interface BraveSearchResponse {
  web?: {
    results: BraveResult[]
  }
  news?: {
    results: BraveResult[]
  }
}

interface BraveResult {
  title: string
  url: string
  description: string
  age?: string
  language?: string
  family_friendly?: boolean
  meta_url?: { scheme: string; netloc: string; path: string }
  thumbnail?: { src: string; width: number; height: number }
}

/** Brave provider options (API key from config). */
export interface BraveProviderConfig {
  apiKey: string
}

/**
 * Brave Search provider — traditional web search with snippets.
 * Requires BRAVE_API_KEY in config.
 */
export class BraveProvider implements WebSearchProvider {
  readonly name = 'brave'

  constructor(private readonly config: BraveProviderConfig) {
    if (!config.apiKey) {
      throw new ToolError(ErrorCode.CONFIG_NOT_FOUND, 'Brave API key not configured', 'webSearch')
    }
  }

  async search(query: string, options: WebSearchOptions = {}): Promise<WebSearchResult[]> {
    const { maxResults = 10, recencyDays } = options

    const params = new URLSearchParams({
      q: query,
      count: String(Math.min(maxResults, 20)),
      safesearch: 'moderate',
      text_decorations: 'false',
      spellcheck: 'true',
    })

    if (recencyDays) {
      params.set('freshness', recencyDays <= 1 ? 'pd' : recencyDays <= 7 ? 'pw' : recencyDays <= 30 ? 'pm' : 'py')
    }

    const response = await fetch(`${BRAVE_API_BASE}/web/search?${params}`, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': this.config.apiKey,
      },
    })

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { message?: string }
      throw new ToolError(
        ErrorCode.TOOL_EXECUTION_FAILED,
        `Brave search failed: ${response.status} ${error.message ?? response.statusText}`,
        'webSearch',
      )
    }

    const data = (await response.json()) as BraveSearchResponse

    const results = data.web?.results ?? []

    return results.map((r, i) => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
      score: 1 - i * 0.05,
      index: i,
    }))
  }
}

/** Create Brave provider from config. */
export function createBraveProvider(apiKey: string): BraveProvider {
  return new BraveProvider({ apiKey })
}