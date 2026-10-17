# @forge/landing

The forge landing page — a single static Astro page (Phase 152).

- Page: `src/pages/index.astro` (all sections inline, no components)
- Demo GIFs: `public/demos/*.gif` — pre-rendered from real CLI transcripts by
  `scripts/generate-demo-gifs.ts` at the repo root
- Build: `bun run build` → `dist/` (Astro copies `public/` in)
- Test: `bun test` — checks the built page, its demo assets, and link hygiene

Deployed at the **root** of the GitHub Pages artifact by the root
`docs-pages.yml` workflow (docs site under `/docs/`, plugin docs under `/plugins/`).

Note: `src/pages/index.astro` is hand-formatted; Biome cannot parse Astro
templates, so the lint gate covers the TS test files.
