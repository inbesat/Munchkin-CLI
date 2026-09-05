export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

export interface LogEntry {
  timestamp: string
  level: LogLevel
  scope: string
  message: string
  data?: unknown
  error?: {
    name: string
    code?: string
    message: string
    stack?: string
  }
}

export interface LoggerOptions {
  level?: LogLevel
  scope?: string
  stream?: NodeJS.WriteStream
}

export class Logger {
  private level: LogLevel
  private scope: string
  private stream: NodeJS.WriteStream

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? (process.env.FORGE_LOG_LEVEL as LogLevel) ?? 'info'
    this.scope = options.scope ?? 'forge'
    this.stream = options.stream ?? process.stderr
  }

  child(scope: string): Logger {
    return new Logger({
      level: this.level,
      scope: `${this.scope}:${scope}`,
      stream: this.stream,
    })
  }

  setLevel(level: LogLevel): void {
    this.level = level
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data)
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data)
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data)
  }

  error(message: string, error?: unknown): void {
    if (error instanceof Error) {
      const errWithCode = error as unknown as { code?: string }
      this.log('error', message, {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(errWithCode.code ? { code: errWithCode.code } : {}),
      })
    } else if (error !== undefined) {
      this.log('error', message, error)
    } else {
      this.log('error', message)
    }
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.level]) {
      return
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      scope: this.scope,
      message,
    }

    if (data !== undefined) {
      entry.data = data
    }

    this.stream.write(`${JSON.stringify(entry)}\n`)
  }
}

let defaultLogger: Logger | null = null

export function getLogger(scope?: string): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger()
  }
  return scope ? defaultLogger.child(scope) : defaultLogger
}

export function setDefaultLogger(logger: Logger): void {
  defaultLogger = logger
}
