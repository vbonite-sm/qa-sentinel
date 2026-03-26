import type { TestHistoryEntry } from '../types'

/**
 * Returns pass-confidence score (0.0-1.0) for a test based on recent history.
 * More recent runs are weighted more heavily (weight = position index + 1).
 * Returns NaN if history is empty — caller must treat NaN as "no prediction".
 */
export function scoreTest(history: TestHistoryEntry[]): number {
  if (history.length === 0) return NaN

  // Only consider the last 10 runs
  const recent = history.slice(-10)

  let weightedSum = 0
  let weightSum = 0

  for (let i = 0; i < recent.length; i++) {
    const weight = i + 1 // weight 1 = oldest in window, weight N = most recent
    weightedSum += weight * (recent[i].passed ? 1 : 0)
    weightSum += weight
  }

  return weightedSum / weightSum
}
