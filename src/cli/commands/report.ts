import * as fs from 'fs'
import * as path from 'path'
import type { RunManifest } from '../../types'
import { getSentinelDir } from '../sentinel-dir'

export async function runReport(root = process.cwd()): Promise<void> {
  const sentinelDir = getSentinelDir(root)
  const lastRunPath = path.join(sentinelDir, 'last-run.json')

  if (!fs.existsSync(lastRunPath)) {
    process.stderr.write('qa-sentinel: No last run found. Run `sentinel test` first.\n')
    process.exit(1)
    return
  }

  const manifest = JSON.parse(fs.readFileSync(lastRunPath, 'utf-8')) as RunManifest
  const reportPath = path.join(sentinelDir, 'runs', manifest.runId, 'report.html')

  if (!fs.existsSync(reportPath)) {
    process.stderr.write(
      `qa-sentinel: Report not found at ${reportPath}.\n` +
      `Make sure the Playwright reporter wrote the HTML report to .sentinel/runs/${manifest.runId}/report.html\n`
    )
    process.exit(1)
    return
  }

  process.stdout.write(`Opening report: ${reportPath}\n`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const open = ((await import('open' as any)) as any).default as (path: string) => Promise<void>
  await open(reportPath)
}
