import * as fs from 'fs'
import * as path from 'path'
import type { SentinelModule } from '../cli/types'
import type { SentinelConfig, RunManifest, AIAnalysis } from '../types'
import { getSentinelDir } from '../cli/sentinel-dir'
import { buildSageContext } from './context-builder'
import { analyzeTrends } from './trend-analyzer'
import { askClaude } from './ai-client'
import { writeDigest } from './digest-writer'

export class SentinelSageModule implements SentinelModule {
  readonly name = 'sage'
  private config: SentinelConfig
  private root: string

  constructor(config: SentinelConfig, root = process.cwd()) {
    this.config = config
    this.root = root
  }

  readonly hooks = {
    onRunEnd: async (): Promise<void> => {
      try {
        await this.handleRunEnd()
      } catch (err) {
        // Non-fatal -- Sage should never crash the CLI
        const msg = err instanceof Error ? err.message : String(err)
        process.stderr.write(`qa-sentinel (sage): ${msg}\n`)
      }
    },

    onReportGenerated: async (_reportPath: string): Promise<void> => {
      // Reserved for future Sage-on-report actions
    },
  }

  private async handleRunEnd(): Promise<void> {
    const sentinelDir = getSentinelDir(this.root)
    const lastRunPath = path.join(sentinelDir, 'last-run.json')

    if (!fs.existsSync(lastRunPath)) {
      return
    }

    const manifest = JSON.parse(fs.readFileSync(lastRunPath, 'utf-8')) as RunManifest
    const historyDepth = this.config.sage?.historyDepth
    const context = buildSageContext(manifest.runId, this.root, historyDepth)

    analyzeTrends(context.rawSummaries)

    if (this.config.sage?.digest) {
      const digestQuery = [
        `Provide a concise post-run digest for run ${context.runId}.`,
        `Grade: ${context.currentRun.grade}`,
        `Pass rate: ${(context.currentRun.passRate * 100).toFixed(1)}%`,
        `Failed: ${context.currentRun.failed}, Flaky: ${context.currentRun.flaky}`,
        `Summarize the run health, identify the top root causes of failures, and give 3 actionable recommendations.`,
        `Format your response as: SUMMARY, ROOT CAUSES (bulleted), RECOMMENDATIONS (bulleted).`,
      ].join('\n')

      const rawAnswer = await askClaude(context, digestQuery)

      const analysis: AIAnalysis = parseDigestResponse(rawAnswer, manifest.runId)
      writeDigest(manifest.runId, analysis, this.root)
    }
  }
}

function parseDigestResponse(raw: string, _runId: string): AIAnalysis {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)

  const summaryLines: string[] = []
  const rootCauses: string[] = []
  const recommendations: string[] = []

  let section: 'summary' | 'causes' | 'recs' | 'none' = 'summary'

  for (const line of lines) {
    const lower = line.toLowerCase()
    if (lower.includes('root cause')) { section = 'causes'; continue }
    if (lower.includes('recommendation')) { section = 'recs'; continue }
    if (lower.includes('summary')) { section = 'summary'; continue }

    const isBullet = line.startsWith('-') || line.startsWith('*') || /^\d+\./.test(line)
    const text = isBullet ? line.replace(/^[-*\d.]\s*/, '') : line

    if (section === 'causes' && isBullet) rootCauses.push(text)
    else if (section === 'recs' && isBullet) recommendations.push(text)
    else if (section === 'summary') summaryLines.push(line)
  }

  return {
    summary: summaryLines.join(' ') || raw,
    rootCauses: rootCauses.length > 0 ? rootCauses : ['No root causes identified'],
    recommendations: recommendations.length > 0 ? recommendations : ['No recommendations generated'],
    generatedAt: new Date().toISOString(),
  }
}
