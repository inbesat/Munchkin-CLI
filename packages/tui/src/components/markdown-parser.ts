/** Token type for incremental parsing */
export type MarkdownTokenType =
  | 'text'
  | 'header'
  | 'code_block'
  | 'code_inline'
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'link'
  | 'list_item'
  | 'blockquote'
  | 'horizontal_rule'
  | 'table'

/** Parsed markdown token */
export interface MarkdownToken {
  type: MarkdownTokenType
  content: string
  meta?: {
    level?: number
    language?: string
    href?: string
    ordered?: boolean
    index?: number
  }
}

/** State for streaming markdown parser */
interface StreamingMarkdownState {
  buffer: string
  tokens: MarkdownToken[]
  inCodeBlock: boolean
  codeBlockLanguage: string
  codeBlockContent: string
  pendingInline: string
  listDepth: number
  inBlockquote: boolean
}

/** Streaming markdown parser - processes chunks incrementally */
export class StreamingMarkdownParser {
  private state: StreamingMarkdownState = {
    buffer: '',
    tokens: [],
    inCodeBlock: false,
    codeBlockLanguage: '',
    codeBlockContent: '',
    pendingInline: '',
    listDepth: 0,
    inBlockquote: false,
  }

  /** Process a chunk of markdown text */
  processChunk(chunk: string): MarkdownToken[] {
    this.state.buffer += chunk
    const newTokens: MarkdownToken[] = []

    while (this.state.buffer.length > 0) {
      const token = this.parseNext()
      if (token) {
        newTokens.push(token)
        this.state.tokens.push(token)
      } else if (!this.state.inCodeBlock) {
        // If not in code block and no token parsed, break to avoid infinite loop
        break
      }
      // If in code block and no token yet, continue loop to process more
    }

    return newTokens
  }

  /** Get all parsed tokens so far */
  getTokens(): MarkdownToken[] {
    return this.state.tokens
  }

  /** Reset parser state */
  reset(): void {
    this.state = {
      buffer: '',
      tokens: [],
      inCodeBlock: false,
      codeBlockLanguage: '',
      codeBlockContent: '',
      pendingInline: '',
      listDepth: 0,
      inBlockquote: false,
    }
  }

  /** Check if we're in a code block */
  isInCodeBlock(): boolean {
    return this.state.inCodeBlock
  }

  /** Get pending incomplete content for rendering */
  getPendingContent(): string {
    if (this.state.inCodeBlock) {
      return `\`\`\`${this.state.codeBlockLanguage}\n${this.state.codeBlockContent}`
    }
    return this.state.buffer
  }

