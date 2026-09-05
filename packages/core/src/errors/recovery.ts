import type { ErrorCode } from './codes'

export const RecoveryHint: Record<ErrorCode, string | null> = {
  // General
  FORGE_0001: 'This is an unexpected error. Please report it at https://github.com/forge/issues',
  FORGE_0002: 'Internal error. Try restarting the session.',
  FORGE_0003: 'This feature is not yet implemented.',
  FORGE_0004: 'Operation timed out. Try again or increase the timeout.',
  FORGE_0005: 'Operation was cancelled.',

  // Config
  FORGE_2001: 'Create a config file: forge config init',
  FORGE_2002: 'Check your settings.json for syntax errors. Run forge config validate.',
  FORGE_2003: 'Check file permissions for the config file.',
  FORGE_2004: 'Check file permissions and disk space.',
  FORGE_2005: 'Add the missing field to your config. Run forge config validate for details.',

  // Provider
  FORGE_3001: 'Check your API key. Run: forge auth login <provider>',
  FORGE_3002: 'Rate limited. Wait a moment and try again.',
  FORGE_3003: 'Provider is overloaded. Try a different provider or wait.',
  FORGE_3004: 'Check the model name in your config. Run: forge models list',
  FORGE_3005: 'Request failed. Check your network connection and API key.',
  FORGE_3006: 'Stream interrupted. The response may be partial.',
  FORGE_3007: 'Provider timed out. Try a shorter prompt or different model.',
  FORGE_3008: 'Provider not configured. Run: forge config set model.provider <name>',

  // Tool
  FORGE_4001:
    'Available tools: bash, read, write, edit, glob, grep, task, question, webfetch, websearch.',
  FORGE_4002: 'Tool execution failed. Check the error details above.',
  FORGE_4003: 'Tool timed out. Try breaking the task into smaller steps.',
  FORGE_4004: 'Check the tool input parameters against the tool schema.',
  FORGE_4005: 'Output truncated. Use file tools to read specific sections instead.',
  FORGE_4006: 'Permission denied. Run: forge permission allow <tool>',
  FORGE_4007: 'Tool rate limited. Wait a moment and try again.',

  // Permission
  FORGE_5001: 'Add a permission rule: forge permission allow <tool>',
  FORGE_5002: 'Valid modes: ask, allow, deny, auto, plan, bypass.',
  FORGE_5003: 'Multiple rules match. More specific rules take precedence.',
  FORGE_5004: 'Bypass mode is disabled by security policy.',

  // Session
  FORGE_6001: 'List sessions: forge sessions list. Resume: forge session resume <id>',
  FORGE_6002: 'Session expired. Start a new session.',
  FORGE_6003: 'Session state may be corrupted. Try: forge session fork',
  FORGE_6004: 'Agent hit the iteration limit. Break the task into smaller steps.',
  FORGE_6005: 'Event log corrupted. Try: forge session recover <id>',

  // Context
  FORGE_7001: 'Context overflow. Compaction will trigger automatically.',
  FORGE_7002: 'Compaction failed. Try starting a new session.',
  FORGE_7003: 'Token limit exceeded. Reduce the prompt size.',

  // MCP
  FORGE_8001: 'Check your MCP server config in settings.json.',
  FORGE_8002: 'MCP server failed to start. Check the command and args.',
  FORGE_8003: 'MCP server timed out. Check if the server is running.',
  FORGE_8004: 'Tool not found on MCP server. Check available tools.',
  FORGE_8005: 'MCP protocol error. Try restarting the server.',

  // Plugin
  FORGE_9001: 'Install the plugin: forge plugin install <name>',
  FORGE_9002: 'Plugin failed to load. Check the plugin path and dependencies.',
  FORGE_9003: 'Plugin hook failed. Check the hook configuration.',
  FORGE_9004: 'Install the missing dependency for this plugin.',
  FORGE_9005: 'Update the plugin to a compatible version.',

  // Sandbox
  FORGE_A001: 'Sandbox not available on this platform. Install: forge sandbox setup',
  FORGE_A002: 'Sandbox execution failed. Check sandbox provider status.',
  FORGE_A003: 'Network access denied by sandbox policy.',
  FORGE_A004: 'File system access denied by sandbox policy.',

  // Git
  FORGE_B001: 'Not a git repository. Run: git init',
  FORGE_B002: 'Branch not found. List branches: git branch',
  FORGE_B003: 'Merge conflict. Resolve conflicts before continuing.',
  FORGE_B004: 'Push failed. Check remote access and branch protection rules.',
}

export function getRecoveryHint(code: ErrorCode): string | null {
  return RecoveryHint[code] ?? null
}
