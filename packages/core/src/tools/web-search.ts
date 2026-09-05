import { Tool, ToolResult } from './types'
import { Type } from '@sinclair/typebox'
import { ToolError, ErrorCode } from '../errors'
import { createExaProvider } from './web-search-providers/exa'
import { createBraveProvider } from './web-search-providers/brave'

/** Provider identifier. */
export type WebSearchProviderName = 'exa' | 'brave'

/** Options for a web search. */
export interface WebSearchOptions {
  /** Maximum number of results to return. */
  maxResults?: number
  /** Only include results from these domains. */
  includeDomains?: string[]
  /** Exclude results from these domains. */
  excludeDomains?: string[]
  /** Only return results from the last N days. */
  recencyDays?: number
}

/** A single search result. */
export interface WebSearchResult {
  /** Title of the result. */
  title: string
  /** URL of the result. */
  url: string
  /** Snippet/description of the result. */
  snippet: string
  /** Relevance score (0-1, higher is more relevant). */
  score: number
  /** Index in the result set. */
  index: number
}

/** Web search provider interface. */
export interface WebSearchProvider {
  /** Provider name. */
  readonly name: WebSearchProviderName
  /** Execute a search. */
  search(query: string, options: WebSearchOptions): Promise<WebSearchResult[]>
}

/** Configuration for web search providers. */
export interface WebSearchConfig {
  /** Default provider to use. */
  defaultProvider: WebSearchProviderName
  /** Exa API key. */
  exaApiKey?: string
  /** Brave API key. */
  braveApiKey?: string
}

/** Create a provider instance from config. */
export function createProvider(name: WebSearchProviderName, config: WebSearchConfig): WebSearchProvider {
  switch (name) {
    case 'exa':
      if (!config.exaApiKey) {
        throw new ToolError(ErrorCode.CONFIG_NOT_FOUND, 'Exa API key not configured', 'webSearch')
      }
      return createExaProvider(config.exaApiKey)
    case 'brave':
      if (!config.braveApiKey) {
        throw new ToolError(ErrorCode.CONFIG_NOT_FOUND, 'Brave API key not configured', 'webSearch')
      }
      return createBraveProvider(config.braveApiKey)
    default:
      throw new ToolError(ErrorCode.TOOL_INVALID_INPUT, `Unknown search provider: ${name}`, 'webSearch')
  }
}

/** WebSearch input schema. */
export const WebSearchSchema = Type.Object({
  query: Type.String({ description: 'Search query' }),
  provider: Type.Optional(Type.Union([Type.Literal('exa'), Type.Literal('brave')])),
  maxResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, description: 'Maximum results to return' })),
  includeDomains: Type.Optional(Type.Array(Type.String(), { description: 'Domains to include' })),
  excludeDomains: Type.Optional(Type.Array(Type.String(), { description: 'Domains to exclude' })),
  recencyDays: Type.Optional(Type.Integer({ minimum: 1, maximum: 365, description: 'Only results from last N days' })),
})

/** WebSearch output metadata. */
export interface WebSearchResultMeta extends ToolResult {
  metadata?: {
    query: string
    provider: string
    count: number
    results: WebSearchResult[]
  }
}

/** Default config (API keys must be set via environment or config file). */
export const defaultWebSearchConfig: WebSearchConfig = {
  defaultProvider: 'brave',
  exaApiKey: process.env.EXA_API_KEY,
  braveApiKey: process.env.BRAVE_API_KEY,
}

/** Create the WebSearch tool. */
export function createWebSearchTool(config: WebSearchConfig = defaultWebSearchConfig): Tool {
  return {
    name: 'webSearch',
    description:
      'Search the web using a search provider (Exa or Brave). Returns structured results with titles, URLs, and snippets.',
    parameters: WebSearchSchema,
    scope: 'builtin',
    risk: 'medium',
    requiresPermission: true,
    async execute(input: Record<string, unknown>, signal?: AbortSignal): Promise<WebSearchResultMeta> {
      if (signal?.aborted) {
        throw new ToolError(ErrorCode.CANCELLED, 'WebSearch cancelled', 'webSearch')
      }

      const { query, provider, maxResults = 10, includeDomains, excludeDomains, recencyDays } = input as {
        query: string
        provider?: WebSearchProviderName
        maxResults?: number
        includeDomains?: string[]
        excludeDomains?: string[]
        recencyDays?: number
      }

      if (!query || query.trim() === '') {
        throw new ToolError(ErrorCode.TOOL_INVALID_INPUT, 'Search query cannot be empty', 'webSearch')
      }

      const searchProvider = provider ?? config.defaultProvider
      const providerInstance = createProvider(searchProvider, config)

      const results = await providerInstance.search(query, {
        maxResults,
        includeDomains,
        excludeDomains,
        recencyDays,
      })

      return {
        success: true,
        output:
          results.length === 0
            ? '(no results)'
            : results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n\n'),
        metadata: {
          query,
          provider: searchProvider,
          count: results.length,
          results,
        },
      }
    },
  }
}

/** Default tool instance using env-based config. */
export const webSearchTool = createWebSearchTool()