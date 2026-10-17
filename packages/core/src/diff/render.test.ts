import { describe, expect, it } from 'bun:test'
import { computeDiff, formatInlineDiff, formatSideBySideDiff, formatUnifiedDiff } from './compute'
import { detectLanguage, renderDiff, renderDiffAuto } from './render'

const OLD_CODE = `function hello() {
  console.log("hello")
  return 42
}

function world() {
  console.log("world")
}
`

const NEW_CODE = `function hello() {
  console.log("hello world")
  return 42
}

function world() {
  console.log("world!")
}

function newFunc() {
  return "new"
}
`

describe('diff/compute', () => {
  it('computes unified diff', () => {
    const diff = computeDiff(OLD_CODE, NEW_CODE, { format: 'unified' })
    expect(diff.hunks.length).toBeGreaterThan(0)
    expect(diff.format).toBe('unified')
  })

  it('computes side-by-side diff', () => {
    const diff = computeDiff(OLD_CODE, NEW_CODE, { format: 'side-by-side' })
    expect(diff.hunks.length).toBeGreaterThan(0)
    expect(diff.format).toBe('side-by-side')
  })

  it('computes inline diff', () => {
    const diff = computeDiff(OLD_CODE, NEW_CODE, { format: 'inline' })
    expect(diff.hunks.length).toBeGreaterThan(0)
    expect(diff.format).toBe('inline')
  })

  it('formats unified diff correctly', () => {
    const diff = computeDiff(OLD_CODE, NEW_CODE, { format: 'unified' })
    const formatted = formatUnifiedDiff(diff, 'old.js', 'new.js')
    expect(formatted).toContain('--- old.js')
    expect(formatted).toContain('+++ new.js')
    expect(formatted).toContain('@@')
    expect(formatted).toContain('-  console.log("hello")')
    expect(formatted).toContain('+  console.log("hello world")')
  })

  it('formats side-by-side diff', () => {
    const diff = computeDiff(OLD_CODE, NEW_CODE, { format: 'side-by-side' })
    const formatted = formatSideBySideDiff(diff)
    expect(formatted).toContain('Old')
    expect(formatted).toContain('New')
  })

  it('formats inline diff', () => {
    const diff = computeDiff(OLD_CODE, NEW_CODE, { format: 'inline' })
    const formatted = formatInlineDiff(diff)
    expect(formatted).toContain('@@')
    expect(formatted).toContain('-   console.log("hello")')
    expect(formatted).toContain('+   console.log("hello world")')
  })

  it('handles identical files', () => {
    const diff = computeDiff(OLD_CODE, OLD_CODE)
    // Identical files may produce empty hunks or no hunks depending on algorithm
    expect(diff.hunks.length).toBeLessThanOrEqual(1)
    if (diff.hunks.length > 0) {
      expect(diff.hunks[0].lines.every((l) => l.type === 'context')).toBe(true)
    }
  })

  it('handles empty old file', () => {
    const diff = computeDiff('', NEW_CODE)
    expect(diff.hunks.length).toBeGreaterThan(0)
    const formatted = formatUnifiedDiff(diff)
    expect(formatted).toContain('+function hello()')
  })

  it('handles empty new file', () => {
    const diff = computeDiff(OLD_CODE, '')
    expect(diff.hunks.length).toBeGreaterThan(0)
    const formatted = formatUnifiedDiff(diff)
    expect(formatted).toContain('-function hello()')
  })

  it('uses word-level diff when specified', () => {
    const diff = computeDiff('hello world', 'hello there', { algorithm: 'words' })
    expect(diff.hunks.length).toBeGreaterThan(0)
  })

  it('uses char-level diff when specified', () => {
    const diff = computeDiff('hello', 'hella', { algorithm: 'chars' })
    expect(diff.hunks.length).toBeGreaterThan(0)
  })

  it('respects context lines option', () => {
    const longOld = `${'a\n'.repeat(20)}CHANGE\n${'b\n'.repeat(20)}`
    const longNew = `${'a\n'.repeat(20)}CHANGED\n${'b\n'.repeat(20)}`
    const diff1 = computeDiff(longOld, longNew, { contextLines: 1 })
    const diff2 = computeDiff(longOld, longNew, { contextLines: 5 })
    // More context = more lines in hunks
    expect(diff2.hunks[0].lines.length).toBeGreaterThan(diff1.hunks[0].lines.length)
  })

  it('throws on files exceeding maxSize', () => {
    const large = 'x'.repeat(2_000_000)
    expect(() => computeDiff(large, large, { maxSize: 1_000_000 })).toThrow('too large')
  })
})

