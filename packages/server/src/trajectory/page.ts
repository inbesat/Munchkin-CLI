import type { SessionMeta, TrajectoryStep } from '@forge/core'

/**
 * Phase 144: server-rendered trajectory browser page. Fully self-contained
 * (inline CSS, no scripts, no CDN) so it works offline; every dynamic value is
 * HTML-escaped because event payloads are untrusted agent/model output.
 */
export function renderTrajectoryPage(session: SessionMeta, steps: TrajectoryStep[]): string {
  const meta = [
    session.model,
    session.cwd,
    session.endedAt ? 'completed' : 'active',
    new Date(session.createdAt).toISOString(),
    `${session.eventCount} events`,
    `${session.inputTokens} in / ${session.outputTokens} out`,
    `$${session.totalCost.toFixed(4)}`,
  ].join(' · ')
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>forge trajectory - ${escapeHtml(session.id)}</title>
    <style>${STYLES}</style>
  </head>
  <body>
    <h1>forge trajectory</h1>
    <div class="meta">${escapeHtml(session.id)}${session.title ? ` · ${escapeHtml(session.title)}` : ''}</div>
    <div class="meta">${escapeHtml(meta)}</div>
    ${steps.map(stepHtml).join('\n    ')}
  </body>
</html>`
}

export function renderTrajectoryNotFound(id: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>forge trajectory - not found</title>
    <style>${STYLES}</style>
  </head>
  <body>
    <h1>forge trajectory</h1>
    <p>Session ${escapeHtml(id)} not found.</p>
  </body>
</html>`
}

function stepHtml(step: TrajectoryStep): string {
  const parts = [
    '<div class="step">',
    `<div class="head"><span class="idx">#${step.index}</span>`,
    `<span class="badge ${step.kind}">${step.kind}</span>`,
    `<span class="title">${escapeHtml(step.title)}</span>`,
    `<span class="turn">turn ${step.turn}</span></div>`,
  ]
  if (step.meta !== undefined) parts.push(`<div class="metaline">${escapeHtml(step.meta)}</div>`)
  if (step.detail !== undefined && step.detail !== '') {
    parts.push(`<pre>${escapeHtml(step.detail)}</pre>`)
  }
  parts.push('</div>')
  return parts.join('')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const STYLES = `
  :root { color-scheme: dark; }
  body { margin: 0; padding: 24px; background: #0d1117; color: #e6edf3;
         font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { color: #8b949e; font-size: 12px; margin-bottom: 4px; }
  .step { border: 1px solid #30363d; border-radius: 6px; padding: 10px 12px;
          margin: 10px 0; background: #161b22; }
  .head { display: flex; gap: 10px; align-items: baseline; }
  .idx { color: #6e7681; }
  .badge { font-size: 11px; padding: 1px 8px; border-radius: 999px;
           background: #21262d; color: #8b949e; letter-spacing: .05em; }
  .badge.user { background: #1f3a5f; color: #79b8ff; }
  .badge.assistant { background: #1b3627; color: #3fb950; }
  .badge.tool_call { background: #33234a; color: #d2a8ff; }
  .badge.tool_result { background: #3d2c14; color: #d29922; }
  .badge.error { background: #4a1f24; color: #f85149; }
  .badge.compaction { background: #3d3522; color: #d29922; }
  .title { flex: 1; }
  .turn { color: #6e7681; font-size: 12px; }
  .metaline { color: #8b949e; font-size: 12px; margin-top: 4px; }
  pre { margin: 8px 0 0; padding: 8px; background: #0d1117; border-radius: 4px;
        overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
`
