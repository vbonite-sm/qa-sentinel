import * as fs from 'fs'
import * as path from 'path'
import type { AIAnalysis } from '../types'
import { getSentinelDir, ensureRunDir } from '../cli/sentinel-dir'

export function writeDigest(
  runId: string,
  analysis: AIAnalysis,
  root = process.cwd()
): void {
  ensureRunDir(runId, root)
  const runDir = path.join(getSentinelDir(root), 'runs', runId)
  const digestPath = path.join(runDir, 'digest.md')

  const rootCausesList = analysis.rootCauses
    .map(c => `- ${c}`)
    .join('\n')

  const recommendationsList = analysis.recommendations
    .map(r => `- ${r}`)
    .join('\n')

  const content = `# Sentinel Sage Digest

_Generated: ${analysis.generatedAt}_

## Summary

${analysis.summary}

## Root Causes

${rootCausesList}

## Recommendations

${recommendationsList}
`

  fs.writeFileSync(digestPath, content, 'utf-8')
}
