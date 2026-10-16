/**
 * forge-security PreToolUse hook (Phase 104 command-handler contract).
 * stdin:  { tool_name: string, tool_input: unknown }
 * stdout: JSON { decision: 'allow' | 'block', reason? }
 * exit:   0 = allow, 2 = block (fail-closed on unparseable payloads).
 *
 * Scans tool payloads for credential patterns and dangerous shell
 * commands. A blocked decision always carries the matched rule.
 */

interface ToolPayload {
  tool_name?: string
  tool_input?: {
    command?: string
    [key: string]: unknown
  }
}

const SECRET_PATTERNS: [string, RegExp][] = [
  ['Anthropic API key', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI API key', /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/],
  ['GitHub token', /gh[pousr]_[A-Za-z0-9]{36,}/],
  ['AWS access key', /AKIA[0-9A-Z]{16}/],
  ['Slack token', /xox[baprs]-[A-Za-z0-9-]{10,}/],
  ['Private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
]

const DANGEROUS_COMMANDS: [string, RegExp][] = [
  ['destructive rm', /rm\s+-[a-zA-Z]*[rf][a-zA-Z]*\s+\/(?!tmp\b)|rm\s+-rf?\s+\/(?!tmp\b)/],
  ['fork bomb', /:\(\)\s*\{\s*:\|:&\s*\};:/],
  ['disk wipe', /mkfs\.|dd\s+if=.*of=\/dev\//],
  ['scoped chmod 777 on root', /chmod\s+-R\s+777\s+\/(?!tmp\b)/],
  ['piped shell download', /curl[^|]*\|\s*(?:ba)?sh|wget[^|]*\|\s*(?:ba)?sh/],
]

async function readStdinJson(): Promise<ToolPayload> {
  const chunks: Uint8Array[] = []
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(chunk)
  }
  const raw = new TextDecoder().decode(Buffer.concat(chunks))
  return JSON.parse(raw) as ToolPayload
}

async function main(): Promise<void> {
  let payload: ToolPayload
  try {
    payload = await readStdinJson()
  } catch {
    console.log(JSON.stringify({ decision: 'block', reason: 'unparseable hook payload' }))
    process.exit(2)
  }

  const haystack = JSON.stringify(payload.tool_input ?? {})
  for (const [label, pattern] of SECRET_PATTERNS) {
    if (pattern.test(haystack)) {
      console.log(
        JSON.stringify({
          decision: 'block',
          reason: `possible ${label} in tool payload - redact before proceeding`,
        }),
      )
      process.exit(2)
    }
  }

  const command = payload.tool_input?.command ?? ''
  for (const [label, pattern] of DANGEROUS_COMMANDS) {
    if (command.length > 0 && pattern.test(command)) {
      console.log(JSON.stringify({ decision: 'block', reason: `dangerous command (${label}) blocked` }))
      process.exit(2)
    }
  }

  console.log(JSON.stringify({ decision: 'allow' }))
  process.exit(0)
}

void main()
