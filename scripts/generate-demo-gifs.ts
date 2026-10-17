/**
 * Generates the landing-page demo GIFs (Phase 152) from REAL, verbatim CLI
 * transcripts captured in verified runs. Frames are rendered with ffmpeg
 * drawtext (monospace lines revealed one at a time) and assembled into GIFs —
 * no browser needed, so the whole pipeline is a plain repo script.
 *
 * Usage: bun run scripts/generate-demo-gifs.ts
 * Env:   FORGE_GIF_FONT=<path to a monospace .ttf> (default: Consolas)
 *
 * Transcripts below are verbatim captures of `forge --help`, `forge doctor`,
 * and a piped `forge setup` session, with one documented cosmetic substitution:
 * the one-off temp-dir path in the setup transcript is shown as the canonical
 * `~/.config/forge/settings.json` (the demo ran with a redirected home dir so
 * no real config was touched).
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const repoRoot = join(import.meta.dir, '..')
const outDir = join(repoRoot, 'packages', 'landing', 'public', 'demos')

const FONT = process.env.FORGE_GIF_FONT ?? 'C\\:/Windows/Fonts/consola.ttf'

const C = {
  title: '#f0f6fc',
  text: '#e6edf3',
  dim: '#8b949e',
  accent: '#79c0ff',
  ok: '#3fb950',
  warn: '#d29922',
  cyan: '#39c5cf',
}

type Line = { text: string; color: string }

// --- Demo 1: forge --help (banner + usage block; verbatim) -------------------
const helpLines: Line[] = [
  { text: 'forge 0.1.0', color: C.title },
  { text: '', color: C.text },
  { text: 'Usage:', color: C.accent },
  { text: '  forge serve [options]', color: C.text },
  { text: '  forge rpc [options]', color: C.text },
  { text: '  forge auth <list|create|revoke> [options]', color: C.text },
  { text: '  forge worktree <list|create|merge|remove> [options]', color: C.text },
  { text: '  forge stats [--json] [--base-dir <path>] [--db <path>]', color: C.text },
  {
    text: '  forge eval <list|run|regress> [--task <id>] [--model <id>] [--config <file>] [--json]',
    color: C.text,
  },
  { text: '  forge telemetry <status|on|off>', color: C.text },
  { text: '  forge doctor [--json] [--online]', color: C.text },
  { text: '  forge update [--json]', color: C.text },
  { text: '  forge setup [--yes]', color: C.text },
  { text: '  forge help', color: C.text },
  { text: '  forge version', color: C.text },
]

// --- Demo 2: forge doctor (verbatim) -----------------------------------------
const doctorLines: Line[] = [
  { text: 'forge doctor', color: C.title },
  { text: '', color: C.text },
  { text: 'OK    bun           bun 1.3.11 (required >= 1.2.0)', color: C.ok },
  { text: 'OK    opentui       @opentui/solid 0.1.107', color: C.ok },
  {
    text: 'WARN  providers     no API keys configured (set ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY)',
    color: C.warn,
  },
  { text: 'OK    mcp           0 server(s) configured', color: C.ok },
  { text: 'OK    plugins       0 plugin(s) configured, 0 enabled', color: C.ok },
  { text: 'OK    config        0 file(s) checked, schema valid', color: C.ok },
  { text: 'OK    permissions   mode: ask, 0 rule(s)', color: C.ok },
  { text: '', color: C.text },
  { text: '7 checks: 6 ok · 1 warn · 0 fail', color: C.title },
]

// --- Demo 3: forge setup (piped session; verbatim except the path swap) ------
const setupLines: Line[] = [
  { text: 'forge setup — a few questions and you are ready to go.', color: C.title },
  { text: 'config: ~/.config/forge/settings.json', color: C.dim },
  { text: '', color: C.text },
  { text: 'Provider:', color: C.accent },
  { text: '  1. anthropic (default)', color: C.text },
  { text: '  2. openai', color: C.dim },
  { text: '  3. google', color: C.dim },
  { text: '  4. deepseek', color: C.dim },
  { text: '  5. bedrock', color: C.dim },
  { text: '  6. vertex', color: C.dim },
  {
    text: 'Suggested anthropic models: claude-opus-4-20250514, claude-sonnet-4-20250514, claude-haiku-3-5-20241022',
    color: C.text,
  },
  { text: 'Theme:', color: C.accent },
  { text: '  1. dark (default) — dark background', color: C.text },
  { text: '  2. light — light background', color: C.dim },
  { text: '  3. auto — follow the terminal', color: C.dim },
  { text: 'Permission mode:', color: C.accent },
  { text: '  1. ask (default) — ask before writes and commands (recommended)', color: C.text },
  { text: '  2. auto — allow writes and commands with safety checks', color: C.dim },
  { text: '  3. plan — read-only; writes and commands are denied', color: C.dim },
  { text: '  4. bypass — allow everything (circuit breakers still active)', color: C.dim },
  { text: '', color: C.text },
  { text: 'Setup complete ✓', color: C.ok },
  { text: '  provider:    anthropic (key saved)', color: C.text },
  { text: '  model:       claude-opus-4-20250514', color: C.text },
  { text: '  theme:       dark', color: C.text },
  { text: '  permissions: ask', color: C.text },
  { text: '  config:      ~/.config/forge/settings.json', color: C.dim },
  { text: '', color: C.text },
  { text: 'Next steps:', color: C.accent },
  { text: '  forge -p "explain this repository"   # one-shot prompt', color: C.cyan },
  { text: '  forge doctor                        # verify the installation', color: C.cyan },
]

const demos = [
  { name: 'help', lines: helpLines },
  { name: 'doctor', lines: doctorLines },
  { name: 'setup', lines: setupLines },
]

const FPS = 10
const FONT_SIZE = 15
const LINE_H = 21
const MARGIN = 24

async function runFfmpeg(args: string[], cwd: string): Promise<void> {
  const proc = Bun.spawn(['ffmpeg', '-hide_banner', '-loglevel', 'error', ...args], {
    cwd,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const code = await proc.exited
  if (code !== 0) throw new Error(`ffmpeg exited ${code}: ffmpeg ${args.join(' ')}`)
}

mkdirSync(outDir, { recursive: true })
const workRoot = mkdtempSync(join(tmpdir(), 'forge-demos-'))

try {
  for (const demo of demos) {
    const lines = demo.lines
    const framesDir = join(workRoot, demo.name)
    mkdirSync(framesDir, { recursive: true })

    // Frame states: blank title frame, then reveal one line per frame, then hold.
    const states: Line[][] = [[{ text: '', color: C.text }]]
    for (let k = 0; k < lines.length; k++) states.push(lines.slice(0, k + 1))
    for (let h = 0; h < 3; h++) states.push(lines)

    const height = MARGIN * 2 + lines.length * LINE_H
    let index = 0
    for (const [s, state] of states.entries()) {
      index += 1
      let vf = ''
      // copy the font into the frames cwd so the option path has no colons
      // (Windows drive-letter colons need double-escaping inside filter args)
      const fontCopy = join(framesDir, 'font.ttf')
      if (!existsSync(fontCopy)) {
        Bun.write(fontCopy, Bun.file(FONT.replaceAll('\\:', ':')))
      }
      state.forEach((line, i) => {
        const lineName = `l${String(i).padStart(3, '0')}.txt`
        writeFileSync(join(framesDir, lineName), line.text)
        vf += `drawtext=textfile=${lineName}:fontfile=font.ttf:fontsize=${FONT_SIZE}:fontcolor=${line.color}:x=${MARGIN}:y=${MARGIN + i * LINE_H}:expansion=none,`
      })
      // blinking block cursor on odd states (every other frame while revealing)
      if (s % 2 === 1 && s < lines.length) {
        writeFileSync(join(framesDir, 'cursor.txt'), '█')
        vf += `drawtext=textfile=cursor.txt:fontfile=font.ttf:fontsize=${FONT_SIZE}:fontcolor=${C.text}:x=${MARGIN}:y=${MARGIN + state.length * LINE_H}:expansion=none,`
      }
      await runFfmpeg(
        [
          '-y',
          '-f',
          'lavfi',
          '-i',
          `color=c=0x0d1117:s=960x${height}:r=1`,
          '-frames:v',
          '1',
          '-vf',
          vf.replace(/,$/, ''),
          `${String(index).padStart(4, '0')}.png`,
        ],
        framesDir,
      )
    }

    const gifPath = join(outDir, `${demo.name}.gif`)
    await runFfmpeg(
      [
        '-y',
        '-framerate',
        String(FPS),
        '-start_number',
        '1',
        '-i',
        '%04d.png',
        '-vf',
        'split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=none',
        '-loop',
        '0',
        gifPath,
      ],
      framesDir,
    )
    console.log(`${demo.name}.gif: ${states.length} frames, ${lines.length} lines`)
  }
  console.log(`wrote ${demos.length} demos to ${outDir}`)
} finally {
  rmSync(workRoot, { recursive: true, force: true })
}
