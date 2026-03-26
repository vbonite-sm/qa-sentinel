import type { RunSummary } from '../types'
import type { TrendSummary } from '../types'

const GRADE_ORDER = ['F', 'D', 'C', 'B', 'A'] as const

function gradeFromPassRate(passRate: number): string {
  if (passRate >= 0.95) return 'A'
  if (passRate >= 0.85) return 'B'
  if (passRate >= 0.75) return 'C'
  if (passRate >= 0.60) return 'D'
  return 'F'
}

function gradeIndex(grade: string): number {
  const idx = GRADE_ORDER.indexOf(grade as typeof GRADE_ORDER[number])
  return idx === -1 ? 0 : idx
}

export function analyzeTrends(summaries: RunSummary[]): TrendSummary {
  if (summaries.length === 0) {
    return {
      currentGrade: 'N/A',
      previousGrade: undefined,
      gradeDelta: 0,
      flakinessTrend: 'stable',
      newFailures: [],
      recoveredTests: [],
      totalRuns: 0,
    }
  }

  const current = summaries[summaries.length - 1]
  const previous = summaries.length > 1 ? summaries[summaries.length - 2] : undefined

  const currentPassRate = current.passRate ?? (current.total > 0 ? current.passed / current.total : 1)
  const currentGrade = gradeFromPassRate(currentPassRate)

  let previousGrade: string | undefined
  let gradeDelta = 0

  if (previous !== undefined) {
    const prevPassRate = previous.passRate ?? (previous.total > 0 ? previous.passed / previous.total : 1)
    previousGrade = gradeFromPassRate(prevPassRate)
    gradeDelta = gradeIndex(currentGrade) - gradeIndex(previousGrade)
  }

  const flakinessTrend = computeFlakinessTrend(summaries)

  return {
    currentGrade,
    previousGrade,
    gradeDelta,
    flakinessTrend,
    newFailures: [],
    recoveredTests: [],
    totalRuns: summaries.length,
  }
}

function computeFlakinessTrend(
  summaries: RunSummary[]
): 'improving' | 'stable' | 'degrading' {
  if (summaries.length < 2) return 'stable'

  const mid = Math.floor(summaries.length / 2)
  const firstHalf = summaries.slice(0, mid)
  const secondHalf = summaries.slice(mid)

  const avg = (runs: RunSummary[]): number =>
    runs.reduce((sum, r) => sum + (r.flaky ?? 0), 0) / runs.length

  const firstAvg = avg(firstHalf)
  const secondAvg = avg(secondHalf)
  const delta = secondAvg - firstAvg

  if (delta > 0.5) return 'degrading'
  if (delta < -0.5) return 'improving'
  return 'stable'
}
