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

export class SlackScribeTarget implements ScribeTarget {
  name = 'slack'

  canHandle(config: SentinelConfig): boolean {
    if (!config.scribe?.slack) return false
    return !!process.env.SLACK_WEBHOOK_URL
  }

  async push(runData: RunData): Promise<void> {
    if (runData.failedTests.length === 0) return

    const webhookUrl = process.env.SLACK_WEBHOOK_URL!
    const failedList = runData.failedTests
      .slice(0, 10)
      .map(t => `• ${t.title}`)
      .join('\n')
    const more = runData.failedTests.length > 10
      ? `\n_...and ${runData.failedTests.length - 10} more_`
      : ''

    const payload = JSON.stringify({
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Sentinel Test Report' },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Pass Rate:* ${runData.passRate}%` },
            { type: 'mrkdwn', text: `*Grade:* ${runData.stabilityGrade}` },
            { type: 'mrkdwn', text: `*Run ID:* \`${runData.manifest.runId}\`` },
            { type: 'mrkdwn', text: `*Failed:* ${runData.failedTests.length}` },
          ],
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Failed Tests:*\n${failedList}${more}` },
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
