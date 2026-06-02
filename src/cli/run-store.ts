import * as fs from 'fs'
import * as path from 'path'
import type {
  RunSnapshotFile,
  TestResultSnapshot,
  TestResultData,
  RunManifest,
} from '../types'
import { ensureRunDir, getSentinelDir } from './sentinel-dir'

/**
 * Canonical per-run snapshot store: `.sentinel/runs/<runId>/snapshot.json`.
 *
 * This is the shared data contract consumed by `sentinel diagnose`, the MCP
 * server, `sentinel sync` (Scribe), and `sentinel report`. The Playwright
 * reporter writes it at the end of a `sentinel test` run; everything else only
 * reads it, so there is a single source of truth for "what happened last run".
 *
 * Heavy fields (base64 screenshots/traces, rendered AI HTML) are intentionally
 * excluded to keep the snapshot small and agent-friendly.
 */

const SNAPSHOT_FILENAME = 'snapshot.json'

/** Project a full TestResultData into the lean snapshot shape. */
function toSnapshot(test: TestResultData): TestResultSnapshot {
  return {
    testId: test.testId,
    title: test.title,
    file: test.file,
    status: test.status,
    duration: test.duration,
    retry: test.retry,
    error: test.error,
    steps: test.steps ?? [],
    aiSuggestion: test.aiSuggestion,
    outcome: test.outcome,
    flakinessScore: test.flakinessScore,
    flakinessIndicator: test.flakinessIndicator,
    performanceTrend: test.performanceTrend,
    stabilityGrade: test.stabilityScore?.grade,
    stabilityOverall: test.stabilityScore?.overall,
    needsAttention: test.stabilityScore?.needsAttention,
    failureClusterType: test.failureCluster?.errorType,
    tags: test.tags,
    suite: test.suite,
    browser: test.browser,
    project: test.project,
  }
}

/** Build the in-memory snapshot object (pure, no I/O). */
export function buildRunSnapshot(
  runId: string,
  timestamp: string,
  results: TestResultData[]
): RunSnapshotFile {
  const tests: Record<string, TestResultSnapshot> = {}
  for (const result of results) {
    tests[result.testId] = toSnapshot(result)
  }
  return { runId, timestamp, tests }
}

/** Persist the run snapshot to `.sentinel/runs/<runId>/snapshot.json`. */
export function writeRunSnapshot(
  runId: string,
  timestamp: string,
  results: TestResultData[],
  root = process.cwd()
): string {
  const runDir = ensureRunDir(runId, root)
  const snapshotPath = path.join(runDir, SNAPSHOT_FILENAME)
  const snapshot = buildRunSnapshot(runId, timestamp, results)
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2))
  return snapshotPath
}

/** Read the snapshot for a specific run, or null if absent/unreadable. */
export function readRunSnapshot(
  runId: string,
  root = process.cwd()
): RunSnapshotFile | null {
  const snapshotPath = path.join(getSentinelDir(root), 'runs', runId, SNAPSHOT_FILENAME)
  if (!fs.existsSync(snapshotPath)) return null
  try {
    return JSON.parse(fs.readFileSync(snapshotPath, 'utf-8')) as RunSnapshotFile
  } catch {
    return null
  }
}

/** Resolve the manifest written by `sentinel test`, or null if absent. */
export function readLastRunManifest(root = process.cwd()): RunManifest | null {
  const lastRunPath = path.join(getSentinelDir(root), 'last-run.json')
  if (!fs.existsSync(lastRunPath)) return null
  try {
    return JSON.parse(fs.readFileSync(lastRunPath, 'utf-8')) as RunManifest
  } catch {
    return null
  }
}

/**
 * Read the most recent run's manifest + snapshot together. Returns null if
 * there is no last run; `snapshot` may be null if the manifest exists but the
 * snapshot was never written (e.g. the reporter was not active).
 */
export function readLastRunSnapshot(
  root = process.cwd()
): { manifest: RunManifest; snapshot: RunSnapshotFile | null } | null {
  const manifest = readLastRunManifest(root)
  if (!manifest) return null
  return { manifest, snapshot: readRunSnapshot(manifest.runId, root) }
}
