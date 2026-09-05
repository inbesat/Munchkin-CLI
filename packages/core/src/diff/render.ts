import { createHighlighter, Highlighter } from 'shiki'
import { DiffResultStructured, formatDiff } from './compute'

/** Render options. */
export interface RenderDiffOptions {
  /** Language for syntax highlighting. */
  language?: string
  /** Theme for syntax highlighting. */
  theme?: string
  /** Include line numbers. */
  lineNumbers?: boolean
  /** Output format. */
  format?: 'ansi' | 'html'
}

/** Default render options. */
const DEFAULT_RENDER_OPTIONS: Required<RenderDiffOptions> = {
  language: 'typescript',
  theme: 'github-dark',
  lineNumbers: true,
  format: 'ansi',
}

/** Lazy-initialized highlighter. */
let highlighterPromise: Promise<Highlighter> | null = null

/** Get or create the shiki highlighter. */
async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-dark', 'github-light', 'monokai', 'dracula'],
      langs: [
        'typescript',
        'javascript',
        'python',
        'rust',
        'go',
        'java',
        'cpp',
        'c',
        'json',
        'yaml',
        'markdown',
        'html',
        'css',
        'bash',
        'shell',
        'sql',
        'toml',
        'xml',
      ],
    })
  }
  return highlighterPromise
}

/** ANSI color codes. */
const ANSI = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
}

/** Apply simple ANSI colors to diff lines. */
function colorizeDiffLine(line: string): string {
  if (line.startsWith('--- ') || line.startsWith('+++ ')) {
    return `${ANSI.cyan}${line}${ANSI.reset}`
  }
  if (line.startsWith('@@ ')) {
    return `${ANSI.yellow}${line}${ANSI.reset}`
  }
  if (line.length > 0) {
    const prefix = line[0]
    const content = line.slice(1)
    if (prefix === '+') {
      return `${ANSI.green}${prefix}${content}${ANSI.reset}`
    }
    if (prefix === '-') {
      return `${ANSI.red}${prefix}${content}${ANSI.reset}`
    }
    if (prefix === ' ') {
      return `${ANSI.gray}${prefix}${content}${ANSI.reset}`
    }
  }
  return line
}

/** Render a diff with simple ANSI colors (no syntax highlighting for now). */
export async function renderDiff(
  diff: DiffResultStructured,
  options: RenderDiffOptions = {},
): Promise<string> {
  const opts = { ...DEFAULT_RENDER_OPTIONS, ...options }
  const { format } = opts

  // First, get the base formatted diff
  const formatted = formatDiff(diff)

  if (format === 'html') {
    return renderHtmlDiff(diff, opts.language, opts.theme, opts.lineNumbers)
  }

  // For ANSI, apply simple color coding to diff lines
  const lines = formatted.split('\n')
  const colored = lines.map(colorizeDiffLine)
  return colored.join('\n')
}

/** Render diff as HTML with syntax highlighting using shiki. */
async function renderHtmlDiff(
  diff: DiffResultStructured,
  language: string,
  theme: string,
  lineNumbers: boolean,
): Promise<string> {
  const highlighter = await getHighlighter()
  const htmlLines: string[] = ['<pre class="diff">']

  for (const hunk of diff.hunks) {
    htmlLines.push(`<div class="diff-hunk">`)
    htmlLines.push(`<div class="diff-header">@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@</div>`)

    for (const line of hunk.lines) {
      const classes = ['diff-line', `diff-${line.type}`]
      const numClass = lineNumbers ? 'diff-line-num' : ''

      let content = line.content
      if (content.trim().length > 0) {
        try {
          content = highlighter.codeToHtml(content, { lang: language, theme } as { lang: string; theme: string })
        } catch {
          // Fallback to escaped text
          content = escapeHtml(content)
        }
      } else {
        content = escapeHtml(content)
      }

      const oldNum = line.oldLineNumber ? `<span class="${numClass}">${line.oldLineNumber}</span>` : ''
      const newNum = line.newLineNumber ? `<span class="${numClass}">${line.newLineNumber}</span>` : ''

      htmlLines.push(
        `<div class="${classes.join(' ')}"><span class="diff-old-num">${oldNum}</span><span class="diff-new-num">${newNum}</span>${content}</div>`,
      )
    }

    htmlLines.push('</div>')
  }

  htmlLines.push('</pre>')
  return htmlLines.join('\n')
}

/** Escape HTML special characters. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&apos;')
}

/** Detect language from file extension. */
export function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    c: 'c',
    h: 'c',
    hpp: 'cpp',
    json: 'json',
    yml: 'yaml',
    yaml: 'yaml',
    md: 'markdown',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    sh: 'bash',
    bash: 'bash',
    sql: 'sql',
    toml: 'toml',
    xml: 'xml',
  }
  return ext ? map[ext] ?? 'text' : 'text'
}

/** Render diff with auto-detected language. */
export async function renderDiffAuto(
  diff: DiffResultStructured,
  filePath: string,
  options: Omit<RenderDiffOptions, 'language'> = {},
): Promise<string> {
  const language = detectLanguage(filePath)
  return renderDiff(diff, { ...options, language })
}

/** Quick diff and render in one call. */
export async function diffAndRender(
  oldContent: string,
  newContent: string,
  filePath: string,
  options: RenderDiffOptions & { computeOptions?: import('./compute').ComputeDiffOptions } = {},
): Promise<string> {
  const { computeDiff } = await import('./compute')
  const computeOptions = options.computeOptions ?? {}
  const diff = computeDiff(oldContent, newContent, computeOptions)
  return renderDiffAuto(diff, filePath, options)
}