  private parseNext(): MarkdownToken | null {
    const buf = this.state.buffer

    // Handle code block
    if (this.state.inCodeBlock) {
      const endIdx = buf.indexOf('\n```')
      if (endIdx >= 0) {
        this.state.codeBlockContent += buf.slice(0, endIdx + 1)
        const content = this.state.codeBlockContent
        const language = this.state.codeBlockLanguage
        this.state.buffer = buf.slice(endIdx + 4)
        this.state.inCodeBlock = false
        this.state.codeBlockLanguage = ''
        this.state.codeBlockContent = ''
        return { type: 'code_block', content, meta: { language } }
      } else {
        this.state.codeBlockContent += buf
        this.state.buffer = ''
        return null
      }
    }

    // Check for code block start
    const codeBlockMatch = buf.match(/^```(\w*)\n/)
    if (codeBlockMatch) {
      this.state.inCodeBlock = true
      this.state.codeBlockLanguage = codeBlockMatch[1] || 'text'
      this.state.buffer = buf.slice(codeBlockMatch[0].length)
      return null
    }

    // Check for header
    const headerMatch = buf.match(/^(#{1,6})\s+(.+?)(?:\n|$)/)
    if (headerMatch) {
      this.state.buffer = buf.slice(headerMatch[0].length)
      return {
        type: 'header',
        content: headerMatch[2],
        meta: { level: headerMatch[1].length },
      }
    }

    // Check for horizontal rule
    if (buf.match(/^---+\s*(?:\n|$)/) || buf.match(/^\*\*\*+\s*(?:\n|$)/)) {
      const hrMatch = buf.match(/^(---+|\*\*\*+)\s*(?:\n|$)/)
      if (hrMatch) {
        this.state.buffer = buf.slice(hrMatch[0].length)
        return { type: 'horizontal_rule', content: '' }
      }
    }

    // Check for blockquote
    const blockquoteMatch = buf.match(/^>\s*(.+?)(?:\n|$)/)
    if (blockquoteMatch) {
      this.state.buffer = buf.slice(blockquoteMatch[0].length)
      return {
        type: 'blockquote',
        content: blockquoteMatch[1],
      }
    }

    // Check for list item
    const listMatch = buf.match(/^(\s*)([-*+]|\d+\.)\s+(.+?)(?:\n|$)/)
    if (listMatch) {
      const indent = listMatch[1].length
      const marker = listMatch[2]
      const ordered = /\d+\./.test(marker)
      this.state.buffer = buf.slice(listMatch[0].length)
      return {
        type: 'list_item',
        content: listMatch[3],
        meta: { ordered, index: indent / 2 },
      }
    }

    // Find next newline or end of buffer
    const newlineIdx = buf.indexOf('\n')
    let line: string
    let remaining: string

    if (newlineIdx >= 0) {
      line = buf.slice(0, newlineIdx)
      remaining = buf.slice(newlineIdx + 1)
    } else {
      // No complete line yet - check for inline patterns
      return this.parseInline(buf)
    }

    this.state.buffer = remaining

    // Process inline formatting in the line
    if (line.trim() === '') {
      return { type: 'text', content: '\n' }
    }

    return this.parseInlineLine(line + '\n')
  }

  private parseInline(text: string): MarkdownToken | null {
    // Check for inline code
    const inlineCodeMatch = text.match(/^([^`]*)`([^`]+)`/)
    if (inlineCodeMatch) {
      if (inlineCodeMatch[1]) {
        this.state.buffer = inlineCodeMatch[1] + this.state.buffer.slice(inlineCodeMatch[0].length)
        return { type: 'text', content: inlineCodeMatch[1] }
      }
      this.state.buffer = this.state.buffer.slice(inlineCodeMatch[0].length)
      return { type: 'code_inline', content: inlineCodeMatch[2] }
    }

    // Check for bold
    const boldMatch = text.match(/^([^*]*)\*\*([^*]+)\*\*/)
    if (boldMatch) {
      if (boldMatch[1]) {
        this.state.buffer = boldMatch[1] + this.state.buffer.slice(boldMatch[0].length)
        return { type: 'text', content: boldMatch[1] }
      }
      this.state.buffer = this.state.buffer.slice(boldMatch[0].length)
      return { type: 'bold', content: boldMatch[2] }
    }

    // Check for italic (single * not part of **)
    const italicMatch = text.match(/^([^*]*)\*([^*]+)\*/)
    if (italicMatch && !italicMatch[0].startsWith('**')) {
      if (italicMatch[1]) {
        this.state.buffer = italicMatch[1] + this.state.buffer.slice(italicMatch[0].length)
        return { type: 'text', content: italicMatch[1] }
      }
      this.state.buffer = this.state.buffer.slice(italicMatch[0].length)
      return { type: 'italic', content: italicMatch[2] }
    }

    // Check for strikethrough
    const strikeMatch = text.match(/^([^~]*)~~([^~]+)~~/)
    if (strikeMatch) {
      if (strikeMatch[1]) {
        this.state.buffer = strikeMatch[1] + this.state.buffer.slice(strikeMatch[0].length)
        return { type: 'text', content: strikeMatch[1] }
      }
      this.state.buffer = this.state.buffer.slice(strikeMatch[0].length)
      return { type: 'strikethrough', content: strikeMatch[2] }
    }

    // Check for link
    const linkMatch = text.match(/^([^\[]*)\[([^\]]+)\]\(([^)]+)\)/)
    if (linkMatch) {
      if (linkMatch[1]) {
        this.state.buffer = linkMatch[1] + this.state.buffer.slice(linkMatch[0].length)
        return { type: 'text', content: linkMatch[1] }
      }
      this.state.buffer = this.state.buffer.slice(linkMatch[0].length)
      return { type: 'link', content: linkMatch[2], meta: { href: linkMatch[3] } }
    }

    // No special patterns, treat as text
    if (text.length > 0) {
      const nextSpecial = this.findNextSpecial(text)
      if (nextSpecial > 0) {
        const content = text.slice(0, nextSpecial)
        this.state.buffer = this.state.buffer.slice(content.length)
        return { type: 'text', content }
      } else if (nextSpecial === 0) {
        // Special char at start but no match - consume one char as text
        this.state.buffer = this.state.buffer.slice(1)
        return { type: 'text', content: text[0] }
      }
    }

    return null
  }

  private findNextSpecial(text: string): number {
    const patterns = [/\*\*/, /\*(?!\*)/, /~~/, /`/, /\[.*?\]\(.*?\)/]
    let minIdx = -1
    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match && match.index !== undefined) {
        if (minIdx === -1 || match.index < minIdx) {
          minIdx = match.index
        }
      }
    }
    return minIdx
  }

  private parseInlineLine(line: string): MarkdownToken {
    // For complete lines, parse all inline elements
    const tokens: MarkdownToken[] = []
    let remaining = line

    while (remaining.length > 0) {
      const token = this.parseInline(remaining)
      if (token) {
        tokens.push(token)
        // Remove consumed part from remaining
        const consumed = this.getConsumedLength(token, remaining)
        if (consumed > 0) {
          remaining = remaining.slice(consumed)
        } else {
          break
        }
      } else {
        break
      }
    }

    if (tokens.length === 0) {
      return { type: 'text', content: line }
    }

    if (tokens.length === 1) {
      return tokens[0]
    }

    // Return combined token for simplicity
    return {
      type: 'text',
      content: tokens.map((t) => t.content).join(''),
    }
  }

  private getConsumedLength(token: MarkdownToken, text: string): number {
    switch (token.type) {
      case 'code_inline':
        return text.indexOf('`') + 1 + token.content.length + 1
      case 'bold':
        return text.indexOf('**') + 2 + token.content.length + 2
      case 'italic':
        return text.indexOf('*') + 1 + token.content.length + 1
      case 'strikethrough':
        return text.indexOf('~~') + 2 + token.content.length + 2
      case 'link':
        const linkStart = text.indexOf('[')
        const linkEnd = text.indexOf(')', linkStart)
        return linkEnd - linkStart + 1
      default:
        return token.content.length
    }
  }
}
