# Plugins

forge's "plugin everything" architecture: providers, tools, sandboxes, storage, and UI hooks are all swappable through plugins without touching core source.

## Manifest

Every plugin is a directory containing `forge.plugin.json`. Bundled plugins live under [`marketplace/plugins`](https://github.com/inbesat/Munchkin-CLI/tree/main/marketplace/plugins) in the repo.

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "What it adds",
  "hooks": {
    "afterToolExecute": "hooks/after-tool.ts"
  }
}
```

## Hook engine

Plugins subscribe to lifecycle hooks — before/after tool execution, session lifecycle, steering events. Hook handlers are TypeScript modules loaded by the plugin kernel (`packages/plugin-kernel`), which validates the manifest, resolves module paths relative to the plugin directory, and isolates failures so a broken plugin cannot take down the agent loop.

## Marketplace and docs

- The marketplace directory is the source of truth for installable plugins.
- Run `bun run scripts/generate-plugin-docs.ts` to render every bundled plugin into static HTML — deployed to `<site>/plugins/` (with plugin-specific detail pages).
- The loader and marketplace live in `packages/plugin-kernel`.

## Writing a minimal plugin

1. Create `my-plugin/forge.plugin.json` with `name`, `version`, `description`, and hook entries.
2. Implement the hook modules referenced in the manifest.
3. Drop the directory into `marketplace/plugins/` (or point the loader at it via config) and regenerate plugin docs.

See the generated reference at 
[the site's `/plugins/` section](https://inbesat.github.io/Munchkin-CLI/plugins/) for live examples of real plugins.
