/**
 * GitHub App definition (Phase 142).
 *
 * The manifest describes the app GitHub registers: webhook URL, the
 * permissions forge needs (read contents, write PR comments) and the events
 * it subscribes to. `buildAppManifest` returns the JSON used by GitHub's
 * "create app from manifest" flow:
 *
 *   POST https://github.com/settings/apps/new?state=<nonce>
 *   (form field `manifest` = JSON.stringify(buildAppManifest({ baseUrl })))
 */

export const GITHUB_APP_EVENTS = ['pull_request', 'issue_comment'] as const

export const GITHUB_APP_PERMISSIONS = {
  contents: 'read',
  issues: 'write',
  metadata: 'read',
  pull_requests: 'write',
} as const

export interface AppManifestOptions {
  /** Public base URL of the forge server that hosts the webhook. */
  baseUrl: string
  name?: string
  description?: string
  /** Where GitHub redirects after app creation (defaults to baseUrl). */
  redirectUrl?: string
}

export function buildAppManifest(options: AppManifestOptions): Record<string, unknown> {
  const base = options.baseUrl.replace(/\/+$/, '')
  return {
    name: options.name ?? 'forge',
    description:
      options.description ??
      'Forge coding agent: reviews pull requests when the forge-review label is added or `/forge review` is commented.',
    url: base,
    hook_attributes: { url: `${base}/api/github/webhook`, active: true },
    redirect_url: options.redirectUrl ?? base,
    public: false,
    default_permissions: { ...GITHUB_APP_PERMISSIONS },
    default_events: [...GITHUB_APP_EVENTS],
  }
}
