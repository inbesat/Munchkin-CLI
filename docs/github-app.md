# GitHub App (Phase 142)

Forge ships a GitHub App skeleton that reviews pull requests when triggered.
It reuses forge's deterministic review engine (Phase 133 `reviewDiff`) and the
Phase 136 report formatter, so the app has no LLM dependency: it fetches the
PR diff via the GitHub API, runs the same checks as the CI integration
(Phase 134), and posts the report as a PR comment.

## Triggers

- `pull_request` event with action `labeled` and the `forge-review` label, or
- an `issue_comment` on a pull request whose body starts with `/forge review`.

Both are configurable via the `label` / `command` options on `GitHubApp`.

## Register the app

`buildAppManifest({ baseUrl })` returns the app definition (permissions:
contents read, issues + pull requests write, metadata read; events:
`pull_request`, `issue_comment`; webhook URL `<baseUrl>/api/github/webhook`).
Use it with GitHub's create-from-manifest flow:

1. Render a form that POSTs `manifest=<JSON>` to
   `https://github.com/settings/apps/new?state=<nonce>`.
2. After creation GitHub redirects to `redirect_url`; read the app id and
   generate a private key in the app's settings.
3. Set a webhook secret in the app's settings.

## Run the webhook

```sh
GITHUB_WEBHOOK_SECRET=<secret> \
GITHUB_APP_ID=<id> \
GITHUB_APP_PRIVATE_KEY_PATH=<path-to-key.pem> \
forge serve --port 3000
```

`forge serve` mounts `POST /api/github/webhook` only when
`GITHUB_WEBHOOK_SECRET` is set. The route is exempt from bearer auth because
every delivery is HMAC-SHA256 signature-verified.

| Variable | Purpose |
| --- | --- |
| `GITHUB_WEBHOOK_SECRET` | Enables the route + signature verification (required) |
| `GITHUB_APP_ID` | App id; with the private key, exchanges app JWTs for installation tokens |
| `GITHUB_APP_PRIVATE_KEY` / `GITHUB_APP_PRIVATE_KEY_PATH` | App private key (PEM), inline or file path |
| `GITHUB_TOKEN` | Static token fallback (development only) |

## Files

- `manifest.ts` — app definition (permissions/events) + manifest builder
- `webhook.ts` — signature verification + trigger parsing (pure functions)
- `auth.ts` — RS256 app JWT + installation token exchange
- `app.ts` — orchestration: verify -> fetch diff -> review -> comment
- `routes.ts` — Hono webhook route (`POST /api/github/webhook`)
- `env.ts` — environment wiring for `forge serve`

## Testing

`bun test src/github` in `packages/server` — unit tests plus an end-to-end
test with a mocked GitHub API. Live verification: install the app on a
repository, add the label to a PR, and expect a forge review comment.
