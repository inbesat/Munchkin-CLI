import { describe, expect, it } from 'bun:test'
import { LazyToolIndex, type ToolSchema } from './lazy'

/** A 120-tool "server" catalog (blueprint: 100+ tools). */
function generateCatalog(count = 120): ToolSchema[] {
  const domains = ['deploy', 'issue', 'pull_request', 'database', 'logging', 'billing']
  const verbs = ['create', 'list', 'get', 'delete', 'update', 'run']
  const tools: ToolSchema[] = []
  for (let i = 0; i < count; i++) {
    const domain = domains[i % domains.length]
    const verb = verbs[Math.floor(i / domains.length) % verbs.length]
    tools.push({
      name: `${verb}_${domain}_${String(i).padStart(3, '0')}`,
      description: `${verb} operation for ${domain} resources, item ${i}`,
      inputSchema: { type: 'object', properties: { id: { type: 'string' } } },
    })
  }
  return tools
}

describe('tool-search, lazy loading (Phase 120)', () => {
  it('indexes a 120-tool server without loading any schemas into context', async () => {
    let loaderCalls = 0
    const index = new LazyToolIndex(async () => {
      loaderCalls += 1
      return { ok: true, tools: generateCatalog() }
    })
    const built = await index.buildIndex()
    expect(built.ok).toBe(true)
    if (built.ok) expect(built.value.count).toBe(120)
    expect(index.stats()).toEqual({ indexSize: 120, loadedSchemas: 0 })
    expect(loaderCalls).toBe(1)
  })

  it('search ranks relevant tools without exposing schemas', async () => {
    const index = new LazyToolIndex(async () => ({ ok: true, tools: generateCatalog() }))
    await index.buildIndex()

    const results = index.search('create deploy', 5)
    expect(results.length).toBeLessThanOrEqual(5)
    expect(results[0]?.name).toBe('create_deploy_000')
    expect(results.every((r) => r.score > 0)).toBe(true)

    const noMatch = index.search('quantum-flux-capacitor')
    expect(noMatch).toEqual([])
  })

  it('loads only the requested schemas — everything else stays out of context', async () => {
    const catalog = generateCatalog()
    const nameA = catalog[0]?.name ?? ''
    const nameB = catalog[10]?.name ?? ''
    const index = new LazyToolIndex(async () => ({ ok: true, tools: catalog }))
    await index.buildIndex()

    const selected = await index.loadSchemas([nameA, nameB])
    expect(selected.ok).toBe(true)
    if (selected.ok) {
      expect(selected.value.map((tool) => tool.name)).toEqual([nameA, nameB])
      expect(selected.value.every((tool) => tool.inputSchema !== undefined)).toBe(true)
    }
    expect(index.stats()).toEqual({ indexSize: 120, loadedSchemas: 2 })
    expect(index.isLoaded(nameA)).toBe(true)
    expect(index.isLoaded(catalog[5]?.name ?? '')).toBe(false)
  })

  it('rejects names outside the index and dedupes repeated loads', async () => {
    const index = new LazyToolIndex(async () => ({ ok: true, tools: generateCatalog() }))
    await index.buildIndex()

    const missing = await index.loadSchemas(['does_not_exist'])
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error).toContain('does_not_exist')

    const targetName = generateCatalog()[30]?.name ?? ''
    const first = await index.loadSchemas([targetName])
    const second = await index.loadSchemas([targetName, targetName])
    expect(first.ok && second.ok).toBe(true)
    expect(index.stats().loadedSchemas).toBe(1)
    if (second.ok) expect(second.value).toHaveLength(1)
  })

  it('surfaces loader failures as results instead of throwing', async () => {
    const index = new LazyToolIndex(async () => ({ ok: false, error: 'server unreachable' }))
    const built = await index.buildIndex()
    expect(built.ok).toBe(false)
    if (!built.ok) expect(built.error).toContain('unreachable')
    expect(index.search('anything')).toEqual([])
    expect(index.stats()).toEqual({ indexSize: 0, loadedSchemas: 0 })
  })
})
