# Sentinel Ecosystem Design

**Date:** 2026-03-21
**Status:** Approved
**Author:** QA Engineering
**See also:** [Product Strategy & Market Analysis (2026-06-03)](./2026-06-03-product-strategy.md) — market positioning, competitive landscape, and the agent-native direction.

---

## 1. Vision & Positioning

**Sentinel is your intelligent QA assistant.**

Sentinel is not a reporter with AI features bolted on. It is an AI-powered layer that wraps the entire Playwright test lifecycle — understanding your tests, learning from history, and taking action so you don't have to.

**Adoption motion:** Bottom-up PLG. An SDET installs it, gets immediate value, shows it to their QA Lead who sees team dashboards and reports, who shows it to the CTO who sees cost savings and confidence signals.

---

## 2. Scope

**One npm package (`qa-sentinel`).** All capabilities ship as modules within a single install. No separate packages to manage, no versioning matrix, no fragmented adoption. Users install once and enable what they need.

**All four lifecycle phases are in scope:**
- **During (Phase B)** — runtime intelligence while tests run *(highest priority)*
- **After (Phase C)** — post-run AI analysis and trends *(second priority)*
- **Integrate (Phase D)** — push intelligence to team tools *(third priority)*
- **Before (Phase A)** — pre-run prediction and filtering *(fourth priority)*

---

## 3. Architecture

### 3.1 Entry Point

`npx sentinel test` replaces `npx playwright test`. Sentinel invokes Playwright internally as a child process and fires lifecycle hooks that each module subscribes to. Existing `playwright.config.ts` is untouched. No test code modifications required.

**Hook mechanism:** Sentinel does not parse Playwright's stdout for structured data. Instead, it registers the existing `QaSentinel` Playwright reporter automatically (injected into the Playwright config at runtime), which provides structured lifecycle callbacks (`onBegin`, `onTestEnd`, `onEnd`, etc.). Module hooks that run in the same process as the CLI (Sage, Scribe, Seer) are called directly by the reporter as in-process method calls. Modules that run in Playwright's worker processes (Agent fixture) cannot communicate via in-process calls — they communicate via the shared `.sentinel/` filesystem store (fixture writes, reporter reads at `onTestEnd`). The reporter is the canonical event source; the CLI is the process owner and orchestrator.

```bash
# Before Sentinel
npx playwright test

# After Sentinel — drop-in replacement, same args work
npx sentinel test
npx sentinel test --grep @smoke
npx sentinel test --heal        # Agent: enable auto-heal suggestions
npx sentinel test --predict     # Seer: skip tests predicted to PASS with confidence ≥ seer.minConfidence (default 0.8). Never skips predicted failures.
```

**Backward compatibility:** `npx playwright test` continues to work. The existing Playwright reporter works standalone. `sentinel test` is a strict superset. **No test code modifications are required for core functionality** (CLI, Sage, Scribe, Seer). Agent CDP capabilities (self-healing, health monitoring) require an optional one-line fixture opt-in in the user's base fixture file — this is explicitly opt-in, not a requirement for the CLI to function.

### 3.2 Module Build Order

```
                    ┌─ Sentinel Agent  (runtime intelligence)
                    ├─ Sentinel Sage   (post-run AI)
Sentinel CLI ───────┤
  (backbone)        ├─ Sentinel Scribe (integrations)
                    │
                    └──────────────────────────────→ Sentinel Seer (pre-run AI)
```

The CLI must exist before anything else — it provides the process lifecycle and hook system. After the CLI is built, Agent, Sage, and Scribe can be built in any order (they are independent of each other, only depending on the CLI). Seer is last because it requires multiple runs of history data in `.sentinel/history.json` to generate meaningful predictions — Agent and Sage should be populating that data before Seer is built.

### 3.3 Lifecycle Hooks

The CLI fires these hooks in order. Modules register handlers against them.

| Hook | Phase | Module |
|---|---|---|
| `onBeforeRun` | Pre-run | Seer |
| `onRunStart` | Run start | Agent: initialise `.sentinel/` working directories, prepare fixture IPC channel. CDP attachment happens per-test inside the `sentinelFixtures` Playwright fixture (not at this hook). |
| `onTestEnd` | Per test | Agent: reads fixture-written DOM snapshot + health metrics from `.sentinel/`, runs selector analysis |
| `onRunEnd` | Post-run | Sage (AI analysis); this hook also triggers report HTML generation, which on completion fires `onReportGenerated` |
| `onReportGenerated` | Post-report | Sage (digest + PDF) — fires after the HTML report file is written to disk |
| `onComplete` | Final | Scribe (push to Jira/GitHub/Confluence) |

### 3.4 Configuration

