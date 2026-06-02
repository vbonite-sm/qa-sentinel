import { buildDiagnoseReport } from '../cli/commands/diagnose'
import { readLastRunSnapshot } from '../cli/run-store'
import { readHealSuggestions } from '../agent/heal-store'

/**
 * MCP tool handlers. These are pure, transport-agnostic functions over a
 * project root that return plain JSON-serializable objects. The MCP server
 * (server.ts) is a thin adapter that wires the Model Context Protocol stdio
 * transport to these handlers; the same functions could back any other agent
 * transport. All real logic lives in the CLI/analyzer modules they reuse, so
 * this layer adds zero new data logic and is fully unit-testable without the
 * MCP SDK installed.
 */

export function getLastRun(root = process.cwd()): Record<string, unknown> {
  const last = readLastRunSnapshot(root)
  if (!last) return { found: false }
  const tests = last.snapshot ? Object.values(last.snapshot.tests) : []
  return {
    found: true,
    runId: last.manifest.runId,
    timestamp: last.manifest.timestamp,
    exitCode: last.manifest.exitCode,
    durationMs: last.manifest.durationMs,
    totalTests: tests.length,
  }
}

export function diagnoseFailures(root = process.cwd()): Record<string, unknown> {
  const report = buildDiagnoseReport(root)
  if (!report) return { found: false }
  return { found: true, ...report }
}

export function getFlakyTests(root = process.cwd()): Record<string, unknown> {
  const report = buildDiagnoseReport(root)
  if (!report) return { found: false, flakyTests: [] }
  return { found: true, flakyTests: report.flakyTests }
}

export function suggestHeal(
  testId?: string,
  root = process.cwd()
): Record<string, unknown> {
  const all = readHealSuggestions(root)
  const suggestions = testId ? all.filter(s => s.testId === testId) : all
  return { count: suggestions.length, suggestions }
}
