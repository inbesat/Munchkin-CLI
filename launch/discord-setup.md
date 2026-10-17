# Discord server setup

Steps to create the forge community server. Server creation and bot invites
require a human Discord account — everything else in this guide is prepared
and validated by [`discord-config.json`](./discord-config.json).

## 1. Create the server

1. Discord → **Add a Server** → **My Own** → name it `forge`.
2. Upload the same icon the repository/landing uses (the monospace "f" mark).
3. Enable **Community** (Server Settings → Enable Community) to unlock the
   welcome screen, rules screening, and discovery eligibility. Accept the
   community guidelines during this flow.

## 2. Apply the structure from `discord-config.json`

Create the roles in the order listed (order = hierarchy), then the categories
and channels. The config is the source of truth for names, colors, topics and
permission intent — an automated test enforces that every channel's topic is
set, every name is unique, and every role referenced by a channel exists
(`bun test scripts/launch-materials.test.ts`).

Role colors are GitHub-dark palette tokens so the server matches the brand.

## 3. Permission intent (map these while creating channels)

| Intent from config | Discord implementation |
| --- | --- |
| `readOnlyFor: ["@everyone"]` | deny **Send Messages** for `@everyone`, allow for maintainers; keep **Add Reactions** on |
| `maintainersOnly: true` | private channel — visible only to the Maintainer role |
| default | everyone can post |

## 4. Rules screening

Use the `rules` array from the config verbatim as the rules-screening entries
(sorted as listed). Do not shorten rule 3 (privacy); it is the public
commitment that matches `docs/privacy.md`.

## 5. Welcome message

Paste `welcomeMessage` from the config into a **Welcome** embed in
`#welcome`, and set it as the system "join message" channel under Community
settings. Keep the two link buttons: **Docs** (the Pages URL) and **GitHub**
(the repo).

## 6. (Optional, later) Review bot

Once the GitHub App workflow is public-interest, invite a reviewer bot into
`#pr-reviews` (maintainersOnly). Do not invite any bot that requests
Administrator. This step is deliberately deferred — no bot is required for
launch.

## 7. Verify (the "test Discord setup" gate)

- Structure check: `bun test scripts/launch-materials.test.ts` (validates the
  config this server was created from).
- Manual check after applying: every listed channel has its topic set; the
  rules screening shows all config rules; a fresh account (test account or
  incite a friend) sees only the public channels and can post in `#general`.
- Fill the invite link into `launch/twitter-thread.md` post 10 and the FAQ
  answer below **only after** the manual check passes.
