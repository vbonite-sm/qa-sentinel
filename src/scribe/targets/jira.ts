import * as https from 'https'
import * as url from 'url'
import type { SentinelConfig, RunData } from '../../types'
import type { ScribeTarget } from '../types'
import { ScribeStore } from '../scribe-store'

function httpsRequest(
  opts: https.RequestOptions,
  body?: string
): Promise<{ statusCode: number; data: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      let data = ''
      res.on('data', (chunk: Buffer) => { data += chunk.toString() })
      res.on('end', () => resolve({ statusCode: (res as { statusCode: number }).statusCode, data }))
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

function jiraPriority(passRate: number): string {
  if (passRate < 50) return 'High'
  if (passRate < 80) return 'Medium'
  return 'Low'
}

export class JiraScribeTarget implements ScribeTarget {
  name = 'jira'
  private store: ScribeStore
  private root: string

  constructor(root = process.cwd()) {
    this.root = root
    this.store = new ScribeStore(root)
  }

  canHandle(config: SentinelConfig): boolean {
    if (!config.scribe?.jira) return false
    return !!(
      process.env.JIRA_BASE_URL &&
      process.env.JIRA_EMAIL &&
      process.env.JIRA_API_TOKEN &&
      process.env.JIRA_PROJECT_KEY
    )
  }

  async push(runData: RunData): Promise<void> {
    const baseUrl = process.env.JIRA_BASE_URL!
    const email = process.env.JIRA_EMAIL!
    const token = process.env.JIRA_API_TOKEN!
    const projectKey = process.env.JIRA_PROJECT_KEY!
    const auth = Buffer.from(`${email}:${token}`).toString('base64')
    const parsed = url.parse(baseUrl)
    const host = parsed.hostname!
    const port = parsed.port ? parseInt(parsed.port, 10) : 443

    // File new tickets for failing tests
    for (const failed of runData.failedTests) {
      const existing = this.store.findByTestId(failed.testId)
      if (existing?.jiraTicketId) continue

      const body = JSON.stringify({
        fields: {
          project: { key: projectKey },
          summary: `[Sentinel] ${failed.title} failing`,
          description: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: [
                      `Test: ${failed.title}`,
                      `Error: ${failed.error}`,
                      `File: ${failed.filePath}`,
                      `Run ID: ${runData.manifest.runId}`,
                      `Timestamp: ${runData.manifest.timestamp}`,
                    ].join('\n'),
                  },
                ],
              },
            ],
          },
          issuetype: { name: 'Bug' },
          priority: { name: jiraPriority(runData.passRate) },
        },
      })

      try {
        const result = await httpsRequest(
          {
            hostname: host,
            port,
            path: '/rest/api/3/issue',
            method: 'POST',
            headers: {
              Authorization: `Basic ${auth}`,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
            },
          },
          body
        )
        if (result.statusCode === 201) {
          const parsedBody = JSON.parse(result.data) as { key?: string }
          if (parsedBody.key) {
            this.store.upsertRecord({
              testId: failed.testId,
              jiraTicketId: parsedBody.key,
              filedAt: new Date().toISOString(),
            })
          }
        }
      } catch {
        // Non-fatal: network errors must not crash the run
      }
    }

    // Close tickets for tests that are now passing
    for (const passed of runData.passedTests) {
      const record = this.store.findByTestId(passed.testId)
      if (!record?.jiraTicketId || record.resolvedAt) continue

      try {
        const transPath = `/rest/api/3/issue/${record.jiraTicketId}/transitions`
        const transResult = await httpsRequest({
          hostname: host,
          port,
          path: transPath,
          method: 'GET',
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: 'application/json',
          },
        })
        const transitions = (JSON.parse(transResult.data) as { transitions?: Array<{ id: string; name: string }> }).transitions ?? []
        const done = transitions.find(t => t.name === 'Done')
        if (!done) continue

        const transBody = JSON.stringify({ transition: { id: done.id } })
        await httpsRequest(
          {
            hostname: host,
            port,
            path: transPath,
            method: 'POST',
            headers: {
              Authorization: `Basic ${auth}`,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(transBody),
            },
          },
          transBody
        )

        this.store.upsertRecord({
          ...record,
          resolvedAt: new Date().toISOString(),
        })
      } catch {
        // Non-fatal
      }
    }
  }
}
