# @forge/vscode

VS Code extension skeleton (Phase 141): a sidebar **Forge** activity-bar container
with a chat webview. Prompts are sent to a running forge server and responses are
displayed in the panel.

## Requirements

- A running forge server: `forge serve` (defaults to `http://127.0.0.1:3000`).

## Running the extension

1. Build the package: `bun run build` (emits `dist/extension.js`; the extension
   host loads CommonJS, hence the package-local `module: CommonJS` tsconfig).
2. Open this folder in VS Code and press `F5` (Run Extension), or package with
   `npx @vscode/vsce package` from `packages/vscode`.
3. In the Extension Development Host, open the Forge icon in the activity bar
   (or run the **Forge: Open Chat** command), type a prompt, hit Send.

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `forge.baseUrl` | `http://127.0.0.1:3000` | Base URL of the forge server. |
| `forge.token` | `""` | Optional bearer token for server auth. |
| `forge.model` | `""` | Optional model override (empty = server default). |

## Design notes

- `src/extension.ts` is thin VS Code glue (not unit tested).
- `src/chat-client.ts` and `src/webview.ts` are host-free and unit tested with
  `bun test`. The chat client uses plain `fetch` because the VS Code extension
  host loads CommonJS while `@forge/sdk` compiles to ESM; SDK response types are
  imported type-only so the wire contract stays single-sourced.
- The webview is locked down with a CSP nonce (no inline script/style without it).
