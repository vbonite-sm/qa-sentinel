# qa-sentinel

The open-source test intelligence layer for Playwright — AI-powered failure analysis, flakiness detection, self-healing selectors, performance regression alerts, and a modern interactive dashboard. Fully self-hostable: no license keys, no tier gates, no lock-in.

![Report Overview](https://raw.githubusercontent.com/vbonite-sm/qa-sentinel/main/images/report-overview-dark.png)
*Dashboard with quality gates, quarantine, suite health grade, attention alerts, and failure clusters*

## Installation

```bash
npm install -D qa-sentinel
```

## Quick Start

Add to your `playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['qa-sentinel', {
      outputFile: 'qa-sentinel-report.html',
      historyFile: 'test-history.json',
      maxHistoryRuns: 10,
    }],
  ],
});
```

Run your tests and open the generated `qa-sentinel-report.html`.

## Features

### Core Analysis

- **AI Failure Analysis** — Claude/OpenAI/Gemini-powered fix suggestions with batched analysis for large suites
- **Flakiness Detection** — Historical tracking to identify unreliable tests across runs (not single-run retries)
- **Performance Regression Alerts** — Warns when tests get significantly slower than their historical average
- **Stability Scoring** — Composite health metrics (0-100 with grades A+ to F)
- **Failure Clustering** — Groups similar failures by error type with per-cluster AI analysis
- **Retry Analysis** — Tracks tests that frequently need retries

### Interactive Dashboard

- **Sidebar Navigation** — Overview, Tests, Trends, Comparison, Gallery views
- **Theme Support** — Light, dark, system, and 6 additional presets (Ocean, Sunset, Dracula, Cyberpunk, Forest, Rose)
- **Keyboard Shortcuts** — `1-5` switch views, `j/k` navigate tests, `f` focus search, `e` export summary
- **Virtual Scroll** — Pagination for large test suites

### Test Details

![Test Expanded](https://raw.githubusercontent.com/vbonite-sm/qa-sentinel/main/images/test-expanded-dark.png)
*Expanded test card with step timeline, network logs, run history, and quarantine badge*

- **Step Timing Breakdown** — Visual bars highlighting the slowest step
- **Flamechart Visualisation** — Colour-coded timeline (navigation, assertion, action, API, wait)
- **Network Logs** — API calls with status codes, timing, and payload details extracted from trace files
- **Inline Trace Viewer** — Film strip, before/after screenshots, network waterfall, console messages
- **Screenshot Embedding** — Failure screenshots displayed inline
- **Browser & Project Badges** — Shows which browser/project each test ran against
- **Annotation Support** — `@slow`, `@fixme`, `@skip`, `@issue`, `@flaky`, `@bug`, `@todo`, and custom annotations

### Trend Analytics

![Trend Charts](https://raw.githubusercontent.com/vbonite-sm/qa-sentinel/main/images/trends-dark.png)
*Interactive trend charts with pass rate, duration, flaky tests, and slow test tracking*

- **Moving Averages** — Overlay on pass rate and duration trends
- **Anomaly Detection** — 2-sigma outlier detection with visual markers
- **Clickable History** — Click any chart bar to drill into that historical run

### Artifact Gallery

![Gallery View](https://raw.githubusercontent.com/vbonite-sm/qa-sentinel/main/images/gallery-dark.png)
*Visual grid of screenshots, videos, and trace files*

### Flakiness Detection

![Comparison View](https://raw.githubusercontent.com/vbonite-sm/qa-sentinel/main/images/comparison-dark.png)
*Run comparison showing new failures, performance changes, and baseline diffs*

qa-sentinel tracks flakiness **across runs**, not within a single run:

| | Playwright HTML Report | qa-sentinel |
|---|---|---|
| **Scope** | Single test run | Historical across multiple runs |
| **Criteria** | Fails then passes on retry | Failed 30%+ of the time historically |
| **Use Case** | Immediate retry success | Chronically unreliable tests |

Indicators: **Stable** (<10% failure rate) — **Unstable** (10-30%) — **Flaky** (>30%) — **New** (no history)

---

## Sentinel CLI

The `sentinel` CLI wraps Playwright and adds intelligence: predictive filtering, healing, AI queries, and integration pushes.

```bash
# Run tests (wraps `npx playwright test`, passes args through verbatim)
npx sentinel test

# Run tests with predictive filtering — skips tests predicted to pass
npx sentinel test --predict

# Apply pending selector healing suggestions interactively
npx sentinel heal

# Ask Sentinel about your test history (single-shot or REPL)
npx sentinel ask "why are my login tests flaky?"
npx sentinel ask

# Open the last generated HTML report in browser
npx sentinel report

# Show suite health grade and trend summary
npx sentinel status

# Structured, agent-friendly failure analysis for the last run
npx sentinel diagnose
npx sentinel diagnose --json

# Push results to configured Scribe targets (Jira, GitHub, Slack, Teams)
npx sentinel sync
```

### sentinel.config.js

Place a `sentinel.config.js` (or `sentinel.config.json`) in your project root to configure the ecosystem modules:

```javascript
// sentinel.config.js
const { defineConfig } = require('qa-sentinel/cli')

module.exports = defineConfig({
  agent: {
    heal: true,                    // Enable selector healing
    cdp: true,                     // Enable CDP fixture integration
    circuitBreakerThreshold: 3,    // Quarantine test after N failures in a run
  },
  sage: {
    ai: 'claude',                  // 'claude' | 'openai'
    digest: true,                  // Write AI digest after each run
    historyDepth: 5,               // Prior runs to include in context
  },
  scribe: {
    jira: true,                    // Create/update Jira tickets for failures
    github: true,                  // Post PR comments
    slack: true,                   // Post to Slack channel
    teams: false,
    jiraCloseOnNConsecutivePasses: 3,
  },
  seer: {
    predict: false,                // Enable by default (or use --predict flag)
    minConfidence: 0.8,            // Skip tests above this confidence threshold
    diffBase: 'HEAD~1',            // Git ref to diff against
  },
})
```

---

## Ecosystem Modules

### Sentinel Agent — Self-Healing Selectors

The Agent module hooks into your test run via a Playwright fixture. When a selector fails, it analyses the DOM to find the closest matching element and generates a healing suggestion.

```typescript
// playwright.config.ts
import { sentinelFixtures } from 'qa-sentinel/fixtures'

export default defineConfig({
  use: {
    ...sentinelFixtures,
  },
})
```

Suggestions are stored in `.sentinel/heal-suggestions.json`. Review and apply them with:

```bash
npx sentinel heal
```

The **circuit breaker** quarantines a test after it fails N times in a single run (default: 3), preventing cascading failures from poisoning the run. State is written to `.sentinel/runs/{runId}/quarantine.json`.

### Sentinel Sage — AI Assistant

Sage provides an AI-powered REPL and post-run digest using your test history as context. It uses Claude by default (`claude-opus-4-6`), falling back gracefully if no API key is present.

```bash
# Single-shot query
npx sentinel ask "which tests have been flaky this week?"

# Interactive REPL
npx sentinel ask
```

Set your AI key as an environment variable:

```bash
export ANTHROPIC_API_KEY=your-key   # Claude (preferred)
export OPENAI_API_KEY=your-key      # OpenAI
```

### Sentinel Scribe — Integrations

Scribe pushes test results to external systems after a run. Configure targets in `sentinel.config.js`, then run:

```bash
npx sentinel sync
```

| Target | Required env vars |
|---|---|
| Jira | `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY` |
| GitHub PR | `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, PR number from CI env |
| Slack | `SLACK_WEBHOOK_URL` or `SLACK_BOT_TOKEN` + `SLACK_CHANNEL` |
| Teams | `TEAMS_WEBHOOK_URL` |

Scribe tracks filed tickets and comments in `.sentinel/scribe-store.json` and keeps them updated as tests pass or fail.

### Sentinel Seer — Predictive Filtering

Seer analyses your test history and git diff to predict which tests are likely to pass unchanged, then generates `--grep-invert` patterns to skip them.

```bash
npx sentinel test --predict
```

Safety guarantees:
- New tests (no history) are **always run**
- Tests touching changed files (per `git diff`) are **always run**
- Only tests above `minConfidence` threshold are skipped

Disable per-run with `--no-predict`.

---

## Agent-Native Output

Sentinel is built to be called by AI coding agents (Claude Code, Copilot, Cursor) and CI scripts — not just read by humans.

### Structured diagnosis

`sentinel diagnose --json` emits a machine-readable analysis of the last run: a heuristic root-cause category per failure (`timing`, `selector-not-found`, `assertion`, `network`, `resource-exhaustion`), a flaky verdict, stability grade, and any pending self-healing selector suggestions.

```bash
npx sentinel diagnose --json | jq '.failures[] | {title, category, confidence}'
```

Root-cause categorization is **heuristic-first** — fast, transparent, and free, with no LLM call required. Pipe the JSON to an agent when you want deeper analysis on top.

### MCP server

Sentinel ships an optional [Model Context Protocol](https://modelcontextprotocol.io) server so agents can call it as a verification layer:

```bash
npm install @modelcontextprotocol/sdk   # optional peer dependency
npx qa-sentinel-mcp
```

Tools exposed: `get_last_run`, `diagnose_failure`, `get_flaky_tests`, `suggest_heal`. The CLI JSON path is the primary, most token-efficient surface; MCP is complementary.

---

## Configuration

### Reporter Options

```typescript
reporter: [
  ['qa-sentinel', {
    // Core
    outputFile: 'qa-sentinel-report.html',
    historyFile: 'test-history.json',
    maxHistoryRuns: 10,
    performanceThreshold: 0.2,

    // AI analysis
    enableAIRecommendations: true,
    ai: {
      model: 'claude-haiku-4-5-20251001',  // override model
      maxTokens: 2048,
    },

    // Feature flags (all default true unless noted)
    enableRetryAnalysis: true,
    enableFailureClustering: true,
    enableStabilityScore: true,
    enableGalleryView: true,
    enableComparison: true,
    enableTrendsView: true,
    enableTraceViewer: true,
    enableNetworkLogs: true,
    enableHistoryDrilldown: false,  // stores per-run snapshots for history drilldown

    // Thresholds
    stabilityThreshold: 70,         // warn below this score
    retryFailureThreshold: 3,       // warn if needs >3 retries
    thresholds: {
      flakinessStable: 0.1,
      flakinessUnstable: 0.3,
      performanceRegression: 0.2,
      stabilityWeightFlakiness: 0.4,
      stabilityWeightPerformance: 0.3,
      stabilityWeightReliability: 0.3,
      gradeA: 90,
      gradeB: 80,
      gradeC: 70,
      gradeD: 60,
    },

    // Comparison
    baselineRunId: 'main-branch-baseline',

    // Network logging (extracted from trace files)
    networkLogFilter: 'api.example.com',
    networkLogExcludeAssets: true,
    networkLogMaxEntries: 50,

    // Step filtering
    filterPwApiSteps: false,        // true = only show named test.step() entries

    // Path resolution
    relativeToCwd: false,

    // Multi-project history isolation
    projectName: 'ui-tests',
    historyFile: 'reports/{project}/history.json',

    // External run ID (for CI shards)
    runId: process.env.GITHUB_RUN_ID,

    // Notifications
    slackWebhook: process.env.SLACK_WEBHOOK_URL,
    teamsWebhook: process.env.TEAMS_WEBHOOK_URL,
    githubPRComments: true,         // auto-enabled when GITHUB_TOKEN + PR context present
    notifications: [
      {
        channel: 'pagerduty',
        config: { integrationKey: process.env.PAGERDUTY_KEY },
        conditions: { minFailures: 5 },
      },
    ],

    // Exports
    exportJson: true,               // writes smart-report-data.json
    exportJunit: true,              // writes JUnit XML
    exportPdf: true,                // executive PDF (pdfkit, 3 colour themes)
    exportPdfFull: false,           // full HTML-to-PDF via Playwright chromium

    // Theme
    theme: {
      preset: 'dracula',            // system | light | dark | ocean | sunset | dracula | cyberpunk | forest | rose
    },

    // Custom theme colours
    theme: {
      primary: '#6366f1',
      accent: '#8b5cf6',
      success: '#22c55e',
      error: '#ef4444',
      warning: '#f59e0b',
    },

    // Branding
    branding: {
      title: 'Acme Corp Test Report',
      footer: 'Generated by QA Team',
      logo: 'https://example.com/logo.png',
      hidePoweredBy: false,
    },

    // Quality gates
    qualityGates: {
      minPassRate: 95,
      maxFlakyRate: 5,
      maxFailures: 0,
      minStabilityGrade: 'B',
      noNewFailures: true,
    },

    // Flaky test quarantine
    quarantine: {
      enabled: true,
      threshold: 0.3,              // flakiness score to trigger quarantine
      maxQuarantined: 50,
      outputFile: '.smart-quarantine.json',
    },

    // CSP-safe mode (saves attachments as files instead of base64)
    cspSafe: false,
    maxEmbeddedSize: 5 * 1024 * 1024,

    // Cloud upload (Sentinel Cloud)
    uploadToCloud: false,
    apiKey: process.env.SENTINEL_API_KEY,
  }],
]
```

### AI Analysis

Set one of these environment variables to enable AI-powered failure analysis:

```bash
export ANTHROPIC_API_KEY=your-key    # Claude (preferred)
export OPENAI_API_KEY=your-key       # OpenAI
export GEMINI_API_KEY=your-key       # Google Gemini
```

Provider priority: Anthropic > OpenAI > Gemini. Failures are analysed in batches (3 concurrent) with fix suggestions embedded in the report.

---

## Stability Grades

Composite score (0-100) from three factors:

| Factor | Weight | Description |
|---|---|---|
| Flakiness | 40% | Inverse of flakiness score |
| Performance | 30% | Execution time consistency |
| Reliability | 30% | Pass rate from history |

Grades: **A+** (95-100), **A** (90-94), **B** (80-89), **C** (70-79), **D** (60-69), **F** (<60). All weights and thresholds are configurable.

---

## Quality Gates

Fail CI builds when results don't meet your thresholds.

Inline in `playwright.config.ts`:

```typescript
qualityGates: {
  minPassRate: 95,
  maxFlakyRate: 5,
  maxFailures: 0,
  minStabilityGrade: 'B',
  noNewFailures: true,
}
```

Or as a standalone CLI step after tests run:

```bash
npx qa-sentinel gate --pass-rate 95 --flaky-rate 5
```

Exit codes: `0` = all gates passed, `1` = gate failed. Use as a blocking CI step.

---

## Annotations

| Annotation | Badge | Annotation | Badge |
|---|---|---|---|
| `@slow` | Amber | `@fixme` / `@fix` | Pink |
| `@skip` | Indigo | `@fail` | Red |
| `@issue` / `@bug` | Red | `@flaky` | Orange |
| `@todo` | Blue | Custom | Grey |

```typescript
test('payment flow', async ({ page }) => {
  test.slow();
  test.info().annotations.push({ type: 'issue', description: 'JIRA-123' });
});
```

---

## CI Integration

### Persisting History

History must persist between runs for flakiness detection and trends to work.

#### GitHub Actions

```yaml
- uses: actions/cache@v4
  with:
    path: test-history.json
    key: test-history-${{ github.ref }}
    restore-keys: test-history-

- run: npx playwright test

- uses: actions/cache/save@v4
  if: always()
  with:
    path: test-history.json
    key: test-history-${{ github.ref }}-${{ github.run_id }}
```

#### GitLab CI

```yaml
test:
  cache:
    key: test-history-$CI_COMMIT_REF_SLUG
    paths: [test-history.json]
    policy: pull-push
  script: npx playwright test
```

#### CircleCI

```yaml
- restore_cache:
    keys: [test-history-{{ .Branch }}, test-history-]
- run: npx playwright test
- save_cache:
    key: test-history-{{ .Branch }}-{{ .Revision }}
    paths: [test-history.json]
```

#### Azure DevOps

```yaml
steps:
  - task: Cache@2
    inputs:
      key: 'test-history | "$(Build.SourceBranchName)"'
      restoreKeys: 'test-history |'
      path: test-history.json

  - script: npx playwright test
    continueOnError: true

  - task: PublishPipelineArtifact@1
    inputs:
      targetPath: qa-sentinel-report.html
      artifact: qa-sentinel-report
    condition: always()
```

### CI Auto-Detection

GitHub Actions, GitLab CI, CircleCI, Jenkins, Azure DevOps, and Buildkite are automatically detected. Branch, commit SHA, and build ID appear in the report header.

### Quality Gates in CI

```yaml
- run: npx playwright test
  continue-on-error: true

- run: npx qa-sentinel gate --pass-rate 95 --flaky-rate 5
  # Exits non-zero if gates fail — blocks the pipeline
```

### Sharded Runs

For consistent history across parallel shards, set `runId`:

```typescript
reporter: [
  ['qa-sentinel', {
    runId: process.env.GITHUB_RUN_ID,
  }],
]
```

### Merging History from Multiple Machines

```bash
npx qa-sentinel-merge-history \
  shard1/test-history.json \
  shard2/test-history.json \
  -o merged-history.json \
  --max-runs 10
```

---

## Utility CLIs

```bash
# Serve the report locally (avoids file:// CORS issues with trace viewer)
npx qa-sentinel-serve qa-sentinel-report.html

# Open a trace file directly
npx qa-sentinel-view-trace ./traces/my-test-trace-0.zip

# Quality gate check (standalone)
npx qa-sentinel gate --pass-rate 95 --flaky-rate 5

# Merge shard histories
npx qa-sentinel-merge-history s1/history.json s2/history.json -o merged.json
```

---

## Trace Viewer

### Inline Viewer

Click **View** on any test with traces to open the built-in viewer with film strip, actions panel, before/after screenshots, network waterfall, console messages, and errors.

### Local Server

```bash
npx qa-sentinel-serve qa-sentinel-report.html
```

Serves the report with full trace viewer support — no `file://` CORS issues.

---

## Network Logs

Automatically extracted from Playwright trace files — no code changes required. Shows method, URL, status code, duration, and payload sizes. Requires tracing enabled in your Playwright config:

```typescript
use: {
  trace: 'retain-on-failure',  // or 'on'
}
```

---

## Step Filtering

```typescript
reporter: [
  ['qa-sentinel', {
    filterPwApiSteps: true,  // Only show named test.step() entries
  }],
]
```

With filtering on, verbose `page.click()`, `page.fill()` steps are hidden — only your named `test.step()` entries appear in the timeline.

---

## Multi-Project History

Isolate history per test suite to prevent metric contamination across different projects:

```typescript
reporter: [
  ['qa-sentinel', {
    projectName: 'api',
    historyFile: 'reports/{project}/history.json',
  }],
]
```

---

## CSP-Safe Mode

For environments with strict Content Security Policy:

```typescript
reporter: [
  ['qa-sentinel', { cspSafe: true }],
]
```

Screenshots saved as separate files instead of base64, system fonts instead of Google Fonts.

---

## Cucumber Integration

Works with Playwright + Cucumber frameworks:

```typescript
import { defineBddConfig } from 'playwright-bdd';

const testDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: 'steps/**/*.ts',
});

export default defineConfig({
  testDir,
  reporter: [['qa-sentinel']],
});
```

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| No history data | History file missing or wrong path | Check `historyFile` path, use CI caching |
| No network logs | Tracing not enabled | Add `trace: 'retain-on-failure'` to Playwright config |
| No AI suggestions | Missing API key | Set `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY` |
| Mixed project metrics | Shared history file | Use `projectName` to isolate |
| Quality gate not failing CI | Gate not run as separate step | Run `npx qa-sentinel gate` as its own CI step |
| RangeError with large suites | Node.js heap exhausted | `NODE_OPTIONS=--max-old-space-size=4096 npx playwright test` |
| Report too large | Large embedded attachments | Enable `cspSafe: true` or reduce `maxEmbeddedSize` |

---

## Development

```bash
npm install
npm run build
npm test
npm run test:demo
```

---

## Roadmap

- [ ] **Seer UI** — display predicted-skip decisions in the report
- [ ] **Scribe digest push** — publish health digests to Confluence/Notion
- [ ] **Multi-framework adapters** — Cypress, WebdriverIO, Vitest, pytest result normalisation
- [ ] **Sentinel Cloud** — hosted dashboards, managed AI credits, SSO

---

## Contributors

- [Gary Parker](https://github.com/qa-gary-parker) — Original author
- [Filip Gajic](https://github.com/Morph93) — UI redesign
- [Liam Childs](https://github.com/liamchilds) — Parameterized project support

## License

MIT — see [LICENSE](./LICENSE).
