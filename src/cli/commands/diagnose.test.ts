import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { TestResultData, RunSummary, TestHistory, HealSuggestion } from '../../types'
import { writeRunSnapshot } from '../run-store'
import { buildDiagnoseReport, runDiagnose } from './diagnose'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diagnose-'))
  fs.mkdirSync(path.join(tmpDir, '.sentinel'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

function makeResult(o: Partial<TestResultData> & { testId: string }): TestResultData {
  return {
    title: o.title ?? 'a test',
    file: o.file ?? 'spec.ts',
    status: o.status ?? 'passed',
    duration: o.duration ?? 100,
    retry: o.retry ?? 0,
    steps: [],
    history: [],
    ...o,
  }
}

function seedRun(runId: string, results: TestResultData[]): void {
  fs.writeFileSync(
    path.join(tmpDir, '.sentinel', 'last-run.json'),
    JSON.stringify({ runId, timestamp: '2026-06-03T00:00:00.000Z', exitCode: 1, durationMs: 2000 })
  )
  writeRunSnapshot(runId, '2026-06-03T00:00:00.000Z', results, tmpDir)
}

function seedHistory(summaries: RunSummary[]): void {
  const history: TestHistory = {
    runs: summaries.map(s => ({ runId: s.runId, timestamp: s.timestamp })),
    tests: {},
    summaries,
  }
  fs.writeFileSync(path.join(tmpDir, '.sentinel', 'history.json'), JSON.stringify(history))
}

function seedHeal(suggestions: HealSuggestion[]): void {
  fs.writeFileSync(
    path.join(tmpDir, '.sentinel', 'heal-suggestions.json'),
    JSON.stringify(suggestions)
  )
}

describe('buildDiagnoseReport', () => {
  it('categorizes unexpected failures and counts the summary', () => {
    seedRun('run-1', [
      makeResult({ testId: 'a', status: 'passed' }),
      makeResult({
        testId: 'b',
        title: 'checkout',
        status: 'failed',
        outcome: 'unexpected',
        error: 'Error: strict mode violation: locator resolved to 2 elements',
      }),
    ])

    const report = buildDiagnoseReport(tmpDir)
    expect(report).not.toBeNull()
    expect(report!.runId).toBe('run-1')
    expect(report!.summary.total).toBe(2)
    expect(report!.summary.failed).toBe(1)
    expect(report!.failures).toHaveLength(1)
    expect(report!.failures[0].category).toBe('selector-not-found')
    expect(report!.passRate).toBe(50)
  })

  it('does not count expected failures or flaky passes as failures', () => {
    seedRun('run-2', [
      makeResult({ testId: 'a', status: 'failed', outcome: 'expected', error: 'expected fail' }),
      makeResult({ testId: 'b', status: 'passed', outcome: 'flaky' }),
    ])
    const report = buildDiagnoseReport(tmpDir)
    expect(report!.summary.failed).toBe(0)
    expect(report!.summary.flaky).toBe(1)
    expect(report!.failures).toHaveLength(0)
  })

  it('attaches heal suggestions to matching failures', () => {
    seedRun('run-3', [
      makeResult({ testId: 'b', status: 'failed', outcome: 'unexpected', error: 'element not found' }),
    ])
    seedHeal([
      {
        testId: 'b',
        testTitle: 'checkout',
        brokenSelector: '#old',
        suggestedSelector: '#new',
        confidence: 0.9,
        detectedAt: '2026-06-03T00:00:00.000Z',
        status: 'pending',
        filePath: 'spec.ts',
      },
    ])
    const report = buildDiagnoseReport(tmpDir)
    expect(report!.failures[0].heal).toBeDefined()
    expect(report!.failures[0].heal!.suggestedSelector).toBe('#new')
  })

  it('reflects the health grade from history', () => {
    seedRun('run-4', [makeResult({ testId: 'a', status: 'passed' })])
    seedHistory([
      { runId: 'run-4', timestamp: 'ts', total: 100, passed: 98, failed: 2, skipped: 0, flaky: 0, slow: 0, duration: 1, passRate: 0.98 },
    ])
    const report = buildDiagnoseReport(tmpDir)
    expect(report!.grade).toBe('A')
  })

  it('returns null when there is no run snapshot', () => {
    expect(buildDiagnoseReport(tmpDir)).toBeNull()
  })
})

describe('runDiagnose', () => {
  it('emits valid, parseable JSON with --json', async () => {
    seedRun('run-1', [
      makeResult({ testId: 'b', status: 'failed', outcome: 'unexpected', error: 'Timeout 5000 ms exceeded' }),
    ])
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await runDiagnose({ json: true }, tmpDir)
    const output = writeSpy.mock.calls.flat().join('')
    const parsed = JSON.parse(output)
    expect(parsed.runId).toBe('run-1')
    expect(parsed.failures[0].category).toBe('timing')
  })

  it('prints a human summary without --json', async () => {
    seedRun('run-1', [makeResult({ testId: 'a', status: 'passed' })])
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await runDiagnose({}, tmpDir)
    const output = writeSpy.mock.calls.flat().join('')
    expect(output).toContain('Pass Rate')
    expect(output).toContain('No unexpected failures.')
  })

  it('exits non-zero with guidance when there is no run', async () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    await runDiagnose({ json: true }, tmpDir)
    expect(process.exitCode).toBe(1)
    expect(errSpy.mock.calls.flat().join('')).toMatch(/sentinel test/)
    process.exitCode = 0
  })
})
