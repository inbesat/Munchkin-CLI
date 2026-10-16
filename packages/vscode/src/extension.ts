/**
 * VS Code extension entry point (Phase 141) - thin glue only:
 * registers a sidebar webview view whose chat panel talks to a running
 * forge server through ForgeChatSession. All logic lives in chat-client.ts
 * and webview.ts, which are host-free and unit tested.
 */

import * as vscode from 'vscode'
import { type ChatResult, type ChatSessionOptions, ForgeChatSession } from './chat-client'
import { renderChatHtml } from './webview'

const VIEW_ID = 'forge.chat'
const OPEN_CHAT_COMMAND = 'forge.openChat'

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(OPEN_CHAT_COMMAND, async () => {
      await vscode.commands.executeCommand(`${VIEW_ID}.focus`)
    }),
    vscode.window.registerWebviewViewProvider(VIEW_ID, new ForgeChatViewProvider()),
  )
}

export function deactivate(): void {}

class ForgeChatViewProvider implements vscode.WebviewViewProvider {
  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = { enableScripts: true }
    webviewView.webview.html = renderChatHtml()

    const chat = new ForgeChatSession(chatSessionOptions())
    webviewView.webview.onDidReceiveMessage((message: unknown) => {
      if (!isPromptMessage(message)) return
      void chat.sendPrompt(message.text).then((result: ChatResult) => {
        void webviewView.webview.postMessage(result)
      })
    })
  }
}

function chatSessionOptions(): ChatSessionOptions {
  const config = vscode.workspace.getConfiguration('forge')
  const token = config.get<string>('token') ?? ''
  const model = config.get<string>('model') ?? ''
  return {
    baseUrl: config.get<string>('baseUrl') ?? 'http://127.0.0.1:3000',
    cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd(),
    token,
    model,
  }
}

function isPromptMessage(message: unknown): message is { type: 'prompt'; text: string } {
  if (typeof message !== 'object' || message === null) return false
  const candidate = message as { type?: unknown; text?: unknown }
  return candidate.type === 'prompt' && typeof candidate.text === 'string'
}
