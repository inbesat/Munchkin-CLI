import { describe, expect, it } from 'bun:test'
import { renderChatHtml } from './webview'

describe('chat webview HTML (Phase 141)', () => {
  it('emits a locked-down CSP whose nonce matches the script and style tags', () => {
    const html = renderChatHtml()
    const nonce = html.match(/script-src 'nonce-([a-f0-9]+)'/)?.[1]
    expect(nonce).toBeDefined()
    expect(html).toContain("default-src 'none'")
    expect(html).toContain(`style-src 'nonce-${nonce}'`)
    expect(html).toContain(`<script nonce="${nonce}">`)
    expect(html).toContain(`<style nonce="${nonce}">`)
  })

  it('carries the chat UI: message area, prompt textarea, send button, vscode handshake', () => {
    const html = renderChatHtml()
    expect(html).toContain('id="messages"')
    expect(html).toContain('id="prompt"')
    expect(html).toContain('id="send"')
    expect(html).toContain('acquireVsCodeApi')
    expect(html).toContain("type: 'prompt'")
  })

  it('produces a fresh nonce per render', () => {
    expect(renderChatHtml()).not.toBe(renderChatHtml())
  })
})
