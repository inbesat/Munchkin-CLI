import { StreamingMarkdownParser } from './markdown-parser'

describe('StreamingMarkdownParser', () => {
  it('parses headers', () => {
    const parser = new StreamingMarkdownParser()
    const tokens = parser.processChunk('# Header 1\n## Header 2\n')
    expect(tokens.length).toBe(2)
    expect(tokens[0].type).toBe('header')
    expect(tokens[0].content).toBe('Header 1')
    expect(tokens[0].meta?.level).toBe(1)
    expect(tokens[1].type).toBe('header')
    expect(tokens[1].meta?.level).toBe(2)
  })

  it('parses code blocks', () => {
    const parser = new StreamingMarkdownParser()
    const tokens = parser.processChunk('```typescript\nconst x = 1\n```\n')
    // Returns code_block + potential trailing newline text token
    expect(tokens.length).toBeGreaterThanOrEqual(1)
    const codeBlockToken = tokens.find((t) => t.type === 'code_block')
    expect(codeBlockToken).toBeDefined()
    expect(codeBlockToken?.content).toContain('const x = 1')
    expect(codeBlockToken?.meta?.language).toBe('typescript')
  })

  it('parses list items', () => {
    const parser = new StreamingMarkdownParser()
    const tokens = parser.processChunk('- item 1\n- item 2\n')
    expect(tokens.filter((t) => t.type === 'list_item').length).toBe(2)
  })

  it('parses ordered list items', () => {
    const parser = new StreamingMarkdownParser()
    const tokens = parser.processChunk('1. first\n2. second\n')
    const listItems = tokens.filter((t) => t.type === 'list_item')
    expect(listItems.length).toBe(2)
    expect(listItems[0].meta?.ordered).toBe(true)
  })

  it('parses blockquotes', () => {
    const parser = new StreamingMarkdownParser()
    const tokens = parser.processChunk('> quote\n')
    expect(tokens.some((t) => t.type === 'blockquote')).toBe(true)
  })

  it('parses horizontal rules', () => {
    const parser = new StreamingMarkdownParser()
    const tokens = parser.processChunk('---\n')
    expect(tokens.some((t) => t.type === 'horizontal_rule')).toBe(true)
  })

  it('handles streaming incomplete code block', () => {
    const parser = new StreamingMarkdownParser()
    parser.processChunk('```python\n')
    expect(parser.isInCodeBlock()).toBe(true)
    expect(parser.getPendingContent()).toContain('python')
  })

  it('handles streaming code block completion', () => {
    const parser = new StreamingMarkdownParser()
    parser.processChunk('```python\nprint("hello")\n')
    expect(parser.isInCodeBlock()).toBe(true)
    // Need newline before closing backticks
    const tokens = parser.processChunk('\n```\n')
    expect(tokens.length).toBeGreaterThanOrEqual(1)
    const codeBlockToken = tokens.find((t) => t.type === 'code_block')
    expect(codeBlockToken).toBeDefined()
    expect(codeBlockToken?.content).toContain('print("hello")')
    expect(parser.isInCodeBlock()).toBe(false)
  })

  it('accumulates tokens across chunks', () => {
    const parser = new StreamingMarkdownParser()
    parser.processChunk('# Header\n')
    parser.processChunk('Some text\n')
    const tokens = parser.getTokens()
    expect(tokens.length).toBe(2)
    expect(tokens[0].type).toBe('header')
    expect(tokens[1].type).toBe('text')
  })

  it('resets state', () => {
    const parser = new StreamingMarkdownParser()
    parser.processChunk('# Header\n')
    parser.reset()
    expect(parser.getTokens().length).toBe(0)
    expect(parser.isInCodeBlock()).toBe(false)
  })

  it('handles mixed content', () => {
    const parser = new StreamingMarkdownParser()
    const markdown = `# Title

- List item 1
- List item 2

\`\`\`javascript
console.log('hello')
\`\`\`

> A quote
`
    const tokens = parser.processChunk(markdown)
    const types = tokens.map((t) => t.type)
    expect(types).toContain('header')
    expect(types.filter((t) => t === 'list_item').length).toBe(2)
    expect(types).toContain('code_block')
    expect(types).toContain('blockquote')
  })

  it('handles incomplete markdown gracefully', () => {
    const parser = new StreamingMarkdownParser()
    // Incomplete bold
    const tokens = parser.processChunk('This is **bold')
    expect(tokens.length).toBeGreaterThan(0)
    // Should not crash
  })

  it('handles empty input', () => {
    const parser = new StreamingMarkdownParser()
    const tokens = parser.processChunk('')
    expect(tokens.length).toBe(0)
  })

  it('parses text content', () => {
    const parser = new StreamingMarkdownParser()
    const tokens = parser.processChunk('Just some text\nMore text\n')
    expect(tokens.some((t) => t.type === 'text')).toBe(true)
  })

  it('handles multiple headers', () => {
    const parser = new StreamingMarkdownParser()
    const tokens = parser.processChunk('# H1\n## H2\n### H3\n')
    expect(tokens.filter((t) => t.type === 'header').length).toBe(3)
  })
})

describe('MarkdownToken types', () => {
  it('produces various token types', () => {
    const parser = new StreamingMarkdownParser()
    parser.processChunk('# H1\n- item\n> quote\n---\n```js\ncode\n```\n')

    const types = new Set(parser.getTokens().map((t) => t.type))
    expect(types.has('header')).toBe(true)
    expect(types.has('list_item')).toBe(true)
    expect(types.has('blockquote')).toBe(true)
    expect(types.has('horizontal_rule')).toBe(true)
    expect(types.has('code_block')).toBe(true)
  })
})
