# Launch materials

Draft launch assets for forge, ready to publish in Phase 154. **Nothing in this
directory is published automatically** — each file is a draft plus the human
steps that still require an account or repository setting.

| File | Purpose | Publish step (human) |
| --- | --- | --- |
| [`show-hn.md`](./show-hn.md) | Show HN post + first comment | Post to news.ycombinator.com |
| [`twitter-thread.md`](./twitter-thread.md) | X/Twitter thread (10 posts) | Post from your account |
| [`reddit-post.md`](./reddit-post.md) | r/LocalLLaMA + r/programming variants | Post per subreddit rules |
| [`discord-setup.md`](./discord-setup.md) | Discord server structure + creation steps | Create the server, apply [`discord-config.json`](./discord-config.json) |
| [`../README.md`](../README.md) | Root repository README with GIFs + badges | Pushed with the repo |

## Pre-flight checklist (do these before posting anything)

1. **Cut the release** — tag `v0.1.0` so `release.yml` publishes the platform
   binaries + `checksums.txt` (every draft links to the Releases page).
2. **TUI repair stream closed** — the drafts describe the interactive TUI as
   preview; do not claim it works until the TUI build is green.
3. **Docs site live** — enable GitHub Pages (source: GitHub Actions) so
   `docs-pages.yml` publishes the landing page + `/docs/` + `/plugins/`
   (all drafts link the docs site).
4. **Discord server created** — run through `discord-setup.md`; the invite link
   is intentionally a placeholder that must be filled in before posting.
5. **Re-verify every link** — run `bun test scripts/launch-materials.test.ts`
   in the repo root; it fails on any broken internal reference, non-https
   external link, unresolved placeholder, or invalid Discord config.

## House rules for all drafts

- No invented benchmarks, no invented user counts, no unshipped features.
- Local models (Ollama) are described as *next*, matching the current resolver.
- The npm package name is documented as pending a rename — binaries and
  package-manager manifests are the shipping channels today.
