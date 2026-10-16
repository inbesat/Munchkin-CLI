/**
 * forge-format PostToolUse hook (Phase 104 command-handler contract).
 * stdin:  { tool_name: string, tool_input: { file_path?: string } }
 * stdout: human-readable note (also valid JSON on skips)
 * exit:   0 always - PostToolUse hooks observe, they never block.
 *
 * Picks a formatter by extension: Biome first, Prettier fallback.
 * FORMATTER_CMD env override replaces the formatter command and receives
 * the file path appended as its final argument.
 */

interface ToolPayload {
  tool_name?: string
  tool_input?: {
    file_path?: string
    [key: string]: unknown
  }
}

const BIOME_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.jsonc'])
const PRETTIER_EXTS = new Set(['.css', '.scss', '.html', '.md', '.yaml', '.yml'])

function formatterFor(file: string): { cmd: string[]; label: string } | undefined {
  const override = process.env.FORMATTER_CMD?.trim()
  if (override !== undefined && override.length > 0) {
    return { cmd: [...override.split(' ').filter((part) => part.length > 0), file], label: 'FORMATTER_CMD' }
  }
  const ext = file.slice(file.lastIndexOf('.')).toLowerCase()
  if (BIOME_EXTS.has(ext)) {
    return { cmd: ['bunx', '--no-install', 'biome', 'format', '--write', file], label: 'biome' }
  }
  if (PRETTIER_EXTS.has(ext)) {
    return { cmd: ['bunx', '--no-install', 'prettier', '--write', '--loglevel', 'warn', file], label: 'prettier' }
  }
  return undefined
}

async function readStdinJson(): Promise<ToolPayload> {
  const chunks: Uint8Array[] = []
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(chunk)
  }
  return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks))) as ToolPayload
}

async function main(): Promise<void> {
  let file = ''
  try {
    const payload = await readStdinJson()
    file = payload.tool_input?.file_path ?? ''
  } catch {
    file = ''
  }

  if (file.length === 0 || !existsSync(file)) {
    console.log(JSON.stringify({ status: 'skipped', reason: 'no file to format' }))
    process.exit(0)
  }

  const formatter = formatterFor(file)
  if (formatter === undefined) {
    console.log(JSON.stringify({ status: 'skipped', reason: `no formatter for ${file}` }))
    process.exit(0)
  }

  const proc = Bun.spawnSync(formatter.cmd, { stdout: 'pipe', stderr: 'pipe' })
  console.log(
    JSON.stringify({
      status: proc.exitCode === 0 ? 'formatted' : 'formatter-failed',
      formatter: formatter.label,
      file,
    }),
  )
  process.exit(0)
}

import { existsSync } from 'node:fs'

void main()