A `sentinel.config.ts` file co-located with `playwright.config.ts`. Each module is opt-in via its named block.

```ts
import { defineConfig } from 'qa-sentinel'

export default defineConfig({
  agent:  { heal: true, cdp: true, circuitBreakerThreshold: 3 },
  sage:   { ai: 'claude', digest: true, historyDepth: 50 },
  scribe: { jira: true, github: true },
  seer:   { predict: true, minConfidence: 0.8, diffBase: 'HEAD~1' },
})
```

---

## 4. Modules

### 4.1 Sentinel CLI *(Sub-project 1 — Build First)*

**Responsibility:** Owns the process. Invokes `playwright test` as a child process, intercepts output, fires lifecycle hooks, loads and initialises enabled modules.

**Technical approach:**
- Node.js CLI (`bin/sentinel.js`) using `commander`
- Spawns `playwright test` via `child_process.spawn`, pipes stdio transparently
- Loads `sentinel.config.ts` at startup, initialises module registry
- Module registry pattern: each module exports `{ hooks }` and registers on load

**Commands:**
```bash
sentinel test        # run tests (wraps playwright test)
sentinel heal        # Agent: apply pending selector fixes (with confirmation). Stub in Sub-project 1 (CLI); fully implemented in Sub-project 2 (Agent). Stub exits with "No Agent module installed" until Agent is built.
sentinel ask "..."   # Sage: natural language Q&A on test history
sentinel report      # open last HTML report
sentinel sync        # Scribe: push to configured targets
sentinel status      # health grade + trend summary
sentinel merge       # merge blob reports from sharded runs (already exists — no changes required by this spec)
```

**Data written:** `.sentinel/last-run.json`, `.sentinel/config-cache.json`

**Migration handled by CLI:** On first run, auto-moves legacy `sentinel-history.json` (project root) → `.sentinel/history.json` and deletes the original.

---

### 4.2 Sentinel Agent *(Sub-project 2)*

**Responsibility:** Intelligence during the run. Attaches a CDP sidecar to each browser worker, monitors health, detects broken selectors, and flags anomalies in real time.

**Technical approach:**
- CDP attachment uses a **Playwright fixture** (`sentinelFixtures`) that wraps `page` and `browser` — this is the correct hook point for per-test browser access in Playwright's worker model. Users extend their base fixture with `sentinelFixtures` to enable Agent capabilities (one-line change in their fixtures file).
- The fixture opens a CDP session on the active browser context via `page.context().browser()` at `beforeEach`, attaches the health monitor, and closes cleanly at `afterEach`.
- **Selector failure detection mechanism:** The fixture registers an `afterEach` auto-hook (`{ auto: true }`). When a test fails, the hook checks the error message for Playwright locator patterns (`locator(`, `getByRole(`, etc.) indicating a selector issue. If matched, it calls `page.evaluate(() => document.documentElement.outerHTML)` to capture a DOM snapshot, serialised to the per-test fixture file. The reporter's `onTestEnd` reads this file, runs a selector similarity algorithm (token overlap + DOM structure scoring) against the snapshot to generate replacement candidates, and writes the top candidate to `.sentinel/heal-suggestions.json`.
- `sentinel heal` applies suggestions with interactive confirmation prompt
- Per-test fixture output files are named `{runId}-{workerIndex}-{testIdHash}-fixture.json` and written to `.sentinel/runs/{runId}/`. The reporter matches them to `onTestEnd` callbacks using the same `runId` (injected via `process.env.SENTINEL_RUN_ID` at CLI spawn) + test title hash. This is collision-safe across parallel workers.
- **Aggregation:** At `onTestEnd`, the reporter reads the matching per-test fixture file, extracts any heal suggestions, and appends them to the top-level `.sentinel/heal-suggestions.json` (creating it if absent). The per-test fixture files are ephemeral and cleaned up after each run. `.sentinel/heal-suggestions.json` is the persistent, user-facing suggestions store that `sentinel heal` reads.

**Capabilities:**
- Self-healing selector detection — suggests replacements for broken locators
- Auto-heal mode (`--heal` flag) — applies suggestions automatically (Team tier)
- Memory leak detection — heap delta >50MB = warning, >100MB = hard flag
- Console error capture and categorisation
- Flakiness circuit-breaker — auto-quarantines a test after N consecutive failures within a run. Default N = 3, configurable via `agent.circuitBreakerThreshold` in `sentinel.config.ts`. Community: N fixed at 3. Pro/Team: configurable.
- Live terminal run dashboard

**Tier:** All Agent capabilities are fully open source. `sentinelFixtures` is always active — no tier check, no no-op path.

---

### 4.3 Sentinel Sage *(Sub-project 3)*

**Responsibility:** Makes sense of what happened. Extends the existing AI analyzer into a full post-run intelligence engine with natural language Q&A, trend modeling, and predictive scoring.

