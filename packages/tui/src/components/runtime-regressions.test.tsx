import { describe, expect, it } from 'bun:test'
import { PassThrough } from 'node:stream'
import { render } from 'ink'
import type { ReactNode } from 'react'
import { ThemeProvider, darkTheme } from '../theme'
import { Markdown, StreamingMarkdown } from './markdown'
import { ToastContainer, type Toast } from './toast'

function mount(node: ReactNode) {
  let output = ''
  const stdout = Object.assign(new PassThrough(), { columns: 100, rows: 40, isTTY: true })
  stdout.on('data', (chunk) => { output += chunk.toString() })
  const instance = render(<ThemeProvider>{node}</ThemeProvider>, { stdout, debug: true })
  return {
    ...instance,
    update: (next: ReactNode) => {
      output = ''
      instance.rerender(<ThemeProvider>{next}</ThemeProvider>)
    },
    output: () => output.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, ''),
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 25))

describe('markdown component lifecycle', () => {
  it('renders final plain text and replaces content instead of accumulating during render', async () => {
    const app = mount(<Markdown content="alpha" />)
    try {
      await settle()
      expect(app.output()).toContain('alpha')
      app.update(<Markdown content="beta" />)
      await settle()
      expect(app.output()).toContain('beta')
      expect(app.output()).not.toContain('alpha')
    } finally { app.unmount() }
  })

  it('appends only new cumulative content, handles replacement and callback changes', async () => {
    let latest = ''
    const capture = (tokens: Array<{ content: string }>) => { latest = tokens.map((t) => t.content).join('') }
    const app = mount(<StreamingMarkdown content={'first\n'} onTokensChange={capture} />)
    try {
      await settle()
      app.update(<StreamingMarkdown content={'first\nsecond\n'} onTokensChange={capture} />)
      await settle()
      expect(latest).toBe('first\nsecond\n')
      app.update(<StreamingMarkdown content={'first\nsecond\n'} onTokensChange={(tokens) => capture(tokens)} />)
      await settle()
      expect(latest).toBe('first\nsecond\n')
      app.update(<StreamingMarkdown content={'replacement\n'} onTokensChange={capture} />)
      await settle()
      expect(latest).toBe('replacement\n')
      app.update(<StreamingMarkdown content="" onTokensChange={capture} />)
      await settle()
      expect(latest).toBe('')
    } finally { app.unmount() }
  })

  it('renders pending text even before a complete token is emitted', async () => {
    const app = mount(<StreamingMarkdown content="pending text" />)
    try {
      await settle()
      expect(app.output()).toContain('pending text')
    } finally { app.unmount() }
  })
})

describe('toast timers', () => {
  it('keeps existing timers alive when another toast or callback is supplied', async () => {
    const dismissed: string[] = []
    const first: Toast = { id: 'first', kind: 'info', message: 'first', duration: 80 }
    const second: Toast = { id: 'second', kind: 'info', message: 'second', duration: 80 }
    const app = mount(<ToastContainer themeColors={darkTheme.colors} toasts={[first]} onDismiss={(id) => dismissed.push(`old:${id}`)} />)
    try {
      await settle()
      app.update(<ToastContainer themeColors={darkTheme.colors} toasts={[first, second]} onDismiss={(id) => dismissed.push(id)} />)
      await new Promise((resolve) => setTimeout(resolve, 150))
      expect(dismissed).toEqual(['first', 'second'])
    } finally { app.unmount() }
  })

  it('cancels timers for removed toasts and on unmount', async () => {
    const dismissed: string[] = []
    const first: Toast = { id: 'first', kind: 'info', message: 'first', duration: 80 }
    const app = mount(<ToastContainer themeColors={darkTheme.colors} toasts={[first]} onDismiss={(id) => dismissed.push(id)} />)
    await settle()
    app.update(<ToastContainer themeColors={darkTheme.colors} toasts={[]} onDismiss={(id) => dismissed.push(id)} />)
    await settle()
    app.unmount()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(dismissed).toEqual([])
  })
})
