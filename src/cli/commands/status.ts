import * as fs from 'fs'
import * as path from 'path'
import type { RunManifest, TestHistory } from '../../types'
import { getSentinelDir } from '../sentinel-dir'
import { analyzeTrends } from '../../sage/trend-analyzer'

export async function runStatus(root = process.cwd()): Promise<void> {
  const sentinelDir = getSentinelDir(root)
  const lastRunPath = path.join(sentinelDir, 'last-run.json')

  if (!fs.existsSync(lastRunPath)) {
    process.stderr.write('qa-sentinel: No last run found. Run `sentinel test` first.\n')
    process.exit(1)
    return
  }

  const manifest = JSON.parse(fs.readFileSync(lastRunPath, 'utf-8')) as RunManifest

  const historyPath = path.join(sentinelDir, 'history.json')
  let summaries: TestHistory['summaries'] = []
  if (fs.existsSync(historyPath)) {
    try {
      const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8')) as TestHistory
      summaries = history.summaries ?? []
    } catch {
      summaries = []
    }
  }

  const trend = analyzeTrends(summaries)
  const current = summaries.find(s => s.runId === manifest.runId)

  const passRate = current
    ? ((current.passRate ?? (current.total > 0 ? current.passed / current.total : 1)) * 100).toFixed(1)
    : 'N/A'

  const failedCount = current?.failed ?? 0
  const flakyCount = current?.flaky ?? 0

  const prevStr = trend.previousGrade
    ? ` (was ${trend.previousGrade}, delta ${trend.gradeDelta >= 0 ? '+' : ''}${trend.gradeDelta})`
    : ''

  const lines = [
    ``,
    `Health Grade:  ${trend.currentGrade}${prevStr}`,
    `Pass Rate:     ${passRate}%`,
    `Flakiness:     ${trend.flakinessTrend}`,
    `Total Runs:    ${trend.totalRuns}`,
    `Failed:        ${failedCount}`,
    `Flaky:         ${flakyCount}`,
    ``,
  ]

  process.stdout.write(lines.join('\n') + '\n')
}