**Technical approach:**
- Extends `src/ai/` with a multi-turn LLM context builder
- Context includes: current run results, last N runs from history (default N = 50, configurable via `sage.historyDepth`), step data, network logs, code context (file paths)
- `sentinel ask "query"` — single-shot: prints answer and exits. `sentinel ask` (no argument) — drops into a multi-turn REPL session. Both use the same LLM context (full run history + current run).
- Trend modeling runs as a post-processing pass over `history.json`

**Capabilities:**
- Root cause analysis per failure — reads steps, history, network logs, not just stack trace
- Multi-run trend anomaly detection ("stability dropped 2 grades this week")
- Surfaces Seer's predictive scores in reports and Q&A (Sage does not compute predictions independently — Seer owns the prediction model; Sage consumes and presents it)
- Natural language Q&A REPL: `sentinel ask "what's been flaky this sprint?"`
- Executive digest — Markdown summary + PDF, schedulable via CI

**Tier:** All Sage capabilities are fully open source. Local usage is unlimited — bring your own API key. Sentinel Cloud provides hosted AI credits for teams that do not manage their own key.

---

### 4.4 Sentinel Scribe *(Sub-project 4)*

**Responsibility:** Closes the loop. Takes Sentinel's intelligence and pushes it into team tools — without manual copy-paste.

**Technical approach:**
- Extends `src/notifiers/` with action-oriented `ScribeTarget` adapter interface
- Each integration implements `ScribeTarget`: `{ canHandle(), push(runManifest) }`
- Jira adapter: REST API v3, auto-files on new failures, auto-closes on recovery
- Confluence adapter: structured wiki pages from report data, updates existing page on re-run
- GitHub adapter: extends existing notifier with richer comment templates
- Duplicate prevention: `ScribeRecord` in `.sentinel/scribe.json` tracks what was already filed

**Capabilities:**
- Jira: auto-file tickets (title, severity, steps to reproduce, linked report)
- Jira: auto-close tickets when tests recover. "Recovery" = first passing run after the failure that triggered the ticket (configurable via `scribe.jiraCloseOnNConsecutivePasses`, default 1).
- Confluence: publish test health page per sprint/run
- GitHub: PR quality gate comments (extends existing)
- Slack / Teams: structured degradation digest (extends existing notifiers)
- `sentinel sync` — manual trigger for any configured Scribe target

**Tier:** All Scribe integrations are fully open source. Users configure credentials locally. Sentinel Cloud manages credentials, webhook endpoints, and retry logic for teams that prefer zero-infrastructure setup.

---

### 4.5 Sentinel Seer *(Sub-project 5)*

**Responsibility:** Saves CI time before a single test fires. Uses history, git diff, and flakiness data to decide what is worth running.

