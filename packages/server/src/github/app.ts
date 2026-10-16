/**
 * GitHub App orchestration (Phase 142): verify the webhook, decide whether it
 * is a review trigger, run forge's deterministic Phase-133 review on the PR
 * diff (fetched via the GitHub API), and post the Phase-136 report as a PR
 * comment. Never throws - every failure is an outcome object.
 */

import { formatReviewReport, reviewDiff } from '@forge/git'
import { type InstallationTokenResult, createInstallationToken } from './auth'
import { type TriggerOptions, parseWebhookTrigger, verifyWebhookSignature } from './webhook'

export interface GitHubAppOptions extends TriggerOptions {
  /** Webhook secret configured on the app (signature verification). */
  webhookSecret: string
  /** GitHub App id - with `privateKeyPem` enables installation tokens. */
  appId?: string | number
  /** App private key (PEM) used to sign app JWTs. */
  privateKeyPem?: string
  /** Static token fallback (development / PAT-style usage). */
  token?: string
  /** Custom fetch (tests). */
  fetchImpl?: typeof fetch
  /** GitHub API base (default `https://api.github.com`; override for GHE). */
  apiBase?: string
  /** Clock override for JWT tests. */
  now?: () => number
}

export type WebhookOutcome =
  | { status: 'ignored'; reason: string }
  | { status: 'rejected'; reason: string }
  | { status: 'reviewed'; owner: string; repo: string; prNumber: number }
  | { status: 'failed'; error: string }

export interface WebhookInput {
  eventName: string
  signature: string | undefined
  rawBody: string
}

export class GitHubApp {
  private readonly options: GitHubAppOptions
  private readonly fetchImpl: typeof fetch
  private readonly apiBase: string

  constructor(options: GitHubAppOptions) {
    this.options = options
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    this.apiBase = (options.apiBase ?? 'https://api.github.com').replace(/\/+$/, '')
  }

  async handleWebhook(input: WebhookInput): Promise<WebhookOutcome> {
    if (!verifyWebhookSignature(this.options.webhookSecret, input.rawBody, input.signature)) {
      return { status: 'rejected', reason: 'invalid webhook signature' }
    }

    let payload: unknown
    try {
      payload = JSON.parse(input.rawBody)
    } catch {
      return { status: 'failed', error: 'unparseable webhook payload' }
    }

    const trigger = parseWebhookTrigger(input.eventName, payload, {
      ...(this.options.label !== undefined ? { label: this.options.label } : {}),
      ...(this.options.command !== undefined ? { command: this.options.command } : {}),
    })
    if (trigger.kind === 'ignored') return { status: 'ignored', reason: trigger.reason }

    const token = await this.resolveToken(trigger.installationId)
    if (!token.ok) return { status: 'failed', error: token.error }

    const diff = await this.fetchDiff(trigger.owner, trigger.repo, trigger.prNumber, token.token)
    if (!diff.ok) return { status: 'failed', error: diff.error }

    const comment = `${formatReviewReport(reviewDiff(diff.diff), trigger.prNumber)}\n\n<sub>Posted by forge (GitHub App review).</sub>`
    const posted = await this.postComment(
      trigger.owner,
      trigger.repo,
      trigger.prNumber,
      token.token,
      comment,
    )
    if (!posted.ok) return { status: 'failed', error: posted.error }

    return {
      status: 'reviewed',
      owner: trigger.owner,
      repo: trigger.repo,
      prNumber: trigger.prNumber,
    }
  }

  private async resolveToken(installationId: number | undefined): Promise<InstallationTokenResult> {
    if (this.options.token !== undefined && this.options.token.length > 0) {
      return { ok: true, token: this.options.token }
    }
    if (
      this.options.appId !== undefined &&
      this.options.privateKeyPem !== undefined &&
      installationId !== undefined
    ) {
      return createInstallationToken({
        appId: this.options.appId,
        privateKeyPem: this.options.privateKeyPem,
        installationId,
        fetchImpl: this.fetchImpl,
        ...(this.options.apiBase !== undefined ? { apiBase: this.options.apiBase } : {}),
        ...(this.options.now !== undefined ? { nowMs: this.options.now() } : {}),
      })
    }
    return {
      ok: false,
      error: 'no GitHub credentials configured (set appId + privateKeyPem, or token)',
    }
  }

  private async fetchDiff(
    owner: string,
    repo: string,
    prNumber: number,
    token: string,
  ): Promise<{ ok: true; diff: string } | { ok: false; error: string }> {
    try {
      const response = await this.fetchImpl(
        `${this.apiBase}/repos/${owner}/${repo}/pulls/${prNumber}`,
        {
          headers: {
            Accept: 'application/vnd.github.v3.diff',
            Authorization: `Bearer ${token}`,
            'User-Agent': 'forge',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      )
      if (!response.ok) return { ok: false, error: `diff fetch failed [${response.status}]` }
      return { ok: true, diff: await response.text() }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  private async postComment(
    owner: string,
    repo: string,
    prNumber: number,
    token: string,
    body: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const response = await this.fetchImpl(
        `${this.apiBase}/repos/${owner}/${repo}/issues/${prNumber}/comments`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'forge',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({ body }),
        },
      )
      if (!response.ok) return { ok: false, error: `comment post failed [${response.status}]` }
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}
