import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { buildSageContext } from './context-builder'
import type { RunManifest, RunSummary, TestHistory } from '../types'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sage-ctx-'))
  fs.mkdirSync(path.join(tmpDir, '.sentinel', 'runs'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function writeLastRun(manifest: RunManifest): void {
  fs.writeFileSync(
    path.join(tmpDir, '.sentinel', 'last-run.json'),
    JSON.stringify(manifest)
  )
}

function writeHistory(summaries: RunSummary[]): void {
  const history: TestHistory = {
    runs: summaries.map(s => ({ runId: s.runId, timestamp: s.timestamp })),
    tests: {},
    summaries,
  }
  fs.writeFileSync(
    path.join(tmpDir, '.sentinel', 'history.json'),
    JSON.stringify(history)
  )
}

function makeSummary(overrides: Partial<RunSummary> & { runId: string }): RunSummary {
  return {
    runId: overrides.runId,
    timestamp: overrides.timestamp ?? '2026-01-01T00:00:00.000Z',
    total: overrides.total ?? 100,
    passed: overrides.passed ?? 95,
    failed: overrides.failed ?? 5,
    skipped: overrides.skipped ?? 0,
    flaky: overrides.flaky ?? 0,
    slow: overrides.slow ?? 0,
    duration: overrides.duration ?? 10000,
    passRate: overrides.passRate ?? 0.95,
  }
}

describe('buildSageContext', () => {
  it('returns SageContext with runId from last-run.json', () => {
    const manifest: RunManifest = {
      runId: 'run-abc',
      timestamp: '2026-01-01T00:00:00.000Z',
      exitCode: 0,
      durationMs: 5000,
    }
    writeLastRun(manifest)
    writeHistory([makeSummary({ runId: 'run-abc', passRate: 0.95, passed: 95, failed: 5 })])

    const ctx = buildSageContext('run-abc', tmpDir)
    expect(ctx.runId).toBe('run-abc')
  })

  it('sets currentRun from the matching history summary', () => {
    writeLastRun({ runId: 'run-abc', timestamp: '2026-01-01T00:00:00.000Z', exitCode: 0, durationMs: 5000 })
    writeHistory([
      makeSummary({ runId: 'run-abc', passRate: 0.90, passed: 90, failed: 10 }),
    ])

    const ctx = buildSageContext('run-abc', tmpDir)
    expect(ctx.currentRun.passRate).toBeCloseTo(0.90)
    expect(ctx.currentRun.grade).toBe('B')
  })

  it('populates history excluding the current run', () => {
    writeLastRun({ runId: 'run-b', timestamp: '2026-01-02T00:00:00.000Z', exitCode: 0, durationMs: 5000 })
    writeHistory([
      makeSummary({ runId: 'run-a', passRate: 0.95, passed: 95, failed: 5 }),
      makeSummary({ runId: 'run-b', passRate: 0.90, passed: 90, failed: 10 }),
    ])

    const ctx = buildSageContext('run-b', tmpDir)
    expect(ctx.history).toHaveLength(1)
    expect(ctx.history[0].runId).toBe('run-a')
  })

  it('respects historyDepth to cap history length', () => {
    writeLastRun({ runId: 'run-e', timestamp: '2026-01-05T00:00:00.000Z', exitCode: 0, durationMs: 5000 })
    const summaries = ['run-a', 'run-b', 'run-c', 'run-d', 'run-e'].map((id, i) =>
      makeSummary({ runId: id, passRate: 0.95 - i * 0.01, passed: 95 - i, failed: 5 + i })
    )
    writeHistory(summaries)

    const ctx = buildSageContext('run-e', tmpDir, 2)
    expect(ctx.history.length).toBeLessThanOrEqual(2)
  })

  it('returns empty history array when no history.json exists', () => {
    writeLastRun({ runId: 'run-x', timestamp: '2026-01-01T00:00:00.000Z', exitCode: 1, durationMs: 1000 })

    const ctx = buildSageContext('run-x', tmpDir)
    expect(ctx.history).toEqual([])
  })

  it('throws when last-run.json does not exist', () => {
    expect(() => buildSageContext('run-x', tmpDir)).toThrow(/last-run\.json/)
  })

  it('includes rawSummaries from history', () => {
    writeLastRun({ runId: 'run-a', timestamp: '2026-01-01T00:00:00.000Z', exitCode: 0, durationMs: 5000 })
    writeHistory([makeSummary({ runId: 'run-a', passRate: 0.95, passed: 95, failed: 5 })])

    const ctx = buildSageContext('run-a', tmpDir)
    expect(Array.isArray(ctx.rawSummaries)).toBe(true)
  })
})
