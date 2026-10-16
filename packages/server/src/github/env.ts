/**
 * Environment wiring for `forge serve` (Phase 142). The webhook route is
 * mounted only when GITHUB_WEBHOOK_SECRET is present; app id + private key
 * enable installation tokens, GITHUB_TOKEN is a static fallback.
 */

import * as fs from 'node:fs'
import { GitHubApp } from './app'

export function createGitHubAppFromEnv(
  env: Record<string, string | undefined>,
): GitHubApp | undefined {
  const webhookSecret = env.GITHUB_WEBHOOK_SECRET
  if (webhookSecret === undefined || webhookSecret.length === 0) return undefined

  const appId = env.GITHUB_APP_ID
  const privateKeyPem = readPrivateKey(env)
  const token = env.GITHUB_TOKEN
  return new GitHubApp({
    webhookSecret,
    ...(appId !== undefined && appId.length > 0 ? { appId } : {}),
    ...(privateKeyPem !== undefined ? { privateKeyPem } : {}),
    ...(token !== undefined && token.length > 0 ? { token } : {}),
  })
}

function readPrivateKey(env: Record<string, string | undefined>): string | undefined {
  const inline = env.GITHUB_APP_PRIVATE_KEY
  if (inline !== undefined && inline.length > 0) return inline
  const keyPath = env.GITHUB_APP_PRIVATE_KEY_PATH
  if (keyPath === undefined || keyPath.length === 0) return undefined
  try {
    return fs.readFileSync(keyPath, 'utf-8')
  } catch {
    return undefined
  }
}
