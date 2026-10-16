/**
 * Sidebar chat webview HTML (Phase 141). Pure string generation so the markup,
 * CSP nonce wiring, and message contract are testable without a VS Code host.
 */

export function renderChatHtml(): string {
  const nonce = globalThis.crypto.randomUUID().replace(/-/g, '')
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style nonce="${nonce}">
      body {
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        margin: 0;
        display: flex;
        flex-direction: column;
        height: 100vh;
      }
      #messages {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
      }
      .msg {
        margin: 4px 0;
        padding: 6px 8px;
        border-radius: 6px;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .user {
        background: var(--vscode-input-background);
      }
      .agent {
        background: var(--vscode-editor-inactiveSelectionBackground);
      }
      .error {
        background: var(--vscode-inputValidation-errorBackground);
      }
      form {
        display: flex;
        gap: 4px;
        padding: 8px;
        border-top: 1px solid var(--vscode-panel-border);
      }
      textarea {
        flex: 1;
        resize: none;
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
      }
      button {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        padding: 4px 10px;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <div id="messages" aria-live="polite"></div>
    <form id="composer">
      <textarea id="prompt" rows="3" placeholder="Ask forge…" aria-label="Prompt"></textarea>
      <button id="send" type="submit">Send</button>
    </form>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const messages = document.getElementById('messages');
      const input = document.getElementById('prompt');
      const form = document.getElementById('composer');
      function append(kind, text) {
        const el = document.createElement('div');
        el.className = 'msg ' + kind;
        el.textContent = text;
        messages.appendChild(el);
        messages.scrollTop = messages.scrollHeight;
      }
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        append('user', text);
        input.value = '';
        vscode.postMessage({ type: 'prompt', text });
      });
      window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.ok === true) append('agent', message.response);
        else if (message.ok === false) append('error', message.error);
      });
    </script>
  </body>
</html>`
}
