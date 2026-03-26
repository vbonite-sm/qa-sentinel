import * as fs from 'fs'
import * as path from 'path'
import type { TestHistory, RunSummary } from '../types'
import type { SageContext, SageRunSummary } from './types'
import { toSageRunSummary } from './types'
import { getSentinelDir } from '../cli/sentinel-dir'

export function buildSageContext(
  runId: string,
  root = process.cwd(),
  historyDepth?: number
): SageContext {
  const sentinelDir = getSentinelDir(root)
  const lastRunPath = path.join(sentinelDir, 'last-run.json')

  if (!fs.existsSync(lastRunPath)) {
    throw new Error(`qa-sentinel: last-run.json not found at ${lastRunPath}. Run \`sentinel test\` first.`)
  }

  const historyPath = path.join(sentinelDir, 'history.json')
  let rawSummaries: RunSummary[] = []

  if (fs.existsSync(historyPath)) {
    try {
      const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8')) as TestHistory
      rawSummaries = history.summaries ?? []
    } catch {
      rawSummaries = []
    }
  }

  const currentSummary = rawSummaries.find(s => s.runId === runId)
  const currentRun: SageRunSummary = currentSummary
    ? toSageRunSummary(currentSummary)
    : {
        runId,
        timestamp: new Date().toISOString(),
        total: 0,
        passed: 0,
        failed: 0,
        flaky: 0,
        passRate: 0,
        grade: 'F',
      }

  const historySummaries = rawSummaries.filter(s => s.runId !== runId)
  const cappedHistory = historyDepth !== undefined
    ? historySummaries.slice(-historyDepth)
    : historySummaries

  const history: SageRunSummary[] = cappedHistory.map(toSageRunSummary)

  return {
    runId,
    currentRun,
    history,
    rawSummaries,
  }
}
