import { describe, expect, it } from 'bun:test'
import {
  describeRequest,
  resolveFromChoice,
  riskColor,
  type PermissionRequest,
  type PermissionChoice,
} from './permission-dialog'

function makeRequest(over: Partial<PermissionRequest> = {}): PermissionRequest {
  return {
    id: 'req-1',
    tool: { name: 'bash', description: 'Run a shell command' },
    args: { command: 'rm -rf /tmp/foo' },
    category: 'destructive',
    sessionId: 'sess-1',
    permissionMode: 'default',
    ...over,
  }
}

describe('describeRequest', () => {
  it('describes bash command', () => {
    expect(describeRequest(makeRequest({ tool: { name: 'bash' }, args: { command: 'ls -la' } }))).toBe(
      'Run shell command: ls -la'
    )
  })

  it('describes read file', () => {
    expect(describeRequest(makeRequest({ tool: { name: 'read' }, args: { path: 'src/app.ts' } }))).toBe(
      'Read file: src/app.ts'
    )
  })

  it('describes write file (file alias)', () => {
    expect(describeRequest(makeRequest({ tool: { name: 'write' }, args: { file: 'a.txt' } }))).toBe(
      'Write file: a.txt'
    )
  })

  it('describes edit file', () => {
    expect(describeRequest(makeRequest({ tool: { name: 'edit' }, args: { path: 'x.ts' } }))).toBe(
      'Edit file: x.ts'
    )
  })

  it('describes web fetch', () => {
    expect(describeRequest(makeRequest({ tool: { name: 'web_fetch' }, args: { url: 'https://x.com' } }))).toBe(
      'Fetch URL: https://x.com'
    )
  })

  it('describes web search', () => {
    expect(describeRequest(makeRequest({ tool: { name: 'web_search' }, args: { query: 'best tui' } }))).toBe(
      'Web search: best tui'
    )
  })

  it('describes glob', () => {
    expect(describeRequest(makeRequest({ tool: { name: 'glob' }, args: { pattern: '**/*.ts' } }))).toBe(
      'Glob pattern: **/*.ts'
    )
  })

  it('falls back to argument summary', () => {
    const r = describeRequest(makeRequest({ tool: { name: 'mystery' }, args: { foo: 'bar', baz: 1 } }))
    expect(r).toContain('foo=bar')
    expect(r).toContain('baz=')
  })

  it('handles no args', () => {
    expect(describeRequest(makeRequest({ tool: { name: 'noop' }, args: {} }))).toBe('No arguments')
  })
})

describe('resolveFromChoice', () => {
  const req = makeRequest()

  const cases: Array<[PermissionChoice, PermissionDecision | string, boolean, boolean]> = [
    ['allow', 'allow', false, false],
    ['allow-session', 'allow', true, false],
    ['allow-always', 'allow', true, true],
    ['deny', 'deny', false, false],
    ['deny-always', 'deny', true, true],
  ]

  for (const [choice, decision, remember, hasRule] of cases) {
    it(`resolves ${choice}`, () => {
      const res = resolveFromChoice(req, choice)
      expect(res.requestId).toBe('req-1')
      expect(res.decision).toBe(decision)
      expect(res.remember).toBe(remember)
      if (hasRule) {
        expect(res.customRule?.target).toBe('bash')
      } else {
        expect(res.customRule).toBeUndefined()
      }
    })
  }
})

describe('riskColor', () => {
  const theme = {
    success: 'green',
    warning: 'yellow',
    error: 'red',
    textMuted: 'gray',
  } as unknown as import('../theme').ThemeColors

  it('maps risk levels', () => {
    expect(riskColor(theme, 'low')).toBe('green')
    expect(riskColor(theme, 'medium')).toBe('yellow')
    expect(riskColor(theme, 'high')).toBe('red')
    expect(riskColor(theme, 'critical')).toBe('red')
    expect(riskColor(theme, undefined)).toBe('gray')
  })
})
