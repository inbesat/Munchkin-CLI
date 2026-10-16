import { describe, expect, it } from 'bun:test'
import { StreamingMarkdownParser } from './markdown-parser'

describe('markdown stream regressions', () => {
  it('does not discard formatted content or following lines', () => {
    const parser = new StreamingMarkdownParser()
    parser.processChunk('before **bold** after\nnext line\n')
    expect(parser.getTokens().map((token) => token.content).join('')).toBe(
      'before bold after\nnext line\n',
    )
  })

  it.each(['`code`', '**bold**', '*italic*', '~~gone~~', '[link](https://example.test)'])(
    'preserves a prefixed inline token: %s',
    (inline) => {
      const parser = new StreamingMarkdownParser()
      parser.processChunk(`prefix ${inline}`)
      expect(parser.getTokens().length).toBe(2)
      expect(parser.getTokens()[1].type).not.toBe('text')
      expect(parser.getPendingContent()).toBe('')
    },
  )

  it('recognizes fenced code at every chunk boundary', () => {
    const markdown = '```ts\nconst x = 1\n```\n'
    for (let split = 1; split < markdown.length; split++) {
      const parser = new StreamingMarkdownParser()
      parser.processChunk(markdown.slice(0, split))
      parser.processChunk(markdown.slice(split))
      expect(parser.getTokens().find((token) => token.type === 'code_block')).toEqual({
        type: 'code_block', content: 'const x = 1\n', meta: { language: 'ts' },
      })
      expect(parser.isInCodeBlock()).toBe(false)
    }
  })

  it('does not mutate token snapshots after later chunks', () => {
    const parser = new StreamingMarkdownParser()
    parser.processChunk('first\n')
    const snapshot = parser.getTokens()
    parser.processChunk('second\n')
    expect(snapshot).toHaveLength(1)
  })
})
