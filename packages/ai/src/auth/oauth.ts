import { spawn } from 'node:child_process'
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http'
import { AuthFlowError, type AuthProviderName } from './errors'

/** Open the default browser to a URL, best-effort per-platform. */
export function openBrowser(url: string): Promise<void> {
  const platform = process.platform
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open'
  const args =
    platform === 'win32' ? ['/c', 'start', '', url] : platform === 'darwin' ? [url] : [url]
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

function okPage(res: ServerResponse, html: string): void {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(html)
}

export interface ExchangeResult {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  scopes?: string[]
  account?: string
}

export interface BrowserOAuthFlowOptions {
  provider: AuthProviderName
  /** State token binding the callback to this flow instance */
  state: string
  /** Builds the browser URL from the bound redirect URI and state */
  authorizeUrl: (redirectUri: string, state: string) => Promise<string> | string
  /** POSTs the code to the token endpoint and returns the raw payload */
  exchange: (code: string, redirectUri: string) => Promise<unknown>
  /** Turns the raw token payload into the token shape */
  parseTokens: (payload: unknown) => ExchangeResult
  /** Loopback port to bind; 0 picks an ephemeral port (default) */
  port?: number
  /** Seconds without a callback before failing (default 120) */
  timeoutMs?: number
  openBrowserFn?: (url: string) => Promise<void>
  /** Fired once the callback server is listening (test hook / UX) */
  onListening?: (redirectUri: string, state: string) => void
}

type CallbackOutcome =
  | { kind: 'ok'; code: string; state: string }
  | { kind: 'denied' }
  | { kind: 'timeout' }

/**
 * Redirect-style browser OAuth flow. Binds a loopback HTTP server, opens
 * `authorizeUrl(redirectUri, state)` in the default browser, waits for
 * `GET /callback?code=...&state=...`, exchanges the code, and closes the
 * server. The state token rejects cross-instance replay callbacks.
 */
export async function runBrowserOAuthFlow(
  opts: BrowserOAuthFlowOptions,
): Promise<{ tokens: ExchangeResult; redirectUri: string }> {
  if (!opts.state) {
    throw new AuthFlowError(opts.provider, 'invalid_options', 'a non-empty state token is required')
  }
  const open = opts.openBrowserFn ?? openBrowser
  const server = createServer()

  const outcomePromise = new Promise<CallbackOutcome>((resolve) => {
    server.on('request', (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }
      const params = url.searchParams
      if (params.get('error') !== null || params.get('code') === null) {
        okPage(res, '<h1>Authorization failed</h1><p>You may close this tab.</p>')
        resolve({ kind: 'denied' })
        return
      }
      okPage(
        res,
        '<h1>Authorization complete</h1><p>You may close this tab and return to the terminal.</p>',
      )
      resolve({ kind: 'ok', code: params.get('code') ?? '', state: params.get('state') ?? '' })
    })
  })

  const redirectUri = await listen(server, opts.port ?? 0, opts.provider)
  opts.onListening?.(redirectUri, opts.state)
  await open(await opts.authorizeUrl(redirectUri, opts.state))

  const outcome = await Promise.race([
    outcomePromise,
    new Promise<CallbackOutcome>((resolve) =>
      setTimeout(() => resolve({ kind: 'timeout' }), opts.timeoutMs ?? 120_000),
    ),
  ])
  server.close()

  if (outcome.kind === 'timeout') {
    throw new AuthFlowError(
      opts.provider,
      'callback_timeout',
      'Timed out waiting for the OAuth callback',
    )
  }
  if (outcome.kind === 'denied') {
    throw new AuthFlowError(
      opts.provider,
      'authorization_denied',
      'The authorization request was denied',
    )
  }
  if (outcome.state !== opts.state) {
    throw new AuthFlowError(
      opts.provider,
      'callback_timeout',
      'OAuth state mismatch — callback rejected',
    )
  }

  const payload = await opts.exchange(outcome.code, redirectUri)
  return { tokens: opts.parseTokens(payload), redirectUri }
}

function listen(
  server: ReturnType<typeof createServer>,
  port: number,
  provider: AuthProviderName,
): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new AuthFlowError(provider, 'invalid_options', 'unexpected loopback address'))
        return
      }
      resolve(`http://127.0.0.1:${address.port}/callback`)
    })
  })
}
