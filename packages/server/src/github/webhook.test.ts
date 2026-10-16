import { describe, expect, it } from 'bun:test'
import { createHmac } from 'node:crypto'
import {
  DEFAULT_TRIGGER_COMMAND,
  DEFAULT_TRIGGER_LABEL,
  parseWebhookTrigger,
  verifyWebhookSignature,
} from './webhook'

const sign = (secret: string, body: string): string =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`

const labelPayload = () => ({
  action: 'labeled',
  label: { name: DEFAULT_TRIGGER_LABEL },
  pull_request: { number: 42 },
  repository: { full_name: 'acme/widgets' },
  installation: { id: 7 },
  sender: { login: 'alice' },
})

describe('verifyWebhookSignature (Phase 142)', () => {
  it('accepts a correct signature and rejects everything else', () => {
    const body = '{"hello":"world"}'
    expect(verifyWebhookSignature('secret', body, sign('secret', body))).toBe(true)
    expect(verifyWebhookSignature('secret', body, sign('other', body))).toBe(false)
    expect(verifyWebhookSignature('secret', body, undefined)).toBe(false)
    expect(verifyWebhookSignature('secret', body, 'sha1=abcdef')).toBe(false)
    expect(verifyWebhookSignature('secret', body, 'sha256=deadbeef')).toBe(false)
    expect(verifyWebhookSignature('secret', `${body} `, sign('secret', body))).toBe(false)
    expect(verifyWebhookSignature('', body, sign('', body))).toBe(false)
  })
})

describe('parseWebhookTrigger (Phase 142)', () => {
  it('label added: produces a review trigger with repo, PR, and installation', () => {
    expect(parseWebhookTrigger('pull_request', labelPayload())).toEqual({
      kind: 'review',
      owner: 'acme',
      repo: 'widgets',
      prNumber: 42,
      installationId: 7,
      source: 'label',
      requestedBy: 'alice',
    })
  })

  it('ignores pull_request events that are not the trigger label', () => {
    const opened = { ...labelPayload(), action: 'opened' }
    expect(parseWebhookTrigger('pull_request', opened)).toEqual({
      kind: 'ignored',
      reason: "pull_request action 'opened' is not a trigger",
    })
    const otherLabel = { ...labelPayload(), label: { name: 'bug' } }
    expect(parseWebhookTrigger('pull_request', otherLabel)).toEqual({
      kind: 'ignored',
      reason: "label 'bug' is not the trigger label",
    })
  })

  it('comment command on a PR: produces a comment-sourced review trigger', () => {
    const payload = {
      action: 'created',
      issue: { number: 9, pull_request: { url: 'https://api.github.com/...' } },
      comment: { body: `${DEFAULT_TRIGGER_COMMAND}\nplease take a look` },
      repository: { full_name: 'acme/widgets' },
      installation: { id: 7 },
      sender: { login: 'bob' },
    }
    expect(parseWebhookTrigger('issue_comment', payload)).toEqual({
      kind: 'review',
      owner: 'acme',
      repo: 'widgets',
      prNumber: 9,
      installationId: 7,
      source: 'comment',
      requestedBy: 'bob',
    })
  })

  it('ignores comments that are not the trigger command or not on a PR', () => {
    const base = {
      action: 'created',
      issue: { number: 9, pull_request: {} },
      comment: { body: 'nice work!' },
      repository: { full_name: 'acme/widgets' },
    }
    expect(parseWebhookTrigger('issue_comment', base)).toEqual({
      kind: 'ignored',
      reason: `comment does not start with '${DEFAULT_TRIGGER_COMMAND}'`,
    })
    const plainIssue = { ...base, comment: { body: DEFAULT_TRIGGER_COMMAND }, issue: { number: 9 } }
    expect(parseWebhookTrigger('issue_comment', plainIssue)).toEqual({
      kind: 'ignored',
      reason: 'comment is not on a pull request',
    })
  })

  it('ignores unhandled events and malformed payloads', () => {
    expect(parseWebhookTrigger('push', {})).toEqual({
      kind: 'ignored',
      reason: "event 'push' is not handled",
    })
    expect(parseWebhookTrigger('pull_request', null)).toEqual({
      kind: 'ignored',
      reason: 'payload is not an object',
    })
    const noPr = { ...labelPayload(), pull_request: undefined }
    expect(parseWebhookTrigger('pull_request', noPr)).toEqual({
      kind: 'ignored',
      reason: 'missing pull request or repository in payload',
    })
  })

  it('honors custom label and command options', () => {
    const custom = { ...labelPayload(), label: { name: 'custom-label' } }
    const parsed = parseWebhookTrigger('pull_request', custom, { label: 'custom-label' })
    expect(parsed.kind).toBe('review')

    const comment = {
      action: 'created',
      issue: { number: 3, pull_request: {} },
      comment: { body: '/bot review' },
      repository: { full_name: 'acme/widgets' },
    }
    expect(parseWebhookTrigger('issue_comment', comment, { command: '/bot review' }).kind).toBe(
      'review',
    )
  })
})
