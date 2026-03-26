import * as https from 'https'
import * as url from 'url'
import type { SentinelConfig, RunData } from '../../types'
import type { ScribeTarget } from '../types'

function httpsPost(webhookUrl: string, payload: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(webhookUrl)
    const opts: https.RequestOptions = {
      hostname: parsed.hostname!,
      port: parsed.port ? parseInt(parsed.port, 10) : 443,
      path: parsed.path!,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }
    const req = https.request(opts, (res) => {
      res.on('data', () => {})
      res.on('end', resolve)
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

export class TeamsScribeTarget implements ScribeTarget {
  name = 'teams'

  canHandle(config: SentinelConfig): boolean {
    if (!config.scribe?.teams) return false
    return !!process.env.TEAMS_WEBHOOK_URL
  }

  async push(runData: RunData): Promise<void> {
    if (runData.failedTests.length === 0) return

    const webhookUrl = process.env.TEAMS_WEBHOOK_URL!
    const failedList = runData.failedTests
      .slice(0, 10)
      .map(t => `• ${t.title}`)
      .join('\n\n')
    const more = runData.failedTests.length > 10
      ? `\n\n_...and ${runData.failedTests.length - 10} more_`
      : ''

    const payload = JSON.stringify({
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: 'FF4444',
      summary: `Sentinel: ${runData.failedTests.length} test(s) failed`,
      sections: [
        {
          activityTitle: 'Sentinel Test Report',
          facts: [
            { name: 'Pass Rate', value: `${runData.passRate}%` },
            { name: 'Grade', value: runData.stabilityGrade },
            { name: 'Run ID', value: runData.manifest.runId },
            { name: 'Failed', value: String(runData.failedTests.length) },
          ],
          text: `**Failed Tests:**\n\n${failedList}${more}`,
        },
      ],
    })

    try {
      await httpsPost(webhookUrl, payload)
    } catch {
      // Non-fatal
    }
  }
}
