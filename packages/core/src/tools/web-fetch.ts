import { Type } from '@sinclair/typebox'
import { ErrorCode, ToolError } from '../errors'
import type { Tool, ToolResult } from './types'

/** Default timeout for web fetch (30 seconds). */
const DEFAULT_TIMEOUT_MS = 30_000

/** Default max content length before truncation (500KB). */
const DEFAULT_MAX_LENGTH = 500_000

/** WebFetch input schema. */
export const WebFetchSchema = Type.Object({
  url: Type.String({ format: 'uri', description: 'URL to fetch' }),
  timeout: Type.Optional(
    Type.Integer({ minimum: 1000, maximum: 120_000, description: 'Timeout in milliseconds' }),
  ),
  maxLength: Type.Optional(
    Type.Integer({
      minimum: 1000,
      maximum: 5_000_000,
      description: 'Max response bytes before truncation',
    }),
  ),
})

/** WebFetch output metadata. */
export interface WebFetchResult extends ToolResult {
  metadata?: {
    url: string
    status: number
    contentType: string
    length: number
    truncated: boolean
    fetchTimeMs: number
  }
}

/** Simple HTML-to-Markdown converter. Handles common elements. */
export function htmlToMarkdown(html: string): string {
  let md = html

  // Remove script/style/noscript/iframe content entirely
  md = md.replace(/<(script|style|noscript|iframe)[^>]*>[\s\S]*?<\/\1>/gi, '')

  // Remove comments
  md = md.replace(/<!--[\s\S]*?-->/g, '')

  // Headers
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n\n')
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n\n')
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n\n')
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '#### $1\n\n')
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '##### $1\n\n')
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '###### $1\n\n')

  // Paragraphs
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n')

  // Bold
  md = md.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
  // Italic
  md = md.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
  // Inline code
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')

  // Code blocks
  md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```\n\n')
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '```\n$1\n```\n\n')

  // Links
  md = md.replace(/<a[^>]*href=(['"])([^'"]+)\1[^>]*>([\s\S]*?)<\/a>/gi, '[$3]($2)')

  // Images
  md = md.replace(/<img[^>]*src=(['"])([^'"]+)\1[^>]*alt=(['"])([^'"]+)\3[^>]*>/gi, '![$4]($2)')
  md = md.replace(/<img[^>]*alt=(['"])([^'"]+)\1[^>]*src=(['"])([^'"]+)\3[^>]*>/gi, '![$2]($4)')
  md = md.replace(/<img[^>]*src=(['"])([^'"]+)\1[^>]*>/gi, '![]($2)')

  // Lists
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_m: string, inner: string) => {
    return `${inner.replace(
      /<li[^>]*>([\s\S]*?)<\/li>/gi,
      (_m: string, content: string) => `- ${content}\n`,
    )}\n`
  })
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_m: string, inner: string) => {
    let i = 0
    return `${inner.replace(
      /<li[^>]*>([\s\S]*?)<\/li>/gi,
      (_m: string, content: string) => `${++i}. ${content}\n`,
    )}\n`
  })

  // Blockquotes
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m: string, inner: string) => {
    return `${inner
      .split('\n')
      .map((l: string) => `> ${l.trim()}`)
      .join('\n')}\n\n`
  })

  // Horizontal rule
  md = md.replace(/<hr[^>]*>/gi, '---\n\n')

  // Line breaks
  md = md.replace(/<br[^>]*>/gi, '\n')

  // Div/section/article - just unwrap
  md = md.replace(/<\/(div|section|article|main|header|footer|nav|aside)>/gi, '\n\n')
  md = md.replace(/<(div|section|article|main|header|footer|nav|aside)[^>]*>/gi, '')

  // Strip remaining tags
  md = md.replace(/<[^>]+>/g, '')

  // Decode common HTML entities
  md = md
    .replace(/&nbsp;/g, ' ')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&copy;/g, '©')
    .replace(/&reg;/g, '®')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')

  // Normalize whitespace
  md = md.replace(/[ \t]+/g, ' ')
  md = md.replace(/\n{3,}/g, '\n\n')
  md = md.trim()

  return md
}

/** Create the WebFetch tool. */
export function createWebFetchTool(): Tool {
  return {
    name: 'webFetch',
    description:
      'Fetch a URL and return its content as markdown. Supports timeout and automatic truncation for large pages.',
    parameters: WebFetchSchema,
    scope: 'builtin',
    risk: 'medium',
    requiresPermission: true,
    async execute(input: Record<string, unknown>, signal?: AbortSignal): Promise<WebFetchResult> {
      const {
        url,
        timeout = DEFAULT_TIMEOUT_MS,
        maxLength = DEFAULT_MAX_LENGTH,
      } = input as {
        url: string
        timeout?: number
        maxLength?: number
      }

      if (signal?.aborted) {
        throw new ToolError(ErrorCode.CANCELLED, 'WebFetch cancelled', 'webFetch')
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      // Link external abort signal
      const abortHandler = () => controller.abort()
      signal?.addEventListener('abort', abortHandler, { once: true })

      const start = Date.now()

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'forge-web-fetch/1.0 (+https://github.com/forge)',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        })

        clearTimeout(timeoutId)
        signal?.removeEventListener('abort', abortHandler)

        if (!response.ok) {
          throw new ToolError(
            ErrorCode.TOOL_EXECUTION_FAILED,
            `HTTP ${response.status}: ${response.statusText}`,
            'webFetch',
          )
        }

        const contentType = response.headers.get('content-type') ?? 'unknown'
        const isHtml =
          contentType.includes('text/html') || contentType.includes('application/xhtml')

        // Read body with length limit
        const reader = response.body?.getReader()
        if (!reader) {
          throw new ToolError(ErrorCode.TOOL_EXECUTION_FAILED, 'No response body', 'webFetch')
        }

        const chunks: Uint8Array[] = []
        let totalLength = 0
        let truncated = false

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          totalLength += value.length
          if (totalLength > maxLength) {
            truncated = true
            // Only keep up to maxLength
            const excess = totalLength - maxLength
            const keep = value.length - excess
            if (keep > 0) chunks.push(value.slice(0, keep))
            break
          }
          chunks.push(value)
        }

        const fetchTimeMs = Date.now() - start
        const body = Buffer.concat(chunks).toString('utf8')

        let output: string
        if (isHtml) {
          output = htmlToMarkdown(body)
        } else {
          // For non-HTML, return as-is (could be JSON, plain text, etc.)
          output = body
        }

        if (truncated) {
          output += `\n\n---\n*[Response truncated at ${maxLength} bytes]*`
        }

        return {
          success: true,
          output,
          metadata: {
            url,
            status: response.status,
            contentType,
            length: totalLength,
            truncated,
            fetchTimeMs,
          },
        }
      } catch (err) {
        clearTimeout(timeoutId)
        signal?.removeEventListener('abort', abortHandler)

        if (err instanceof ToolError) throw err

        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new ToolError(
            ErrorCode.TIMEOUT,
            `WebFetch timed out after ${timeout}ms`,
            'webFetch',
          )
        }

        if (err instanceof TypeError && err.message.includes('fetch')) {
          throw new ToolError(
            ErrorCode.TOOL_EXECUTION_FAILED,
            `Network error: ${err.message}`,
            'webFetch',
          )
        }

        throw new ToolError(
          ErrorCode.TOOL_EXECUTION_FAILED,
          `WebFetch failed: ${err instanceof Error ? err.message : String(err)}`,
          'webFetch',
        )
      }
    },
  }
}

/** Default tool instance. */
export const webFetchTool = createWebFetchTool()
