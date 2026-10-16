import { Box, Text, render } from 'ink'
import { performance } from 'perf_hooks'
import type React from 'react'
import { useEffect, useState } from 'react'

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
  return Math.round((usage.heapUsed / 1024 / 1024) * 100) / 100
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
const StreamingMarkdownTest: React.FC<{ content: string }> = ({ content }) => {
  const [displayed, setDisplayed] = useState('')

  useEffect(() => {
    let index = 0
    const interval = setInterval(() => {
      if (index < content.length) {
        setDisplayed(content.slice(0, index + 1))
        index++
      } else {
        clearInterval(interval)
      }
    }, 1)
    return () => clearInterval(interval)
  }, [content])

  return <Text>{displayed}</Text>
}

/** Test component for large file list. */
const FileListTest: React.FC<{ files: string[] }> = ({ files }) => (
  <Box flexDirection="column" gap={1}>
    {files.map((file, i) => (
      <Text key={i} color="gray">
        {file}
      </Text>
    ))}
  </Box>
)

/** Test component for diff rendering. */
const DiffTest: React.FC<{ lines: { type: 'add' | 'remove' | 'context'; content: string }[] }> = ({
  lines,
}) => (
  <Box flexDirection="column" gap={0}>
    {lines.map((line, i) => {
      const color = line.type === 'add' ? 'green' : line.type === 'remove' ? 'red' : 'gray'
      const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '
      return (
        <Text key={i} color={color}>
          {prefix} {line.content}
        </Text>
      )
    })}
  </Box>
)

/** Test component for tool status. */
const ToolStatusTest: React.FC<{
  tools: { name: string; status: 'running' | 'success' | 'error'; output: string }[]
}> = ({ tools }) => (
  <Box flexDirection="column" gap={1}>
    {tools.map((tool, i) => (
      <Box key={i} flexDirection="row" gap={1}>
        <Text
          color={tool.status === 'running' ? 'yellow' : tool.status === 'success' ? 'green' : 'red'}
        >
          {tool.status === 'running' ? '⟳' : tool.status === 'success' ? '✓' : '✗'}
        </Text>
        <Text weight="bold">{tool.name}</Text>
        <Text color="gray">{tool.output}</Text>
      </Box>
    ))}
  </Box>
)

/** Counter component for re-render test. */
const CounterComponent: React.FC = () => {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setCount((c) => c + 1), 1)
    return () => clearInterval(interval)
  }, [])

  return <Text>Count: {count}</Text>
}

