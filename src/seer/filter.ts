import * as fs from 'fs'
import * as path from 'path'
import type { TestHistory } from '../types'
import { getSentinelDir } from '../cli/sentinel-dir'
import { scoreTest } from './scorer'
import { getChangedBasenames } from './diff'

/**
 * Extracts the test title from a testId.
 * testId format: "[ProjectName] relative/path::title" or "relative/path::title"
 * Returns the substring after the last "::".
 */
function extractTitle(testId: string): string {
  const idx = testId.lastIndexOf('::')
  return idx >= 0 ? testId.slice(idx + 2) : testId
}

/**
 * Extracts the source file basename from a testId.
 * Strips optional "[Project] " prefix, then returns basename of the path segment.
 */
function extractFileBasename(testId: string): string {
  const filePart = testId.split('::')[0].trim()
  const cleaned = filePart.replace(/^\[[^\]]+\]\s*/, '')
  return path.basename(cleaned)
}

/**
 * Escapes special regex characters so the title can be used as a literal
 * match inside a regex pattern.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Reads history.json, scores each test, and returns the Playwright args
 * with a `--grep-invert` pattern appended for tests predicted to pass.
 *
 * Tests are never skipped if:
 * - They have no history (new tests — NaN confidence)
 * - Their source file appears in the git diff changed files
 * - Their confidence score is below minConfidence
 */
export async function applySeerFilter(
  playwrightArgs: string[],
  root: string,
  minConfidence: number,
  diffBase?: string
): Promise<string[]> {
  const sentinelDir = getSentinelDir(root)
  const historyPath = path.join(sentinelDir, 'history.json')

  if (!fs.existsSync(historyPath)) {
    return playwrightArgs
  }

  let history: TestHistory
  try {
    history = JSON.parse(fs.readFileSync(historyPath, 'utf-8')) as TestHistory
  } catch {
    return playwrightArgs
  }

  // Determine changed files (for diff-based always-run override)
  const changedBasenames = diffBase ? getChangedBasenames(diffBase, root) : []

  // Score each testId and collect titles to skip
  const seenTitles = new Set<string>()
  const titlesToSkip: string[] = []

  for (const [testId, testHistory] of Object.entries(history.tests)) {
    if (!testHistory || testHistory.length === 0) continue // new test — never skip

    // Never skip tests in changed files
    if (changedBasenames.length > 0) {
      const fileBasename = extractFileBasename(testId)
      if (changedBasenames.includes(fileBasename)) continue
    }

    const confidence = scoreTest(testHistory)
    if (isNaN(confidence) || confidence < minConfidence) continue

    const title = extractTitle(testId)
    if (!seenTitles.has(title)) {
      seenTitles.add(title)
      titlesToSkip.push(title)
    }
  }

  if (titlesToSkip.length === 0) {
    return playwrightArgs
  }

  const pattern = titlesToSkip.map(escapeRegex).join('|')
  return [...playwrightArgs, '--grep-invert', pattern]
}
