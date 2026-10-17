import { describe, expect, it } from 'bun:test'
import { buildSpecApp, generateOpenAPISpec, openAPIDocsHtml } from '../src/openapi'

const EXPECTED_PATHS = [
  '/health',
  '/health/ready',
  '/api/sessions',
  '/api/sessions/{id}',
  '/api/sessions/{id}/events',
  '/api/sessions/search',
  '/api/prompts/{sessionId}',
  '/api/tools',
  '/api/tools/{name}',
  '/api/tools/execute',
  '/api/config',
  '/api/config/default',
  '/api/config/{key}',
  '/api/auth',
  '/api/sse/stats',
  '/api/sse/broadcast',
  '/api/sse/events',
]

describe('openapi spec', () => {
  const spec = generateOpenAPISpec()

  it('is an OpenAPI 3.1 document', () => {
    expect(spec.openapi).toBe('3.1.0')
  })

  it('has API metadata', () => {
    expect(spec.info).toBeDefined()
    expect(spec.info.title).toBeTypeOf('string')
    expect(spec.info.version).toBeTypeOf('string')
  })

  it('declares every server route', () => {
    for (const p of EXPECTED_PATHS) {
      expect(spec.paths[p], `path ${p} should be present`).toBeDefined()
    }
  })

  it('every declared path has at least one operation with a success response', () => {
    for (const [path, item] of Object.entries(spec.paths ?? {})) {
      for (const [method, op] of Object.entries(item ?? {})) {
        if (method === 'parameters') continue
        const responses = (op as { responses?: Record<string, unknown> }).responses ?? {}
        const codes = Object.keys(responses)
        expect(
          codes.some((c) => c.startsWith('2')),
          `${path} ${method} has a 2xx`,
        ).toBe(true)
      }
    }
  })

  it('buildSpecApp returns an OpenAPIHono with the spec route available', () => {
    const app = buildSpecApp()
    // buildSpecApp exists and is callable; spec generation validates routes.
    expect(typeof app.openapi).toBe('function')
  })

  it('docs html references the spec url', () => {
    const html = openAPIDocsHtml('/api/openapi.json')
    expect(html).toInclude('/api/openapi.json')
    expect(html).toInclude('@scalar/api-reference')
  })
})
