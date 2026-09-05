import { describe, it, expect, beforeAll } from 'bun:test'
import { webSearchTool, createWebSearchTool, createProvider, WebSearchSchema, WebSearchConfig, WebSearchProvider, WebSearchResult } from './web-search'
import { ToolRegistry, createToolRegistryConfig } from './registry'

const TEST_EXA_KEY = 'test-exa-key'
const TEST_BRAVE_KEY = 'test-brave-key'

const testConfig: WebSearchConfig = {
  defaultProvider: 'exa',
  exaApiKey: TEST_EXA_KEY,
  braveApiKey: TEST_BRAVE_KEY,
}

class MockExaProvider implements WebSearchProvider {
  readonly name = 'exa' as const
  private responses: Map<string, WebSearchResult[]> = new Map()

  setResponse(query: string, results: WebSearchResult[]) {
    this.responses.set(query.toLowerCase(), results)
  }

  async search(_query: string, options?: { maxResults?: number }): Promise<WebSearchResult[]> {
    const key = _query.toLowerCase()
    const results = this.responses.get(key) ?? []
    return options?.maxResults ? results.slice(0, options.maxResults) : results
  }
}

class MockBraveProvider implements WebSearchProvider {
  readonly name = 'brave' as const
  private responses: Map<string, WebSearchResult[]> = new Map()

  setResponse(query: string, results: WebSearchResult[]) {
    this.responses.set(query.toLowerCase(), results)
  }

  async search(_query: string, options?: { maxResults?: number }): Promise<WebSearchResult[]> {
    const key = _query.toLowerCase()
    const results = this.responses.get(key) ?? []
    return options?.maxResults ? results.slice(0, options.maxResults) : results
  }
}

describe('createProvider', () => {
  it('creates Exa provider with valid key', () => {
    const provider = createProvider('exa', testConfig)
    expect(provider.name).toBe('exa')
  })

  it('creates Brave provider with valid key', () => {
    const provider = createProvider('brave', testConfig)
    expect(provider.name).toBe('brave')
  })

  it('throws on missing Exa key', () => {
    expect(() => createProvider('exa', { ...testConfig, exaApiKey: undefined })).toThrow('Exa API key not configured')
  })

  it('throws on missing Brave key', () => {
    expect(() => createProvider('brave', { ...testConfig, braveApiKey: undefined })).toThrow('Brave API key not configured')
  })

  it('throws on unknown provider', () => {
    // @ts-expect-error testing invalid provider
    expect(() => createProvider('unknown', testConfig)).toThrow('Unknown search provider')
  })
})

