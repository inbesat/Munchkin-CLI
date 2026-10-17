#!/usr/bin/env bun
/**
 * Single-binary build script (Phase 149).
 *
 * Compiles the forge CLI (`packages/server/src/bin/forge.ts`) into standalone
 * executables with `bun build --compile` and reports their sizes:
 *
 *   bun run scripts/build-binary.ts                 # host target
 *   bun run scripts/build-binary.ts --all --smoke   # all five platforms
 *   bun run scripts/build-binary.ts --target win-x64 --out dist --json
 *
 * `--smoke` runs `<binary> version` for the host target and reports the other
 * targets as skipped (cross-compiled binaries cannot run on this machine).
 */
import { statSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const ENTRY = 'packages/server/src/bin/forge.ts'

export const TARGETS = {
  'linux-x64': { bunTarget: 'bun-linux-x64', file: 'forge-linux-x64' },
  'linux-arm64': { bunTarget: 'bun-linux-arm64', file: 'forge-linux-arm64' },
  'darwin-x64': { bunTarget: 'bun-darwin-x64', file: 'forge-darwin-x64' },
  'darwin-arm64': { bunTarget: 'bun-darwin-arm64', file: 'forge-darwin-arm64' },
  'win-x64': { bunTarget: 'bun-windows-x64', file: 'forge-win-x64.exe' },
} as const

export type TargetName = keyof typeof TARGETS

export interface BuildOptions {
  targets: TargetName[]
  outDir?: string
  json: boolean
  smoke: boolean
}

export interface BuildResult {
  target: TargetName
  file: string
  bytes: number
  size: string
  smoke?: 'ok' | 'skipped' | 'failed'
}

export function hostTargetName(platform: string, arch: string): TargetName | null {
  if (platform === 'win32' && arch === 'x64') return 'win-x64'
  if (platform === 'linux' && arch === 'x64') return 'linux-x64'
  if (platform === 'linux' && arch === 'arm64') return 'linux-arm64'
  if (platform === 'darwin' && arch === 'x64') return 'darwin-x64'
  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64'
  return null
}

export function formatSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function buildCommandArgs(bunTarget: string, entry: string, outfile: string): string[] {
  return ['build', '--compile', `--target=${bunTarget}`, entry, '--outfile', outfile]
}

export function parseBuildArgs(
  argv: string[],
  host: TargetName | null = hostTargetName(process.platform, process.arch),
): BuildOptions | { error: string } {
  const names = Object.keys(TARGETS) as TargetName[]
  const targets: TargetName[] = []
  let outDir: string | undefined
  let json = false
  let smoke = false
  let all = false

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--all') {
      all = true
    } else if (arg === '--json') {
      json = true
    } else if (arg === '--smoke') {
      smoke = true
    } else if (arg === '--target' || arg === '--out') {
      const value = argv[i + 1]
      if (value === undefined) return { error: `missing value for ${arg}` }
      i += 1
      if (arg === '--target') {
        if (!(value in TARGETS)) {
          return { error: `unknown target '${value}' (expected ${names.join(', ')})` }
        }
        targets.push(value as TargetName)
      } else {
        outDir = value
      }
    }
  }

  const resolved = all ? names : targets.length > 0 ? targets : host ? [host] : []
  if (resolved.length === 0) {
    return {
      error: `no host target for ${process.platform}/${process.arch}; pass --target <name> or --all`,
    }
  }
  return { targets: resolved, json, smoke, ...(outDir !== undefined ? { outDir } : {}) }
}

async function smokeTest(binary: string): Promise<'ok' | 'failed'> {
  try {
    const proc = Bun.spawn([binary, 'version'], { stdout: 'pipe', stderr: 'pipe' })
    const code = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    return code === 0 && stdout.includes('forge') ? 'ok' : 'failed'
  } catch {
    return 'failed'
  }
}

export async function main(argv: string[]): Promise<number> {
  const parsed = parseBuildArgs(argv)
  if ('error' in parsed) {
    process.stderr.write(`error: ${parsed.error}\n`)
    return 1
  }

  const root = join(import.meta.dir, '..')
  const entry = join(root, ENTRY)
  const outDir = resolve(parsed.outDir ?? process.cwd())
  const host = hostTargetName(process.platform, process.arch)
  const results: BuildResult[] = []
  const failures: string[] = []

  if (!parsed.json) {
    process.stdout.write(`forge single-binary build (bun ${process.versions.bun ?? 'unknown'})\n`)
    process.stdout.write(`entry: ${entry}\n\n`)
  }

  for (const target of parsed.targets) {
    const spec = TARGETS[target]
    const outfile = join(outDir, spec.file)
    const proc = Bun.spawn(['bun', ...buildCommandArgs(spec.bunTarget, entry, outfile)], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const code = await proc.exited
    if (code !== 0) {
      const stderr = await new Response(proc.stderr).text()
      failures.push(`${target}: ${stderr.trim().split('\n').slice(-3).join(' ')}`)
      if (!parsed.json) process.stdout.write(`FAIL  ${target.padEnd(14)}build failed\n`)
      continue
    }

    const bytes = statSync(outfile).size
    const result: BuildResult = { target, file: spec.file, bytes, size: formatSize(bytes) }
    if (parsed.smoke) {
      result.smoke = target === host ? await smokeTest(outfile) : 'skipped'
      if (result.smoke === 'failed') failures.push(`${target}: smoke test failed`)
    }
    results.push(result)

    if (!parsed.json) {
      const note =
        result.smoke === 'ok'
          ? ' (smoke ok)'
          : result.smoke === 'failed'
            ? ' (smoke FAILED)'
            : result.smoke === 'skipped'
              ? ' (smoke skipped: cross-compiled)'
              : ''
      process.stdout.write(
        `OK    ${target.padEnd(14)}${result.size.padStart(9)}  ${spec.file}${note}\n`,
      )
    }
  }

  const totalBytes = results.reduce((sum, result) => sum + result.bytes, 0)
  if (parsed.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          results,
          totalBytes,
          totalSize: formatSize(totalBytes),
          outDir,
          failures,
        },
        null,
        2,
      )}\n`,
    )
  } else {
    process.stdout.write(
      `\n${results.length} binar${results.length === 1 ? 'y' : 'ies'}: ${formatSize(totalBytes)} total (out: ${outDir})\n`,
    )
    for (const failure of failures) process.stderr.write(`error: ${failure}\n`)
  }
  return failures.length > 0 ? 1 : 0
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)))
}
