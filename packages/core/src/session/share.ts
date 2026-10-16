import type { SessionEvent } from '../events'
import { type ExportResult, exportSession } from './export'

export interface ShareOptions {
  baseDir: string
  sessionId: string
  githubToken: string
  title?: string
  anonymize?: boolean
}

export interface ShareResult {
  url: string
  gistId: string
  exported: ExportResult
}

const SENSITIVE_PATTERNS = [
  /(?:api[_-]?key|apikey)["']?\s*[:=]\s*["']?[A-Za-z0-9\-_.]+["']?/gi,
  /(?:token|auth|bearer)["']?\s*[:=]\s*["']?[A-Za-z0-9\-_.]+["']?/gi,
  /(?:secret|password|passwd|pwd)["']?\s*[:=]\s*["']?[A-Za-z0-9\-_.]+["']?/gi,
  /sk-[A-Za-z0-9]{20,}/g,
  /ghp_[A-Za-z0-9]{36}/g,
  /gho_[A-Za-z0-9]{36}/g,
  /xox[baprs]-[A-Za-z0-9\-]{10,}/g,
  /(?:AWS|aws)[_-]?(?:ACCESS|SECRET)[_-]?(?:KEY|ID)["']?\s*[:=]\s*["']?[A-Za-z0-9/+=\-_.]+["']?/gi,
]

const CONTEXT_STRIP_PATTERNS = [/(?:\/home\/|\/Users\/)[^\s\/]+/g, /(?:C:\\Users\\|C:\\)[^\s\\]+/g]

export function sanitizeContent(content: string, anonymize = true): string {
  let sanitized = content

  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]')
  }

  if (anonymize) {
    for (const pattern of CONTEXT_STRIP_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[USER]')
    }
  }

  return sanitized
}

export function sanitizeEvents(events: SessionEvent[], anonymize = true): SessionEvent[] {
  return events.map((event) => {
    if (event.type === 'session.message') {
      return {
        ...event,
        payload: {
          ...event.payload,
          content: sanitizeContent(event.payload.content, anonymize),
        },
      }
    }

    if (event.type === 'session.tool_call') {
      const sanitized = sanitizeContent(JSON.stringify(event.payload.args), anonymize)
      let args = event.payload.args
      try {
        args = JSON.parse(sanitized)
      } catch {
        // Sanitization must fail closed: never hand back unsanitized arguments.
        args = { redacted: true }
      }
      return {
        ...event,
        payload: {
          ...event.payload,
          args,
        },
      }
    }

    if (event.type === 'session.tool_result') {
      return {
        ...event,
        payload: {
          ...event.payload,
          result:
            typeof event.payload.result === 'string'
              ? sanitizeContent(event.payload.result, anonymize)
              : event.payload.result,
        },
      }
    }

    return event
  })
}

export async function shareSession(options: ShareOptions): Promise<ShareResult> {
  const exported = await exportSession({
    baseDir: options.baseDir,
    sessionId: options.sessionId,
    format: 'markdown',
    includeMetadata: true,
    includeToolCalls: true,
    includeErrors: true,
  })

  const sanitizedContent = sanitizeContent(exported.content, options.anonymize ?? true)

  const title = options.title ?? `Forge Session: ${options.sessionId}`

  const response = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.githubToken}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      description: title,
      public: false,
      files: {
        'session.md': {
          content: sanitizedContent,
        },
      },
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`GitHub API error: ${response.status} ${response.statusText} - ${errorBody}`)
  }

  const gist = (await response.json()) as { id: string; html_url: string }

  return {
    url: gist.html_url,
    gistId: gist.id,
    exported,
  }
}
