# forge (npm package)

npm distribution of the [forge](https://github.com/inbesat/Munchkin-CLI) CLI
coding agent. The published package is a single bundled JavaScript file that
runs on the [Bun](https://bun.sh) runtime:

```sh
bun install -g forge
# or, with Bun on PATH:
npm i -g forge

forge --help
```

Package-manager builds that do not require Bun (Homebrew, Scoop, WinGet) ship
the standalone binaries built by `scripts/build-binary.ts` — see `packaging/`
at the repo root.

`dist/forge.js` is produced by `bun run build` (`src/bundle.ts`), which bundles
`packages/server/src/bin/forge.ts` with `bun build --target=bun`.
