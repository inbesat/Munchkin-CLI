import { testRender, baseComponents } from '@opentui/solid'
import { createSignal, onMount, onCleanup } from 'solid-js'
import { performance } from 'perf_hooks'

const { box, text, markdown } = baseComponents

/** Benchmark result type. */
interface BenchmarkResult {
  name: string
  durationMs: number
  memoryMB: number
  opsPerSec?: number
}

/** Memory usage helper. */
function getMemoryMB(): number {
  const usage = process.memoryUsage()
  return Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100
}

/** Run a benchmark and measure time/memory. */
async function runBenchmark(
  name: string,
  fn: () => Promise<void> | void,
  iterations = 1,
): Promise<BenchmarkResult> {
  // Warmup
  for (let i = 0; i < 3; i++) {
    await fn()
  }

  const memBefore = getMemoryMB()
  const start = performance.now()

  for (let i = 0; i < iterations; i++) {
    await fn()
  }

  const end = performance.now()
  const memAfter = getMemoryMB()
  const durationMs = end - start

  return {
    name,
    durationMs: Math.round(durationMs * 100) / 100,
    memoryMB: memAfter - memBefore,
    opsPerSec: iterations > 1 ? Math.round((iterations / durationMs) * 1000) : undefined,
  }
}

/** Test component for streaming markdown. */
function StreamingMarkdownTest({ content }: { content: string }) {
  const [displayed, setDisplayed] = createSignal('')

  onMount(() => {
    let index = 0
    const interval = setInterval(() => {
      if (index < content.length) {
        setDisplayed(content.slice(0, index + 1))
        index++
      } else {
        clearInterval(interval)
      }
    }, 1)
    onCleanup(() => clearInterval(interval))
  })

  return text({ children: displayed })
}

/** Test component for large file list. */
function FileListTest({ files }: { files: string[] }) {
  return box({
    flexDirection: 'column',
    gap: 1,
    children: files.map((file, i) => text({ key: i, color: 'gray', children: file })),
  })
}

/** Test component for diff rendering. */
function DiffTest({ lines }: { lines: { type: 'add' | 'remove' | 'context'; content: string }[] }) {
  return box({
    flexDirection: 'column',
    gap: 0,
    children: lines.map((line, i) => {
      const color = line.type === 'add' ? 'green' : line.type === 'remove' ? 'red' : 'gray'
      const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '
      return text({ key: i, color, children: `${prefix} ${line.content}` })
    }),
  })
}

/** Test component for tool status. */
function ToolStatusTest({ tools }: { tools: { name: string; status: 'running' | 'success' | 'error'; output: string }[] }) {
  return box({
    flexDirection: 'column',
    gap: 1,
    children: tools.map((tool, i) => box({
      key: i,
      flexDirection: 'row',
      gap: 1,
      children: [
        text({ color: tool.status === 'running' ? 'yellow' : tool.status === 'success' ? 'green' : 'red', children: tool.status === 'running' ? '⟳' : tool.status === 'success' ? '✓' : '✗' }),
        text({ weight: 'bold', children: tool.name }),
        text({ color: 'gray', children: tool.output }),
      ],
    })),
  })
}

/** Test component for markdown. */
function MarkdownTest({ content }: { content: string }) {
  return markdown({ content })
}

/** Counter component for re-render test. */
function CounterComponent() {
  const [count, setCount] = createSignal(0)

  onMount(() => {
    const interval = setInterval(() => setCount(c => c + 1), 1)
    onCleanup(() => clearInterval(interval))
  })

  return text({ children: `Count: ${count()}` })
}

