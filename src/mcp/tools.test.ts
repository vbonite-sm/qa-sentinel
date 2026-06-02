import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { TestResultData, HealSuggestion } from '../types'
import { writeRunSnapshot } from '../cli/run-store'
import { getLastRun, diagnoseFailures, getFlakyTests, suggestHeal } from './tools'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-tools-'))
  fs.mkdirSync(path.join(tmpDir, '.sentinel'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
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

describe('mcp tools', () => {
  it('getLastRun reports found:false with no run', () => {
    expect(getLastRun(tmpDir)).toEqual({ found: false })
  })

  it('getLastRun summarizes the last run', () => {
    seedRun('run-1', [makeResult({ testId: 'a' }), makeResult({ testId: 'b' })])
    const res = getLastRun(tmpDir)
    expect(res.found).toBe(true)
    expect(res.runId).toBe('run-1')
    expect(res.totalTests).toBe(2)
  })

  it('diagnoseFailures returns the diagnose report', () => {
    seedRun('run-1', [
      makeResult({ testId: 'b', status: 'failed', outcome: 'unexpected', error: 'ECONNREFUSED' }),
    ])
    const res = diagnoseFailures(tmpDir) as { found: boolean; failures: Array<{ category: string }> }
    expect(res.found).toBe(true)
    expect(res.failures[0].category).toBe('network')
  })

  it('getFlakyTests lists flaky/unstable tests', () => {
    seedRun('run-1', [
      makeResult({ testId: 'a', status: 'passed', flakinessScore: 0.6, flakinessIndicator: 'Flaky' }),
      makeResult({ testId: 'b', status: 'passed', flakinessScore: 0.0 }),
    ])
    const res = getFlakyTests(tmpDir) as { found: boolean; flakyTests: Array<{ testId: string }> }
    expect(res.found).toBe(true)
    expect(res.flakyTests.map(t => t.testId)).toEqual(['a'])
  })

  it('suggestHeal returns all suggestions or filters by testId', () => {
    const suggestions: HealSuggestion[] = [
      { testId: 'a', testTitle: 'A', brokenSelector: '#x', suggestedSelector: '#y', confidence: 0.8, detectedAt: 'ts', status: 'pending', filePath: 'a.ts' },
      { testId: 'b', testTitle: 'B', brokenSelector: '#m', suggestedSelector: '#n', confidence: 0.7, detectedAt: 'ts', status: 'pending', filePath: 'b.ts' },
    ]
    fs.writeFileSync(path.join(tmpDir, '.sentinel', 'heal-suggestions.json'), JSON.stringify(suggestions))

    expect((suggestHeal(undefined, tmpDir) as { count: number }).count).toBe(2)
    const filtered = suggestHeal('a', tmpDir) as { count: number; suggestions: HealSuggestion[] }
    expect(filtered.count).toBe(1)
    expect(filtered.suggestions[0].testId).toBe('a')
  })
})
