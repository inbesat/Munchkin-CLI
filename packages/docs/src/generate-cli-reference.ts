/**
 * Regenerates `src/reference/cli.md` from the live `forge --help` output so the
 * CLI reference can never drift from the binary. Called by the docs build
 * (`vitepress build` runs after this via the package build script).
 *
 * Usage: bun run src/generate-cli-reference.ts (from packages/docs)
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

const srcDir = import.meta.dir
const repoRoot = join(srcDir, '..', '..', '..')
const entryPoint = join(repoRoot, 'packages', 'server', 'src', 'bin', 'forge.ts')

const proc = Bun.spawn(['bun', entryPoint, '--help'], {
  cwd: repoRoot,
  stdout: 'pipe',
  stderr: 'pipe',
})
const [stdout, stderr, code] = await Promise.all([
  new Response(proc.stdout).text(),
  new Response(proc.stderr).text(),
  proc.exited,
])

if (code !== 0) {
  console.error(`forge --help exited with code ${code}`)
  if (stderr.trim()) console.error(stderr)
  process.exit(1)
}

const outPath = join(srcDir, 'reference', 'cli.md')
mkdirSync(dirname(outPath), { recursive: true })

const help = stdout.trimEnd()
const relEntry = relative(repoRoot, entryPoint).replaceAll('\\', '/')
writeFileSync(
  outPath,
  `# CLI

Command-line reference for forge, generated from real \`forge --help\` output of the current source tree (entry point: \`${relEntry}\`).

::: tip Regenerating
This page is produced by \`src/generate-cli-reference.ts\` as part of the docs build — do not edit it by hand.
:::

\`\`\`text
${help}
\`\`\`
`,
  'utf8',
)
console.log(`cli.md regenerated (${help.length} chars from forge --help)`)
