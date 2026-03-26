// src/scribe/orchestrator.ts
import * as fs from 'fs'
import * as path from 'path'
import type { SentinelConfig, RunData, RunManifest } from '../types'
import type { ScribeTarget } from './types'

export class ScribeOrchestrator {
  private targets: ScribeTarget[]
  private root: string

  constructor(targets: ScribeTarget[], root = process.cwd()) {
    this.targets = targets
    this.root = root
  }

  async run(config: SentinelConfig, runData: RunData): Promise<void> {
    for (const target of this.targets) {
      if (!target.canHandle(config)) continue
      try {
        await target.push(runData)
      } catch {
        // Non-fatal — one failed target must not block the rest
      }
    }
  }

  buildRunData(): RunData | null {
    const lastRunPath = path.join(this.root, '.sentinel', 'last-run.json')
    if (!fs.existsSync(lastRunPath)) return null

    let manifest: RunManifest
    try {
      manifest = JSON.parse(fs.readFileSync(lastRunPath, 'utf-8')) as RunManifest
    } catch {
      return null
    }

    // Attempt to read run snapshot for test details; fall back to empty lists
    const runDir = path.join(this.root, '.sentinel', 'runs', manifest.runId)
    const snapshotPath = path.join(runDir, 'snapshot.json')

    let failedTests: RunData['failedTests'] = []
    let passedTests: RunData['passedTests'] = []
    let passRate = 0
    let stabilityGrade = 'N/A'

    if (fs.existsSync(snapshotPath)) {
      try {
        const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8')) as {
          tests?: Record<string, { testId: string; title: string; status: string; error?: string; file?: string }>
        }
        const tests = Object.values(snapshot.tests ?? {})
        const total = tests.length
        const passed = tests.filter(t => t.status === 'passed')
        const failed = tests.filter(t => t.status === 'failed' || t.status === 'timedOut')

        passedTests = passed.map(t => ({ testId: t.testId, title: t.title }))
        failedTests = failed.map(t => ({
          testId: t.testId,
          title: t.title,
          error: t.error ?? '',
          filePath: t.file ?? '',
        }))
        passRate = total > 0 ? Math.round((passed.length / total) * 100) : 0
        if (passRate >= 90) stabilityGrade = 'A'
        else if (passRate >= 80) stabilityGrade = 'B'
        else if (passRate >= 70) stabilityGrade = 'C'
        else if (passRate >= 60) stabilityGrade = 'D'
        else stabilityGrade = 'F'
      } catch {
        // Use empty defaults
      }
    }

    return { manifest, failedTests, passedTests, passRate, stabilityGrade }
  }
}
