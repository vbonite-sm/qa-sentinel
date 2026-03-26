import * as https from 'https'
import type { SentinelConfig, RunData } from '../../types'
import type { ScribeTarget } from '../types'

function httpsPost(opts: https.RequestOptions, body: string): Promise<{ statusCode: number; data: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      let data = ''
      res.on('data', (chunk: Buffer) => { data += chunk.toString() })
      res.on('end', () => resolve({ statusCode: (res as { statusCode: number }).statusCode, data }))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function buildCommentBody(runData: RunData): string {
  const rows: string[] = []

  for (const t of runData.failedTests) {
    rows.push(`| ❌ | ${t.title} | ${t.filePath} |`)
  }
  for (const t of runData.passedTests) {
    rows.push(`| ✅ | ${t.title} | -- |`)
  }

  return [
    '## Sentinel Test Report',
    '| Status | Test | File |',
    '|--------|------|------|',
    ...rows,
    '',
    `**Pass rate:** ${runData.passRate}% | **Grade:** ${runData.stabilityGrade} | **Run:** \`${runData.manifest.runId}\``,
  ].join('\n')
}

export class GitHubScribeTarget implements ScribeTarget {
  name = 'github'
  private root: string

  constructor(root = process.cwd()) {
    this.root = root
  }

  canHandle(config: SentinelConfig): boolean {
    if (!config.scribe?.github) return false
    return !!(
      process.env.GITHUB_TOKEN &&
      process.env.GITHUB_REPOSITORY &&
      process.env.GITHUB_PR_NUMBER
    )
  }

  async push(runData: RunData): Promise<void> {
    const token = process.env.GITHUB_TOKEN!
    const repo = process.env.GITHUB_REPOSITORY!
    const prNumber = process.env.GITHUB_PR_NUMBER!
    const [owner, repoName] = repo.split('/')

    const commentBody = buildCommentBody(runData)
    const payload = JSON.stringify({ body: commentBody })

    try {
      await httpsPost(
        {
          hostname: 'api.github.com',
          path: `/repos/${owner}/${repoName}/issues/${prNumber}/comments`,
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'User-Agent': 'qa-sentinel',
          },
        },
        payload
      )
    } catch {
      // Non-fatal
    }
  }
}
