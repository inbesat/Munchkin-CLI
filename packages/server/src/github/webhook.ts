/**
 * Webhook verification + trigger parsing (Phase 142) - pure functions.
 *
 * GitHub signs every webhook delivery with HMAC-SHA256 over the raw body
 * (`X-Hub-Signature-256: sha256=<hex>`). A review is requested either by
 * adding the trigger label to a pull request or by commenting the trigger
 * command on one; everything else parses to an `ignored` reason.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export const DEFAULT_TRIGGER_LABEL = 'forge-review'
export const DEFAULT_TRIGGER_COMMAND = '/forge review'

/** Timing-safe HMAC-SHA256 check of `X-Hub-Signature-256`. Never throws. */
export function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | undefined,
): boolean {
  if (secret.length === 0 || signatureHeader === undefined) return false
  const match = /^sha256=([0-9a-f]{64})$/i.exec(signatureHeader.trim())
  if (match === null) return false
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest()
  const presented = Buffer.from(match[1], 'hex')
  return presented.length === expected.length && timingSafeEqual(presented, expected)
}

export interface ReviewTrigger {
  kind: 'review'
  owner: string
  repo: string
  prNumber: number
  installationId: number | undefined
  source: 'label' | 'comment'
  requestedBy: string | undefined
}

export type TriggerParse = ReviewTrigger | { kind: 'ignored'; reason: string }

export interface TriggerOptions {
  /** Label that requests a review (default `forge-review`). */
  label?: string
  /** Comment prefix that requests a review (default `/forge review`). */
  command?: string
}

export function parseWebhookTrigger(
  eventName: string,
  payload: unknown,
  options: TriggerOptions = {},
): TriggerParse {
  if (typeof payload !== 'object' || payload === null) {
    return { kind: 'ignored', reason: 'payload is not an object' }
  }
  const data = payload as Record<string, unknown>
  const label = options.label ?? DEFAULT_TRIGGER_LABEL
  const command = options.command ?? DEFAULT_TRIGGER_COMMAND

  if (eventName === 'pull_request') {
    if (data.action !== 'labeled') {
      return {
        kind: 'ignored',
        reason: `pull_request action '${String(data.action)}' is not a trigger`,
      }
    }
    const applied = (data.label as { name?: unknown } | undefined)?.name
    if (applied !== label) {
      return { kind: 'ignored', reason: `label '${String(applied)}' is not the trigger label` }
    }
    return buildTrigger(data, 'label', readPrNumber(data.pull_request))
  }

  if (eventName === 'issue_comment') {
    if (data.action !== 'created') {
      return {
        kind: 'ignored',
        reason: `issue_comment action '${String(data.action)}' is not a trigger`,
      }
    }
    const issue = data.issue as { number?: unknown; pull_request?: unknown } | undefined
    if (issue === undefined || issue.pull_request === undefined) {
      return { kind: 'ignored', reason: 'comment is not on a pull request' }
    }
    const body = (data.comment as { body?: unknown } | undefined)?.body
    if (typeof body !== 'string' || !body.trim().startsWith(command)) {
      return { kind: 'ignored', reason: `comment does not start with '${command}'` }
    }
    return buildTrigger(data, 'comment', readPrNumber(issue))
  }

  return { kind: 'ignored', reason: `event '${eventName}' is not handled` }
}

function buildTrigger(
  data: Record<string, unknown>,
  source: 'label' | 'comment',
  prNumber: number | undefined,
): TriggerParse {
  const repo = readRepo(data)
  if (prNumber === undefined || repo === undefined) {
    return { kind: 'ignored', reason: 'missing pull request or repository in payload' }
  }
  return {
    kind: 'review',
    owner: repo.owner,
    repo: repo.repo,
    prNumber,
    installationId: readInstallationId(data),
    source,
    requestedBy: readLogin(data.sender),
  }
}

function readPrNumber(source: unknown): number | undefined {
  const number = (source as { number?: unknown } | undefined)?.number
  return typeof number === 'number' && Number.isInteger(number) && number > 0 ? number : undefined
}

function readRepo(data: Record<string, unknown>): { owner: string; repo: string } | undefined {
  const fullName = (data.repository as { full_name?: unknown } | undefined)?.full_name
  if (typeof fullName !== 'string') return undefined
  const [owner, repo] = fullName.split('/')
  if (owner === undefined || owner.length === 0 || repo === undefined || repo.length === 0)
    return undefined
  return { owner, repo }
}

function readInstallationId(data: Record<string, unknown>): number | undefined {
  const id = (data.installation as { id?: unknown } | undefined)?.id
  return typeof id === 'number' ? id : undefined
}

function readLogin(sender: unknown): string | undefined {
  const login = (sender as { login?: unknown } | undefined)?.login
  return typeof login === 'string' ? login : undefined
}
