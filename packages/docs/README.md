# @forge/docs

The forge documentation site, built with VitePress (Phase 152).

- Content source: `src/` (Markdown)
- Config: `src/.vitepress/config.mts`
- Build: `bun run build` — first runs `src/generate-cli-reference.ts`
  (regenerates `src/reference/cli.md` from the live `forge --help` output),
  then emits static HTML into `src/.vitepress/dist`.
- Test: `bun test` — content/nav integrity checks.

Deployed under `<pages-site>/docs/` by the root `docs-pages.yml` workflow
(the site root hosts the landing page, `/plugins/` hosts generated plugin docs).
