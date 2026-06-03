import * as fs from 'fs'
import * as path from 'path'
import type { RunSummary, TestHistory, TestResultSnapshot } from '../../types'
import { getSentinelDir } from '../sentinel-dir'
import { readLastRunSnapshot } from '../run-store'
import { analyzeTrends } from '../../sage/trend-analyzer'
import { readHealSuggestions } from '../../agent/heal-store'
import {
  categorizeFailure,
  categoryLabel,
  type RootCauseCategory,
} from '../../analyzers/root-cause-categorizer'

export interface DiagnoseFailure {
  testId: string
  title: string
  file: string
  category: RootCauseCategory
  categoryLabel: string
  confidence: number
  signals: string[]
  error?: string
  flakinessScore?: number
  flakinessIndicator?: string
  stabilityGrade?: string
  heal?: {
    brokenSelector: string
    suggestedSelector: string
    confidence: number
  }
}

export interface DiagnoseReport {
  runId: string
  timestamp: string
  grade: string
  gradeDelta: number
  flakinessTrend: 'improving' | 'stable' | 'degrading'
  passRate: number
  summary: {
    total: number
    passed: number
    failed: number
    flaky: number
    skipped: number
  }
  failures: DiagnoseFailure[]
  flakyTests: Array<{ testId: string; title: string; flakinessScore?: number; flakinessIndicator?: string }>
  generatedAt: string
}

function isUnexpectedFailure(t: TestResultSnapshot): boolean {
  return (
    (t.status === 'failed' || t.status === 'timedOut') &&
    t.outcome !== 'expected' &&
    t.outcome !== 'flaky'
  )
}

/**
 * Assemble the structured diagnose report for the last run, reusing the
 * canonical run snapshot, history trends, the heuristic categorizer, and the
 * heal store. Returns null if there is no last run / no snapshot.
 *
 * This is the shared backing logic for both `sentinel diagnose --json` and the
 * MCP server's `diagnose_failure` tool.
 */
export function buildDiagnoseReport(root = process.cwd()): DiagnoseReport | null {
  const last = readLastRunSnapshot(root)
  if (!last?.snapshot) return null

  const { manifest, snapshot } = last
  const tests = Object.values(snapshot.tests)
  const total = tests.length

  const failedTests = tests.filter(isUnexpectedFailure)
  const flaky = tests.filter(t => t.outcome === 'flaky').length
  const skipped = tests.filter(t => t.status === 'skipped').length
  const failed = failedTests.length
  const passed = total - failed - flaky - skipped
  const passRate = total > 0 ? Math.round(((total - failed) / total) * 100) : 100

  // Trend / grade from history.json summaries.
  const summaries = readSummaries(root)
  const trend = analyzeTrends(summaries)

  // Heal suggestions keyed by testId.
  const healByTest = new Map(readHealSuggestions(root).map(h => [h.testId, h]))

  const failures: DiagnoseFailure[] = failedTests.map(t => {
    const cause = categorizeFailure(t.error)
    const heal = healByTest.get(t.testId)
    return {
      testId: t.testId,
      title: t.title,
      file: t.file,
      category: cause.category,
      categoryLabel: categoryLabel(cause.category),
      confidence: cause.confidence,
      signals: cause.signals,
      error: t.error,
      flakinessScore: t.flakinessScore,
      flakinessIndicator: t.flakinessIndicator,
      stabilityGrade: t.stabilityGrade,
      heal: heal
        ? {
            brokenSelector: heal.brokenSelector,
            suggestedSelector: heal.suggestedSelector,
            confidence: heal.confidence,
          }
        : undefined,
    }
  })

  const flakyTests = tests
    .filter(t => t.outcome === 'flaky' || (t.flakinessScore ?? 0) >= 0.3)
    .map(t => ({
      testId: t.testId,
      title: t.title,
      flakinessScore: t.flakinessScore,
      flakinessIndicator: t.flakinessIndicator,
    }))

  return {
    runId: manifest.runId,
    timestamp: snapshot.timestamp ?? manifest.timestamp,
    grade: trend.currentGrade,
    gradeDelta: trend.gradeDelta,
    flakinessTrend: trend.flakinessTrend,
    passRate,
    summary: { total, passed, failed, flaky, skipped },
    failures,
    flakyTests,
    generatedAt: new Date().toISOString(),
  }
}

function readSummaries(root: string): RunSummary[] {
  const historyPath = path.join(getSentinelDir(root), 'history.json')
  if (!fs.existsSync(historyPath)) return []
  try {
    const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8')) as TestHistory
    return history.summaries ?? []
  } catch {
    return []
  }
}

/** CLI entry: `sentinel diagnose [--json]`. */
export async function runDiagnose(
  opts: { json?: boolean } = {},
  root = process.cwd()
): Promise<void> {
  const report = buildDiagnoseReport(root)

  if (!report) {
    process.stderr.write(
      'qa-sentinel: No run snapshot found. Run `sentinel test` first.\n'
    )
    process.exitCode = 1
    return
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  const { summary } = report
  let gradeDeltaStr = ''
  if (report.gradeDelta > 0) gradeDeltaStr = ` (+${report.gradeDelta})`
  else if (report.gradeDelta < 0) gradeDeltaStr = ` (${report.gradeDelta})`

  const lines = [
    ``,
    `Health Grade:  ${report.grade}${gradeDeltaStr}`,
    `Pass Rate:     ${report.passRate}%`,
    `Tests:         ${summary.total} total · ${summary.passed} passed · ${summary.failed} failed · ${summary.flaky} flaky · ${summary.skipped} skipped`,
    `Flakiness:     ${report.flakinessTrend}`,
    ``,
  ]

  if (report.failures.length > 0) {
    lines.push(`Failures (${report.failures.length}):`)
    for (const f of report.failures) {
      const conf = `${Math.round(f.confidence * 100)}%`
      lines.push(`  - ${f.title}`)
      lines.push(`      ${f.categoryLabel} (${conf})${f.heal ? '  [heal available]' : ''}`)
      if (f.signals.length > 0) lines.push(`      signal: ${f.signals[0]}`)
    }
    lines.push(``)
  } else {
    lines.push(`No unexpected failures.`)
    lines.push(``)
  }

  process.stdout.write(lines.join('\n') + '\n')
}