/** Main benchmark runner using testRender. */
async function runOpenTUIBenchmarks() {
  console.log('🚀 OpenTUI Benchmark Suite (Headless)')
  console.log('='.repeat(50))

  const results: BenchmarkResult[] = []

  // Helper to run a component with testRender
  const runComponent = (component: () => any, waitMs = 0) => {
    return new Promise<void>((resolve) => {
      const { unmount } = testRender(component)
      setTimeout(() => {
        unmount()
        resolve()
      }, waitMs)
    })
  }

  // 1. Startup time
  console.log('\n📦 Testing startup time...')
  const startupResult = await runBenchmark('Startup', async () => {
    await runComponent(() => text({ children: 'Hello' }))
  }, 10)
  results.push(startupResult)
  console.log(`   ${startupResult.durationMs}ms (${startupResult.opsPerSec?.toLocaleString()} ops/sec)`)

  // 2. Streaming markdown (simulate 1000 chars streaming)
  console.log('\n📝 Testing streaming markdown (1000 chars)...')
  const markdownContent = '# Heading\n\nThis is **bold** and *italic* text.\n\n```typescript\nfunction hello() {\n  console.log("world")\n}\n```\n\n'.repeat(10)
  const streamResult = await runBenchmark('Streaming Markdown (1000 chars)', async () => {
    await runComponent(() => StreamingMarkdownTest({ content: markdownContent }), 100)
  }, 5)
  results.push(streamResult)
  console.log(`   ${streamResult.durationMs}ms (${streamResult.opsPerSec?.toLocaleString()} ops/sec)`)

  // 3. Markdown rendering (built-in)
  console.log('\n📄 Testing built-in markdown (1000 chars)...')
  const mdResult = await runBenchmark('Built-in Markdown (1000 chars)', async () => {
    await runComponent(() => MarkdownTest({ content: markdownContent }), 50)
  }, 5)
  results.push(mdResult)
  console.log(`   ${mdResult.durationMs}ms (${mdResult.opsPerSec?.toLocaleString()} ops/sec)`)

  // 4. Large file list (1000 files)
  console.log('\n📁 Testing large file list (1000 files)...')
  const fileList = Array.from({ length: 1000 }, (_, i) => `src/components/Component${i}.tsx`)
  const fileListResult = await runBenchmark('File List (1000 items)', async () => {
    await runComponent(() => FileListTest({ files: fileList }), 50)
  }, 5)
  results.push(fileListResult)
  console.log(`   ${fileListResult.durationMs}ms (${fileListResult.opsPerSec?.toLocaleString()} ops/sec)`)

  // 5. Diff rendering (500 lines)
  console.log('\n🔀 Testing diff rendering (500 lines)...')
  const diffLines = Array.from({ length: 500 }, (_, i) => ({
    type: i % 3 === 0 ? 'add' : i % 3 === 1 ? 'remove' : 'context',
    content: `line ${i}: ${'x'.repeat(50)}`,
  } as const))
  const diffResult = await runBenchmark('Diff (500 lines)', async () => {
    await runComponent(() => DiffTest({ lines: diffLines }), 50)
  }, 5)
  results.push(diffResult)
  console.log(`   ${diffResult.durationMs}ms (${diffResult.opsPerSec?.toLocaleString()} ops/sec)`)

  // 6. Tool status updates (100 tools)
  console.log('\n⚙️  Testing tool status (100 tools)...')
  const toolList = Array.from({ length: 100 }, (_, i) => ({
    name: `tool_${i}`,
    status: i % 3 === 0 ? 'running' : i % 3 === 1 ? 'success' : 'error',
    output: `Output from tool ${i}`.repeat(2),
  } as const))
  const toolResult = await runBenchmark('Tool Status (100 tools)', async () => {
    await runComponent(() => ToolStatusTest({ tools: toolList }), 50)
  }, 5)
  results.push(toolResult)
  console.log(`   ${toolResult.durationMs}ms (${toolResult.opsPerSec?.toLocaleString()} ops/sec)`)

  // 7. Rapid re-renders (stress test)
  console.log('\n⚡ Testing rapid re-renders (100 updates)...')
  const rerenderResult = await runBenchmark('Rapid Re-renders (100 updates)', async () => {
    await runComponent(() => CounterComponent(), 100)
  }, 3)
  results.push(rerenderResult)
  console.log(`   ${rerenderResult.durationMs}ms (${rerenderResult.opsPerSec?.toLocaleString()} ops/sec)`)

  // Summary
  console.log('\n' + '='.repeat(50))
  console.log('📊 OPEN-TUI BENCHMARK RESULTS')
  console.log('='.repeat(50))
  console.log('\n| Test | Duration | Memory | Ops/sec |')
  console.log('|------|----------|--------|---------|')
  for (const r of results) {
    console.log(`| ${r.name} | ${r.durationMs.toLocaleString()}ms | ${r.memoryMB}MB | ${r.opsPerSec?.toLocaleString() ?? 'N/A'} |`)
  }

  const totalTime = results.reduce((sum, r) => sum + r.durationMs, 0)
  console.log(`\n⏱️  Total benchmark time: ${totalTime}ms`)

  return results
}

/** Counter component for re-render test. */
function CounterComponent() {
  const [count, setCount] = createSignal(0)

  onMount(() => {
    const interval = setInterval(() => setCount(c => c + 1), 1)
    onCleanup(() => clearInterval(interval))
  })

  return text({ children: `Count: ${count()}` })
}

/** Streaming markdown test component. */
function StreamingMarkdownTest({ content }: { content: string }) {
  const [displayed, setDisplayed] = createSignal('')

  onMount(() => {
    let index = 0
    const interval = setInterval(() => {
      if (index < content.length) {
        setDisplayed(content.slice(0, index + 1))
        index++
      } else {
        clearInterval(interval)
      }
    }, 1)
    onCleanup(() => clearInterval(interval))
  })

  return text({ children: displayed })
}

/** File list test component. */
function FileListTest({ files }: { files: string[] }) {
  return box({
    flexDirection: 'column',
    gap: 1,
    children: files.map((file, i) => text({ key: i, color: 'gray', children: file })),
  })
}

/** Diff test component. */
function DiffTest({ lines }: { lines: { type: 'add' | 'remove' | 'context'; content: string }[] }) {
  return box({
    flexDirection: 'column',
    gap: 0,
    children: lines.map((line, i) => {
      const color = line.type === 'add' ? 'green' : line.type === 'remove' ? 'red' : 'gray'
      const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '
      return text({ key: i, color, children: `${prefix} ${line.content}` })
    }),
  })
}

/** Tool status test component. */
function ToolStatusTest({ tools }: { tools: { name: string; status: 'running' | 'success' | 'error'; output: string }[] }) {
  return box({
    flexDirection: 'column',
    gap: 1,
    children: tools.map((tool, i) => box({
      key: i,
      flexDirection: 'row',
      gap: 1,
      children: [
        text({ color: tool.status === 'running' ? 'yellow' : tool.status === 'success' ? 'green' : 'red', children: tool.status === 'running' ? '⟳' : tool.status === 'success' ? '✓' : '✗' }),
        text({ weight: 'bold', children: tool.name }),
        text({ color: 'gray', children: tool.output }),
      ],
    })),
  })
}

/** Markdown test component. */
function MarkdownTest({ content }: { content: string }) {
  return markdown({ content })
}

// Run benchmarks
const results = await runOpenTUIBenchmarks()

const fs = require('fs')
fs.writeFileSync('opentui-results.json', JSON.stringify(results, null, 2))
console.log('\n✅ Results written to opentui-results.json')
process.exit(0)