**Technical approach:**
- `onBeforeRun` hook runs before Playwright spawns. Sentinel first calls `playwright test --list --reporter=json` to obtain the full test list without executing anything. Seer scores each test and produces a filtered subset. Sentinel then spawns `playwright test` with a generated `--grep` pattern (or `--shard` reordering) reflecting Seer's decisions.
- `git diff --name-only HEAD~1` (configurable via `diffBase`) maps changed files to affected tests via static import graph analysis. Import graph is built using `madge` (TypeScript/JS static analysis). Falls back to filename pattern matching (test file path contains the changed file's basename) when `madge` cannot resolve the graph.
- Failure prediction: weighted score per test from flakiness rate, recent trend, last N outcomes stored in `history.json`.
- `--predict` flag skips tests scoring ≥`minConfidence` predicted-pass; `--no-predict` disables filtering entirely.

**Capabilities:**
- Change-aware test selection — only run tests affected by this diff
- Failure prediction score per test (0–1 confidence)
- `--predict` flag: **skips tests predicted to PASS** with confidence ≥ `minConfidence` (default 0.8). A higher threshold is more conservative — fewer tests are skipped. Seer never skips predicted failures. Only tests it is highly confident will pass are filtered out, preserving safety.
- **New tests (no history):** Tests appearing in `history.json` for the first time are **always run**, regardless of `--predict` or `minConfidence`. No history = no prediction = cannot be skipped. This is non-configurable.
- `--no-predict` flag: explicitly disables Seer filtering even if `seer.predict: true` is set in config (useful for full regression runs in CI)
- Smart shard ordering — longest-running tests first (reduces total CI wall time)
- Pre-flight flaky filter — remove known-flaky tests before run (optionally)

**Tier:** All Seer capabilities are fully open source.

---

## 5. Shared Data Model

All modules read/write to `.sentinel/` at the project root. Gitignored by default, optionally committable for team history sharing.

### 5.1 Directory Structure

```
.sentinel/
├── history.json            # rolling N-run history (renamed from sentinel-history.json)
├── last-run.json           # manifest of the most recent run
├── heal-suggestions.json   # Agent: pending selector fixes
├── predictions.json        # Seer: predictions + actuals (feedback loop)
├── scribe.json             # Scribe: record of filed tickets/pages
├── config-cache.json       # resolved sentinel config
└── runs/
    └── {runId}/
        ├── manifest.json   # full test result data
        ├── metrics.json    # Agent: CDP health metrics
        └── report.html     # generated HTML report
```

### 5.2 Core Types

```ts
interface RunManifest {
  runId: string
  timestamp: string
  branch?: string
  commitSha?: string
  results: TestResultData[]       // existing — unchanged
  healthMetrics?: HealthMetrics   // Agent
  predictions?: PredictionRecord  // Seer
  aiAnalysis?: AIAnalysis         // Sage
}

interface HealthMetrics {
  memoryDeltaMB: number
  cpuAvgPercent: number
  consoleErrors: string[]
  networkFailures: string[]
}

interface PredictionRecord {
  testsSkipped: string[]
  predictions: {
    testId: string
    predictedOutcome: 'pass' | 'fail' | 'flaky'
    confidence: number
    actual?: 'pass' | 'fail' | 'flaky'  // filled after run completes
  }[]
}

// Agent: stored in .sentinel/heal-suggestions.json
interface HealSuggestion {
  testId: string
  testTitle: string
  brokenSelector: string
  suggestedSelector: string
  confidence: number          // 0–1, match score vs DOM candidates
  detectedAt: string          // ISO timestamp
  status: 'pending' | 'applied' | 'dismissed'
  appliedAt?: string
  filePath: string            // test file where selector lives
  lineNumber?: number
}

interface ScribeRecord {
  testId: string
  jiraTicketId?: string
  confluencePageId?: string
  filedAt: string
  resolvedAt?: string
}
```

**Key principle:** `history.json` is append-only. Modules never mutate past runs. Shard-safe via `sentinel merge` (already exists).

**Migration:** On first `sentinel test` run, the CLI checks for the legacy `sentinel-history.json` file at the project root. If found, it is automatically moved to `.sentinel/history.json` and the original is deleted. No user action required. This is a non-breaking migration.

**Fixture file cleanup:** After each run, the CLI deletes only `*-fixture.json` files within `.sentinel/runs/{runId}/`. The run archive files (`manifest.json`, `metrics.json`, `report.html`) are never touched by cleanup. Cleanup runs at `onComplete`, after Scribe has finished.

---

## 6. Monetization Model

**qa-sentinel is fully open source. All features are available to everyone with no paywalls.**

The `src/license/` module and JWT tier gates are removed entirely. No `LicenseValidator.hasFeature()` checks remain in the codebase.

### 6.1 OSS (Free, Self-Hosted)

Everything in this spec ships as open-source MIT. Users bring their own API keys for AI features (Sage). All CLI, Agent, Sage, Scribe, and Seer capabilities are fully enabled.

### 6.2 Sentinel Cloud (Paid, Hosted)

Cloud adds value on top of the OSS tool — it does not gate any local features.

| Capability | OSS (local) | Sentinel Cloud |
|---|---|---|
| All CLI, Agent, Sage, Scribe, Seer features | ✅ | ✅ |
| Hosted test history + team dashboards | ❌ | ✅ |
| AI credits (Sage without your own API key) | ❌ | ✅ |
| Managed Scribe credentials + webhooks | ❌ | ✅ |
| Cross-repo trend analytics | ❌ | ✅ |
| SSO + team access management | ❌ | ✅ |
| Priority support + SLAs | ❌ | ✅ |

**Cloud adoption motion:** Bottom-up PLG. SDET gets value locally → QA Lead sees team dashboards → CTO sees CI cost reduction from Seer.

**Cloud ROI headline for CTOs:** "Seer reduces CI run time by ~40% through change-aware test selection. Sentinel Cloud makes that data visible across every repo and team."

---

## 7. Reference Tools & Prior Art

| Concept | Source | Sentinel Module |
|---|---|---|
| Registry-first selector management | TestForge (kianwoon) | Sentinel Agent |
| Validation gate architecture | TestForge (kianwoon) | Sentinel CLI |
| Weighted multi-dimensional health score | Vigil (kianwoon) | Sentinel Agent |
| CDP memory/CPU sidecar monitoring | Vigil (kianwoon) | Sentinel Agent |
| Severity prediction from failure text | MachineLearningForQA (Mascarenhas) | Sentinel Scribe |
| Passive accessibility + console capture | SelectorHub Exploratory Tester | Sentinel Agent |
