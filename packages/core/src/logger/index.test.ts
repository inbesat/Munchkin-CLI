import { describe, expect, it } from 'bun:test'
import { Logger, getLogger, setDefaultLogger } from './index'

function captureLogs(fn: () => void): string[] {
  const lines: string[] = []
  const mockStream = {
    write: (chunk: string) => {
      lines.push(chunk.trim())
      return true
    },
  } as unknown as NodeJS.WriteStream

  const logger = new Logger({ stream: mockStream })
  setDefaultLogger(logger)

  fn()

  return lines
}

describe('Logger', () => {
  it('outputs valid JSON', () => {
    const lines = captureLogs(() => {
      const log = getLogger()
      log.info('test message')
    })

    expect(lines.length).toBe(1)
    const entry = JSON.parse(lines[0])
    expect(entry.level).toBe('info')
    expect(entry.message).toBe('test message')
    expect(entry.scope).toBe('forge')
    expect(entry.timestamp).toBeDefined()
  })

  it('respects log level filtering', () => {
    const lines = captureLogs(() => {
      const log = getLogger()
      log.setLevel('warn')
      log.debug('should not appear')
      log.info('should not appear')
      log.warn('should appear')
      log.error('should appear')
    })

    expect(lines.length).toBe(2)
    const levels = lines.map((l) => JSON.parse(l).level)
    expect(levels).toEqual(['warn', 'error'])
  })

  it('creates child loggers with scoped names', () => {
    const lines = captureLogs(() => {
      const parent = getLogger()
      const child = parent.child('config')
      child.info('loaded')
    })

    expect(lines.length).toBe(1)
    const entry = JSON.parse(lines[0])
    expect(entry.scope).toBe('forge:config')
  })

  it('includes data in log entry', () => {
    const lines = captureLogs(() => {
      const log = getLogger()
      log.info('processing', { count: 42 })
    })

    expect(lines.length).toBe(1)
    const entry = JSON.parse(lines[0])
    expect(entry.data).toEqual({ count: 42 })
  })

  it('serializes error objects', () => {
    const lines = captureLogs(() => {
      const log = getLogger()
      log.error('something failed', new Error('boom'))
    })

    expect(lines.length).toBe(1)
    const entry = JSON.parse(lines[0])
    expect(entry.data.name).toBe('Error')
    expect(entry.data.message).toBe('boom')
    expect(entry.data.stack).toBeDefined()
  })

  it('getLogger returns singleton by default', () => {
    const a = getLogger()
    const b = getLogger()
    expect(a).toBe(b)
  })

  it('getLogger with scope returns child', () => {
    const lines = captureLogs(() => {
      const log = getLogger('mcp')
      log.info('connected')
    })

    expect(lines.length).toBe(1)
    const entry = JSON.parse(lines[0])
    expect(entry.scope).toBe('forge:mcp')
  })
})