/** Main benchmark runner. */
async function runInkBenchmarks() {
  console.log('🚀 Ink Benchmark Suite')
  console.log('='.repeat(50))

  const results: BenchmarkResult[] = []

  // 1. Startup time
  console.log('\n📦 Testing startup time...')
  const startupResult = await runBenchmark(
    'Startup',
    async () => {
      const { unmount } = render(<Text>Hello</Text>, { exitOnCtrlC: false })
      unmount()
    },
    10,
  )
  results.push(startupResult)
  console.log(
    `   ${startupResult.durationMs}ms (${startupResult.opsPerSec?.toLocaleString()} ops/sec)`,
  )

  // 2. Streaming markdown (simulate 1000 chars streaming)
  console.log('\n📝 Testing streaming markdown (1000 chars)...')
  const markdownContent =
    '# Heading\n\nThis is **bold** and *italic* text.\n\n```typescript\nfunction hello() {\n  console.log("world")\n}\n```\n\n'.repeat(
      10,
    )
  const streamResult = await runBenchmark(
    'Streaming Markdown (1000 chars)',
    async () => {
      const { unmount } = render(<StreamingMarkdownTest content={markdownContent} />, {
        exitOnCtrlC: false,
      })
      await new Promise((r) => setTimeout(r, 100))
      unmount()
    },
    5,
  )
  results.push(streamResult)
  console.log(
    `   ${streamResult.durationMs}ms (${streamResult.opsPerSec?.toLocaleString()} ops/sec)`,
  )

  // 3. Large file list (1000 files)
  console.log('\n📁 Testing large file list (1000 files)...')
  const fileList = Array.from({ length: 1000 }, (_, i) => `src/components/Component${i}.tsx`)
  const fileListResult = await runBenchmark(
    'File List (1000 items)',
    async () => {
      const { unmount } = render(<FileListTest files={fileList} />, { exitOnCtrlC: false })
      await new Promise((r) => setTimeout(r, 50))
      unmount()
    },
    5,
  )
  results.push(fileListResult)
  console.log(
    `   ${fileListResult.durationMs}ms (${fileListResult.opsPerSec?.toLocaleString()} ops/sec)`,
  )

  // 4. Diff rendering (500 lines)
  console.log('\n🔀 Testing diff rendering (500 lines)...')
  const diffLines = Array.from(
    { length: 500 },
    (_, i) =>
      ({
        type: i % 3 === 0 ? 'add' : i % 3 === 1 ? 'remove' : 'context',
        content: `line ${i}: ${'x'.repeat(50)}`,
      }) as const,
  )
  const diffResult = await runBenchmark(
    'Diff (500 lines)',
    async () => {
      const { unmount } = render(<DiffTest lines={diffLines} />, { exitOnCtrlC: false })
      await new Promise((r) => setTimeout(r, 50))
      unmount()
    },
    5,
  )
  results.push(diffResult)
  console.log(`   ${diffResult.durationMs}ms (${diffResult.opsPerSec?.toLocaleString()} ops/sec)`)

  // 5. Tool status updates (100 tools)
  console.log('\n⚙️  Testing tool status (100 tools)...')
  const toolList = Array.from(
    { length: 100 },
    (_, i) =>
      ({
        name: `tool_${i}`,
        status: i % 3 === 0 ? 'running' : i % 3 === 1 ? 'success' : 'error',
        output: `Output from tool ${i}`.repeat(2),
      }) as const,
  )
  const toolResult = await runBenchmark(
    'Tool Status (100 tools)',
    async () => {
      const { unmount } = render(<ToolStatusTest tools={toolList} />, { exitOnCtrlC: false })
      await new Promise((r) => setTimeout(r, 50))
      unmount()
    },
    5,
  )
  results.push(toolResult)
  console.log(`   ${toolResult.durationMs}ms (${toolResult.opsPerSec?.toLocaleString()} ops/sec)`)

  // 6. Rapid re-renders (stress test)
  console.log('\n⚡ Testing rapid re-renders (100 updates)...')
  const rerenderResult = await runBenchmark(
    'Rapid Re-renders (100 updates)',
    async () => {
      const { unmount } = render(<CounterComponent />, { exitOnCtrlC: false })
      await new Promise((r) => setTimeout(r, 100))
      unmount()
    },
    3,
  )
  results.push(rerenderResult)
  console.log(
    `   ${rerenderResult.durationMs}ms (${rerenderResult.opsPerSec?.toLocaleString()} ops/sec)`,
  )

  // Summary
  console.log('\n' + '='.repeat(50))
  console.log('📊 INK BENCHMARK RESULTS')
  console.log('='.repeat(50))
  console.log('\n| Test | Duration | Memory | Ops/sec |')
  console.log('|------|----------|--------|---------|')
  for (const r of results) {
    console.log(
      `| ${r.name} | ${r.durationMs.toLocaleString()}ms | ${r.memoryMB}MB | ${r.opsPerSec?.toLocaleString() ?? 'N/A'} |`,
    )
  }

  const totalTime = results.reduce((sum, r) => sum + r.durationMs, 0)
  console.log(`\n⏱️  Total benchmark time: ${totalTime}ms`)

  return results
}

// Run benchmarks
runInkBenchmarks()
  .then((results) => {
    // Write results to file for comparison
    const fs = require('fs')
    fs.writeFileSync('ink-results.json', JSON.stringify(results, null, 2))
    console.log('\n✅ Results written to ink-results.json')
    process.exit(0)
  })
  .catch((err) => {
    console.error('❌ Benchmark failed:', err)
    process.exit(1)
  })
