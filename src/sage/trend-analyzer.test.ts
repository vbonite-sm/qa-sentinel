import { describe, it, expect } from 'vitest'
import { analyzeTrends } from './trend-analyzer'
import type { RunSummary } from '../types'

function makeRun(overrides: Partial<RunSummary> & { runId: string }): RunSummary {
  return {
    runId: overrides.runId,
    timestamp: overrides.timestamp ?? new Date().toISOString(),
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

describe('analyzeTrends', () => {
  it('returns totalRuns equal to summaries length', () => {
    const runs = [makeRun({ runId: 'r1' }), makeRun({ runId: 'r2' })]
    const result = analyzeTrends(runs)
    expect(result.totalRuns).toBe(2)
  })

  it('assigns currentGrade A when passRate >= 0.95', () => {
    const runs = [makeRun({ runId: 'r1', passRate: 0.97, passed: 97, failed: 3 })]
    const result = analyzeTrends(runs)
    expect(result.currentGrade).toBe('A')
  })

  it('assigns currentGrade B when passRate is between 0.85 and 0.95', () => {
    const runs = [makeRun({ runId: 'r1', passRate: 0.90, passed: 90, failed: 10 })]
    const result = analyzeTrends(runs)
    expect(result.currentGrade).toBe('B')
  })

  it('assigns currentGrade F when passRate < 0.60', () => {
    const runs = [makeRun({ runId: 'r1', passRate: 0.50, passed: 50, failed: 50 })]
    const result = analyzeTrends(runs)
    expect(result.currentGrade).toBe('F')
  })

  it('sets previousGrade from second-to-last run when multiple runs exist', () => {
    const runs = [
      makeRun({ runId: 'r1', passRate: 0.90, passed: 90, failed: 10 }),
      makeRun({ runId: 'r2', passRate: 0.97, passed: 97, failed: 3 }),
    ]
    const result = analyzeTrends(runs)
    expect(result.previousGrade).toBe('B')
    expect(result.currentGrade).toBe('A')
  })

  it('sets previousGrade to undefined when only one run exists', () => {
    const runs = [makeRun({ runId: 'r1', passRate: 0.97 })]
    const result = analyzeTrends(runs)
    expect(result.previousGrade).toBeUndefined()
  })

  it('computes positive gradeDelta when grade improved', () => {
    const runs = [
      makeRun({ runId: 'r1', passRate: 0.60, passed: 60, failed: 40 }), // D
      makeRun({ runId: 'r2', passRate: 0.97, passed: 97, failed: 3 }),   // A
    ]
    const result = analyzeTrends(runs)
    expect(result.gradeDelta).toBeGreaterThan(0)
  })

  it('computes negative gradeDelta when grade degraded', () => {
    const runs = [
      makeRun({ runId: 'r1', passRate: 0.97, passed: 97, failed: 3 }),   // A
      makeRun({ runId: 'r2', passRate: 0.60, passed: 60, failed: 40 }),  // D
    ]
    const result = analyzeTrends(runs)
    expect(result.gradeDelta).toBeLessThan(0)
  })

  it('reports flakinessTrend as degrading when recent runs have more flaky tests', () => {
    const runs = [
      makeRun({ runId: 'r1', flaky: 1, passRate: 0.95 }),
      makeRun({ runId: 'r2', flaky: 1, passRate: 0.95 }),
      makeRun({ runId: 'r3', flaky: 5, passRate: 0.95 }),
      makeRun({ runId: 'r4', flaky: 8, passRate: 0.95 }),
    ]
    const result = analyzeTrends(runs)
    expect(result.flakinessTrend).toBe('degrading')
  })

  it('reports flakinessTrend as improving when recent runs have fewer flaky tests', () => {
    const runs = [
      makeRun({ runId: 'r1', flaky: 8, passRate: 0.95 }),
      makeRun({ runId: 'r2', flaky: 5, passRate: 0.95 }),
      makeRun({ runId: 'r3', flaky: 1, passRate: 0.95 }),
      makeRun({ runId: 'r4', flaky: 0, passRate: 0.95 }),
    ]
    const result = analyzeTrends(runs)
    expect(result.flakinessTrend).toBe('improving')
  })

  it('reports flakinessTrend as stable when flakiness is consistent', () => {
    const runs = [
      makeRun({ runId: 'r1', flaky: 2, passRate: 0.95 }),
      makeRun({ runId: 'r2', flaky: 2, passRate: 0.95 }),
      makeRun({ runId: 'r3', flaky: 2, passRate: 0.95 }),
    ]
    const result = analyzeTrends(runs)
    expect(result.flakinessTrend).toBe('stable')
  })

  it('returns empty newFailures and recoveredTests when there is only one run', () => {
    const runs = [makeRun({ runId: 'r1' })]
    const result = analyzeTrends(runs)
    expect(result.newFailures).toEqual([])
    expect(result.recoveredTests).toEqual([])
  })

  it('handles empty summaries array', () => {
    const result = analyzeTrends([])
    expect(result.totalRuns).toBe(0)
    expect(result.currentGrade).toBe('N/A')
    expect(result.gradeDelta).toBe(0)
    expect(result.flakinessTrend).toBe('stable')
  })
})
