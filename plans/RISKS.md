# RISKS.md — Honest Risk Assessment

Every risk that could kill this project, with mitigation strategies. Updated as new risks emerge.

---

## RISK-001: Scope Death (Probability: HIGH | Impact: FATAL)

**The #1 killer of ambitious projects.** 150 phases is a lot. The temptation to build everything before shipping anything is real.

**Mitigation:**
- Ship a usable v0.1 after Stage 5 (phase 68) — that's TUI + agent loop + providers + permissions. Usable daily driver.
- Public early. Release v0.1 at phase 68 even if it's rough. Get feedback. Iterate.
- Never build features that aren't needed for the current stage. If it's not in the phase list, it doesn't exist yet.
- Weekly milestone check: "Can I use this to write code today?" If no, ship what makes that possible first.

## RISK-002: Legal Action from Anthropic (Probability: LOW | Impact: HIGH)

**What if Anthropic claims our clean-room implementation is too close to Claude Code?**

**Mitigation:**
- Never read or reference Claude Code's proprietary TypeScript source.
- Use clean-room specs only: `claurst/spec/`, behavioral docs, public feature descriptions.
- Document the clean-room process (this AGENTS.md serves as evidence).
- The codebase is MIT licensed. If challenged, we can prove independent development from public specifications.
- Reality: opencode, Claurst, crab-code, DeepSeek Harness, CoderAgent all exist without legal issues. The functional behavior of a CLI tool is not copyrightable.

## RISK-003: DeepSeek Harness Moves Too Fast (Probability: HIGH | Impact: MEDIUM)

**dsh is iterating rapidly (536 commits in 2 days). Building on top of it would mean constant breakage.**

**Mitigation:**
- We build FROM SCRATCH, inspired by dsh's ideas, not building ON dsh.
- Study dsh's architecture (session log, plugin kernel, sandboxing) as reference patterns.
- If we later want to make dsh compatible, that's a connector/plugin, not a core dependency.
- Our plugin kernel is simpler than Cordis by design.

## RISK-004: OpenTUI Pre-1.0 Instability (Probability: MEDIUM | Impact: MEDIUM)

**OpenTUI is pre-1.0. Breaking API changes are likely.**

**Mitigation:**
- Pin exact versions in package.json. Don't auto-update.
- Wrap OpenTUI behind a thin adapter layer (`packages/tui/src/renderer.ts`). If we need to swap to Ink, only this file changes.
- OpenTUI uses Yoga for layout (same as Ink). Components can be ported.
- Budget 1-2 days for Ink migration if OpenTUI becomes unmaintained.

## RISK-005: Vercel AI SDK Breaking Changes (Probability: MEDIUM | Impact: MEDIUM)

**AI SDK is actively developed. Major version bumps break things.**

**Mitigation:**
- Pin exact version. Update on our schedule, not theirs.
- Abstract provider calls behind our own `LLM.Service` interface. AI SDK is an implementation detail.
- AI SDK's language model spec is published as open-source — we can fork it if needed.

## RISK-006: Single Developer Burnout (Probability: HIGH | Impact: FATAL)

**150 phases is a marathon. Solo developers burn out.**

**Mitigation:**
- Ship early. Ship often. Get users. Users provide motivation.
- Celebrate milestones: v0.1 (usable), v0.2 (extensible), v1.0 (production).
- Take breaks. The codebase will wait.
- Build in public. Blog posts, tweets, Show HN. External accountability helps.
- Automate grunt work (CI/CD, tests, releases) early to reduce friction.

## RISK-007: Competing Projects Ship Better/Faster (Probability: MEDIUM | Impact: MEDIUM)

**opencode, dsh, Claurst, Aery, dreb, CoderAgent — all shipping. What if one of them becomes the definitive open-source Claude Code?**

**Mitigation:**
- Don't compete on features. Compete on architecture + UX.
- Our differentiators: client/server split, everything-is-a-plugin kernel, cross-agent delegation, web dashboard, built-in evals. These are genuinely novel combinations.
- If a competitor nails it, pivot to being the best *extensible platform* built on top of them.
- The market is big enough for multiple winners. Claude Code is proprietary — there's demand for open alternatives.

## RISK-008: Windows Sandboxing is Hard (Probability: HIGH | Impact: LOW)

**Windows ACL restricted-token runner is the most complex native piece.**

**Mitigation:**
- Windows sandbox can be simpler in v1: just deny certain paths, don't do full ACL isolation.
- Docker-on-Windows (WSL2) as the strong sandbox option.
- Landlock and Seatbelt are simpler. Windows is the odd one out.
- Budget 2 weeks specifically for Windows sandbox. If it takes longer, ship without it and mark as experimental.

## RISK-009: Context Window Limits Kill UX (Probability: MEDIUM | Impact: MEDIUM)

**Large codebases + many MCP tools + long conversations = context overflow.**

**Mitigation:**
- Aggressive lazy loading: MCP tools load on-demand, not all at start.
- Microcompaction: prune old tool results, keep only recent ones.
- Summarizing condenser: auto-summarize when approaching limits (OpenHands proved this cuts cost 2x with no quality loss).
- Subagents: offload exploratory work to isolated contexts.
- Per-provider context budgeting (different models have different limits).

## RISK-010: Breaking the Event Log Format (Probability: MEDIUM | Impact: HIGH)

**If we change the SessionEvent schema in a breaking way, all stored sessions become unreadable.**

**Mitigation:**
- Event log schema MUST be versioned from day 1. Include `version: number` in every event.
- Write migration functions for every schema version bump.
- Never change event shapes — add new event types instead of modifying existing ones.
- The append-only model means old events are always readable. Only the reader needs updating.

---

## Risk Review Schedule

- **Weekly:** Check if any "Probability: HIGH" risks have materialized.
- **Monthly:** Reassess all risks. Add new ones. Archive resolved ones.
- **Per release:** Final risk check before shipping.

## Risk Severity Matrix

| | Impact: LOW | Impact: MEDIUM | Impact: HIGH | Impact: FATAL |
|---|---|---|---|---|
| **Probability: HIGH** | RISK-008 | RISK-003 | RISK-006 | RISK-001 |
| **Probability: MEDIUM** | - | RISK-004, 005, 009 | RISK-007 | - |
| **Probability: LOW** | - | - | RISK-002 | - |