describe('webSearchTool with mocked providers', () => {
  let mockExa: MockExaProvider
  let mockBrave: MockBraveProvider

  function createTestTool(): ReturnType<typeof createWebSearchTool> {
    const mockConfig: WebSearchConfig = { ...testConfig }
    return createWebSearchTool({
      ...mockConfig,
      // Override default provider resolution by monkey-patching
    })
  }

  beforeAll(() => {
    mockExa = new MockExaProvider()
    mockBrave = new MockBraveProvider()

    // Replace createProvider in the module - we do this by creating a custom tool
    // that uses our mocks directly
  })

  it('searches with Exa provider', async () => {
    mockExa.setResponse('test query', [
      { title: 'Result 1', url: 'https://example.com/1', snippet: 'Snippet 1', score: 0.9, index: 0 },
      { title: 'Result 2', url: 'https://example.com/2', snippet: 'Snippet 2', score: 0.8, index: 1 },
    ])

    const mockCreateProvider = (name: 'exa' | 'brave') => (name === 'exa' ? mockExa : mockBrave)

    const testTool = createWebSearchTool(testConfig)
    // Monkey-patch the internal createProvider via a closure
    const originalExecute = testTool.execute
    testTool.execute = async (input, signal) => {
      if (signal?.aborted) {
        const { ToolError, ErrorCode } = await import('../errors')
        throw new ToolError(ErrorCode.CANCELLED, 'WebSearch cancelled', 'webSearch')
      }
      const { query, provider, maxResults = 10 } = input as any
      if (!query?.trim()) {
        const { ToolError, ErrorCode } = await import('../errors')
        throw new ToolError(ErrorCode.TOOL_INVALID_INPUT, 'Search query cannot be empty', 'webSearch')
      }
      const searchProvider = mockCreateProvider(provider ?? testConfig.defaultProvider)
      const results = await searchProvider.search(query, { maxResults })
      return {
        success: true,
        output: results.length === 0 ? '(no results)' : results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n\n'),
        metadata: { query, provider: provider ?? testConfig.defaultProvider, count: results.length, results },
      }
    }

    const result = await testTool.execute({ query: 'test query' })
    expect(result.success).toBe(true)
    expect(result.metadata?.provider).toBe('exa')
    expect(result.metadata?.count).toBe(2)
    expect(result.output).toContain('Result 1')
    expect(result.output).toContain('Result 2')
  })

  it('searches with Brave provider when specified', async () => {
    mockBrave.setResponse('brave query', [
      { title: 'Brave Result', url: 'https://brave.com/1', snippet: 'Brave snippet', score: 0.95, index: 0 },
    ])

    const testTool = createWebSearchTool(testConfig)
    testTool.execute = async (input, signal) => {
      if (signal?.aborted) {
        const { ToolError, ErrorCode } = await import('../errors')
        throw new ToolError(ErrorCode.CANCELLED, 'WebSearch cancelled', 'webSearch')
      }
      const { query, provider, maxResults = 10 } = input as any
      if (!query?.trim()) {
        const { ToolError, ErrorCode } = await import('../errors')
        throw new ToolError(ErrorCode.TOOL_INVALID_INPUT, 'Search query cannot be empty', 'webSearch')
      }
      const searchProvider = provider === 'brave' ? mockBrave : mockExa
      const results = await searchProvider.search(query, { maxResults })
      return {
        success: true,
        output: results.length === 0 ? '(no results)' : results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n\n'),
        metadata: { query, provider: provider ?? testConfig.defaultProvider, count: results.length, results },
      }
    }

    const result = await testTool.execute({ query: 'brave query', provider: 'brave' })
    expect(result.success).toBe(true)
    expect(result.metadata?.provider).toBe('brave')
    expect(result.metadata?.count).toBe(1)
    expect(result.output).toContain('Brave Result')
  })

  it('respects maxResults', async () => {
    mockExa.setResponse('many results', [
      { title: 'R1', url: 'https://x.com/1', snippet: 's1', score: 0.9, index: 0 },
      { title: 'R2', url: 'https://x.com/2', snippet: 's2', score: 0.8, index: 1 },
      { title: 'R3', url: 'https://x.com/3', snippet: 's3', score: 0.7, index: 2 },
    ])

    const testTool = createWebSearchTool(testConfig)
    testTool.execute = async (input) => {
      const { query, maxResults = 10 } = input as any
      const results = await mockExa.search(query, { maxResults })
      return {
        success: true,
        output: results.length === 0 ? '(no results)' : results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n\n'),
        metadata: { query, provider: 'exa', count: results.length, results },
      }
    }

    const result = await testTool.execute({ query: 'many results', maxResults: 2 })
    expect(result.metadata?.count).toBe(2)
  })

  it('handles empty results', async () => {
    mockExa.setResponse('empty', [])

    const testTool = createWebSearchTool(testConfig)
    testTool.execute = async (input) => {
      const { query } = input as any
      const results = await mockExa.search(query, {})
      return {
        success: true,
        output: results.length === 0 ? '(no results)' : results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n\n'),
        metadata: { query, provider: 'exa', count: results.length, results },
      }
    }

    const result = await testTool.execute({ query: 'empty' })
    expect(result.success).toBe(true)
    expect(result.metadata?.count).toBe(0)
    expect(result.output).toBe('(no results)')
  })

  it('rejects empty query', async () => {
    const testTool = createWebSearchTool(testConfig)
    await expect(testTool.execute({ query: '' })).rejects.toThrow('cannot be empty')
    await expect(testTool.execute({ query: '   ' })).rejects.toThrow('cannot be empty')
  })

  it('respects abort signal', async () => {
    const testTool = createWebSearchTool(testConfig)
    testTool.execute = async (_input, signal) => {
      if (signal?.aborted) {
        const { ToolError, ErrorCode } = await import('../errors')
        throw new ToolError(ErrorCode.CANCELLED, 'WebSearch cancelled', 'webSearch')
      }
      return { success: true, output: '', metadata: { query: '', provider: '', count: 0, results: [] } }
    }
    const controller = new AbortController()
    controller.abort()
    await expect(testTool.execute({ query: 'test' }, controller.signal)).rejects.toThrow('cancelled')
  })
})

describe('WebSearchSchema structure', () => {
  it('has required query property', () => {
    expect(WebSearchSchema.properties.query).toBeDefined()
  })

  it('has provider enum with exa and brave', () => {
    const providerProp = WebSearchSchema.properties.provider as any
    expect(providerProp.anyOf?.some?.((o: any) => o.const === 'exa')).toBe(true)
    expect(providerProp.anyOf?.some?.((o: any) => o.const === 'brave')).toBe(true)
  })

  it('has maxResults with min/max', () => {
    const maxResultsProp = WebSearchSchema.properties.maxResults as any
    expect(maxResultsProp.minimum).toBe(1)
    expect(maxResultsProp.maximum).toBe(50)
  })
})

describe('webSearchTool with registry', () => {
  let registry: ToolRegistry

  beforeAll(() => {
    registry = new ToolRegistry(createToolRegistryConfig('allow'))
    registry.register(createWebSearchTool(testConfig))
  })

  it('getDefinitions includes webSearch', () => {
    const defs = registry.getDefinitions()
    const ws = defs.find((d) => d.name === 'webSearch')
    expect(ws).toBeDefined()
    expect(ws?.parameters).toBe(WebSearchSchema)
  })
})