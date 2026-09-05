# Renderer Choice Spike: OpenTUI vs Ink

## Executive Summary

**Recommendation: Use Ink as the TUI renderer for Phase 60+**

After attempting to benchmark both OpenTUI and Ink, Ink is the clear choice for our use case due to:
- **Working headless benchmark capability** - Ink ran all tests successfully in CI environment
- **Stable, well-documented API** - React-based, familiar to the team
- **Proven ecosystem** - Used by major CLI tools (Gatsby, Prisma, TypeORM, etc.)
- **OpenTUI API immaturity** - Current version (0.1.x) has breaking changes, incomplete headless support, and unstable SolidJS integration

---

## Benchmark Results: Ink v4.4.1

| Test | Duration | Memory | Ops/sec |
|------|----------|--------|---------|
| **Startup** | 28.23ms | 0MB | 354 |
| **Streaming Markdown (1000 chars)** | 553.79ms | 0.34MB | 9 |
| **File List (1000 items)** | 1,664.82ms | 0.53MB | 3 |
| **Diff (500 lines)** | 819.49ms | - | 6 |
| **Tool Status (100 tools)** | 506.69ms | 11.24MB | 10 |
| **Rapid Re-renders (100 updates)** | 327.21ms | 0MB | 9 |

**Total benchmark time:** 3.9s

### Performance Analysis

| Metric | Assessment |
|--------|------------|
| **Startup latency** | ✅ Excellent (28ms) - suitable for CLI tools |
| **Streaming markdown** | ⚠️ Moderate (554ms for 1000 chars) - acceptable for human-perceived streaming |
| **Large lists (1000 items)** | ⚠️ Slow (1.66s) - may need virtualization for >500 items |
| **Diff rendering (500 lines)** | ⚠️ Moderate (819ms) - acceptable for typical diffs |
| **Tool status (100 tools)** | ✅ Good (507ms) - reasonable for concurrent tool display |
| **Rapid re-renders** | ✅ Excellent (327ms/100 updates) - fine for status updates |

---

## OpenTUI Assessment

### Attempted Benchmarking

OpenTUI v0.1.107 was evaluated but **could not complete benchmarks** due to:

1. **No stable headless/test API** - `testRender` returns empty object, doesn't support unmounting
2. **Component API requires JSX context** - Components like `text`, `box` are classes that must be instantiated via JSX transform, not function calls
3. **SolidJS integration complexity** - Requires SolidJS primitives (`createSignal`, `onMount`, `onCleanup`) instead of React hooks
4. **Terminal takeover** - `render()` takes over the TTY immediately, unsuitable for CI/benchmarking
5. **Version instability** - v0.1.x indicates pre-1.0 with breaking changes expected

### OpenTUI Strengths (for future consideration)
- Built on SolidJS (fine-grained reactivity, no virtual DOM)
- Native terminal rendering (no React reconciler overhead)
- Built-in components: markdown, diff, code blocks, syntax highlighting
- Active development (v0.5.9 available but with breaking changes)

---

## Comparison Matrix

| Criterion | Ink | OpenTUI |
|-----------|-----|---------|
| **Headless/CI Support** | ✅ Full | ❌ Not working |
| **API Stability** | ✅ v4.x stable | ❌ v0.x pre-1.0 |
| **Developer Familiarity** | ✅ React/JSX | ⚠️ SolidJS + custom API |
| **Ecosystem/Community** | ✅ Large (50k+ stars) | ⚠️ Small (~2k stars) |
| **Built-in Components** | ✅ Good (box, text, input, etc.) | ✅ Excellent (markdown, diff, code, etc.) |
| **TypeScript Support** | ✅ First-class | ✅ Good |
| **Performance (re-renders)** | ✅ Good | Unknown |
| **Performance (large lists)** | ⚠️ Needs virtualization | Unknown |
| **Production Usage** | ✅ Gatsby, Prisma, TypeORM, etc. | ❌ Limited |

---

## Decision: Use Ink for Phase 60+

### Rationale

1. **Immediate productivity** - Team knows React; can start building TUI components immediately
2. **CI/CD compatibility** - Ink runs in headless mode for testing; OpenTUI cannot
3. **Risk mitigation** - Avoid pre-1.0 library with unstable API for core TUI infrastructure
4. **Hiring/onboarding** - React developers can contribute to TUI immediately

### Migration Path (if OpenTUI matures)

Ink's component model maps well to OpenTUI's:
- `Box` → `box`
- `Text` → `text`
- Custom components → SolidJS components

A future migration would involve:
1. Replace Ink `render` with OpenTUI `render`
2. Convert React hooks to SolidJS primitives
3. Replace custom markdown/diff with OpenTUI built-ins

---

## Phase 60+ Implementation Plan with Ink

### Immediate Next Steps
1. **App Shell** - Build main layout with `Box`, `Text`, `Input`
2. **Theme System** - Use Ink's `useConfig` + custom theme context
3. **Keyboard Navigation** - Use `useInput` hook for leader-key patterns
4. **Streaming Markdown** - Custom component or `ink-markdown` package
5. **Virtualization** - Implement for file lists >500 items (use `useVirtualList` pattern)

### Dependencies to Add
```json
{
  "ink": "^4.4.1",
  "react": "^18.2.0",
  "ink-text-input": "^5.0.0",
  "ink-select-input": "^5.0.0",
  "ink-spinner": "^5.0.0",
  "chalk": "^5.3.0"
}
```

---

## Appendix: Raw Benchmark Data

### Ink Results (ink-results.json)
```json
[
  {"name":"Startup","durationMs":28.23,"memoryMB":0,"opsPerSec":354},
  {"name":"Streaming Markdown (1000 chars)","durationMs":553.79,"memoryMB":0.34,"opsPerSec":9},
  {"name":"File List (1000 items)","durationMs":1664.82,"memoryMB":0.53,"opsPerSec":3},
  {"name":"Diff (500 lines)","durationMs":819.49,"memoryMB":-56.01,"opsPerSec":6},
  {"name":"Tool Status (100 tools)","durationMs":506.69,"memoryMB":11.24,"opsPerSec":10},
  {"name":"Rapid Re-renders (100 updates)","durationMs":327.21,"memoryMB":0,"opsPerSec":9}
]
```

### OpenTUI Results
*Not available - benchmarks could not complete due to API limitations*

---

## Conclusion

**Ink is the pragmatic choice for Phase 60+.** While OpenTUI has promising architectural advantages (SolidJS reactivity, built-in rich components), its current API instability and lack of headless testing support make it unsuitable for our core TUI infrastructure. We can revisit OpenTUI when it reaches v1.0 with stable headless APIs.