describe('diff/render', () => {
  it('detects language from extension', () => {
    expect(detectLanguage('test.ts')).toBe('typescript')
    expect(detectLanguage('test.py')).toBe('python')
    expect(detectLanguage('test.rs')).toBe('rust')
    expect(detectLanguage('test.go')).toBe('go')
    expect(detectLanguage('test.json')).toBe('json')
    expect(detectLanguage('test.md')).toBe('markdown')
    expect(detectLanguage('test.unknown')).toBe('text')
    expect(detectLanguage('test')).toBe('text')
  })

  it('renders diff with highlighting', async () => {
    const diff = computeDiff(OLD_CODE, NEW_CODE, { format: 'unified' })
    const rendered = await renderDiff(diff, {
      language: 'typescript',
      theme: 'github-dark',
      format: 'ansi',
    })
    expect(typeof rendered).toBe('string')
    expect(rendered.length).toBeGreaterThan(0)
  })

  it('renders diff with auto language detection', async () => {
    const diff = computeDiff(OLD_CODE, NEW_CODE, { format: 'unified' })
    const rendered = await renderDiffAuto(diff, 'test.ts', { theme: 'github-dark', format: 'ansi' })
    expect(typeof rendered).toBe('string')
  })

  it('renders HTML format', async () => {
    const diff = computeDiff(OLD_CODE, NEW_CODE, { format: 'unified' })
    const rendered = await renderDiff(diff, {
      language: 'typescript',
      theme: 'github-dark',
      format: 'html',
    })
    expect(rendered).toContain('<pre class="diff">')
    expect(rendered).toContain('diff-hunk')
  })

  it('handles special characters in HTML', async () => {
    const diff = computeDiff('<div>hello</div>', '<div>world</div>', { format: 'unified' })
    const rendered = await renderDiff(diff, {
      language: 'html',
      theme: 'github-dark',
      format: 'html',
    })
    expect(rendered).toContain('div')
    expect(rendered).toContain('hello')
    expect(rendered).toContain('world')
  })
})

describe('diff integration', () => {
  it('compute + format + render pipeline', async () => {
    const oldFile = `const x = 1
const y = 2
console.log(x + y)
`
    const newFile = `const x = 1
const y = 3
console.log(x + y)
console.log("done")
`
    const diff = computeDiff(oldFile, newFile, { format: 'unified', contextLines: 2 })
    const rendered = await renderDiff(diff, {
      language: 'typescript',
      theme: 'github-dark',
      format: 'ansi',
    })
    expect(rendered).toContain('const y = 2')
    expect(rendered).toContain('const y = 3')
    expect(rendered).toContain('console.log("done")')
  })

  it('large diff still renders', async () => {
    const oldFile = 'line\n'.repeat(100)
    const newFile = `${'line\n'.repeat(50)}CHANGED\n${'line\n'.repeat(49)}`
    const diff = computeDiff(oldFile, newFile, { format: 'unified', contextLines: 3 })
    const rendered = await renderDiff(diff, {
      language: 'text',
      theme: 'github-dark',
      format: 'ansi',
    })
    expect(rendered).toContain('CHANGED')
  })
})
