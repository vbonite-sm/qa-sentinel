import { describe, it, expect } from 'vitest'
import { scoreTest } from './scorer'
import type { TestHistoryEntry } from '../types'

function makeEntry(passed: boolean): TestHistoryEntry {
  return { passed, duration: 100, timestamp: new Date().toISOString() }
}

describe('scoreTest', () => {
  it('returns NaN when history is empty', () => {
    expect(scoreTest([])).toBeNaN()
  })

  it('returns 1.0 when all recent runs passed', () => {
    const history = [makeEntry(true), makeEntry(true), makeEntry(true)]
    expect(scoreTest(history)).toBe(1.0)
  })

  it('returns 0.0 when all recent runs failed', () => {
    const history = [makeEntry(false), makeEntry(false), makeEntry(false)]
    expect(scoreTest(history)).toBe(0.0)
  })

  it('weights recent runs more heavily than old runs', () => {
    // 1 old failure followed by 1 recent pass — recency weighting means pass dominates
    // weights: fail=1, pass=2; score = 2/3 > 0.5 (equal weighting would give 0.5)
    const history = [
      makeEntry(false),
      makeEntry(true),  // most recent
    ]
    expect(scoreTest(history)).toBeGreaterThan(0.5)
  })

  it('uses at most the last 10 entries', () => {
    // 11 entries: 10 old failures + 1 recent pass (most recent)
    const history = [
      ...Array(10).fill(null).map(() => makeEntry(false)),
      makeEntry(true), // most recent — weight 10
    ]
    const score = scoreTest(history)
    // Window of 10: 9 failures (weights 1-9) + 1 pass (weight 10)
    // weightedSum = 10, weightSum = 55
    expect(score).toBeCloseTo(10 / 55, 3)
  })

  it('single passing entry returns 1.0', () => {
    expect(scoreTest([makeEntry(true)])).toBe(1.0)
  })

  it('single failing entry returns 0.0', () => {
    expect(scoreTest([makeEntry(false)])).toBe(0.0)
  })
})
