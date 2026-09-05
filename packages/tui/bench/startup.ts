import { spawnSync } from 'node:child_process'

/** Pure percentile over a sorted-friendly array (linear interpolation). */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const rank = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(rank)
  const hi = Math.ceil(rank)
  if (lo === hi) return sorted[lo]
  const frac = rank - lo
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac
}

/** Run one cold startup measurement by spawning a fresh bun process. */
export function measureOnce(): number {
  const res = spawnSync('bun', ['entry.ts'], {
    cwd: import.meta.dir,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const out = (res.stdout?.toString() ?? '').trim().split('\n').pop() ?? '{}'
  const parsed = JSON.parse(out) as { ms: number }
  return parsed.ms
}

/** Measure `iterations` cold starts and return summary stats. */
export function benchmarkStartup(iterations = 20): {
  samples: number[]
  p50: number
  p95: number
  min: number
  max: number
} {
  const samples: number[] = []
  for (let i = 0; i < iterations; i++) {
    samples.push(measureOnce())
  }
  return {
    samples,
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    min: Math.min(...samples),
    max: Math.max(...samples),
  }
}

// Run when invoked directly: `bun run bench/startup.ts`
if (import.meta.main) {
  const iters = Number(process.argv[2] ?? '20')
  const r = benchmarkStartup(iters)
  // eslint-disable-next-line no-console
  console.log(
    `Startup (n=${r.samples.length}): p50=${r.p50.toFixed(1)}ms p95=${r.p95.toFixed(1)}ms min=${r.min.toFixed(1)}ms max=${r.max.toFixed(1)}ms`,
  )
  // eslint-disable-next-line no-console
  console.log(`Target: p50<200ms, p95<300ms -> ${r.p50 < 200 && r.p95 < 300 ? 'PASS' : 'FAIL'}`)
}
