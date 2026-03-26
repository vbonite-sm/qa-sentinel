import * as fs from 'fs'
import * as path from 'path'
import type { QuarantineFile, QuarantineRecord } from './types'

const DEFAULT_THRESHOLD = 3

export class CircuitBreaker {
  private readonly runId: string
  private readonly threshold: number
  private readonly root: string
  private failures: Map<string, number> = new Map()
  private quarantined: Set<string> = new Set()

  constructor(runId: string, threshold: number | undefined, root = process.cwd()) {
    this.runId = runId
    this.threshold = threshold ?? DEFAULT_THRESHOLD
    this.root = root
  }

  recordFailure(testId: string, testTitle: string): void {
    if (this.quarantined.has(testId)) return
    const count = (this.failures.get(testId) ?? 0) + 1
    this.failures.set(testId, count)
    if (count >= this.threshold) {
      this.quarantined.add(testId)
      this.writeQuarantine(testId, testTitle, count)
    }
  }

  recordPass(testId: string): void {
    this.failures.set(testId, 0)
  }

  isQuarantined(testId: string): boolean {
    return this.quarantined.has(testId)
  }

  getQuarantinedIds(): string[] {
    return [...this.quarantined]
  }

  private getQuarantinePath(): string {
    return path.join(this.root, '.sentinel', 'runs', this.runId, 'quarantine.json')
  }

  private readQuarantineFile(): QuarantineFile {
    const qPath = this.getQuarantinePath()
    if (!fs.existsSync(qPath)) {
      return { runId: this.runId, generatedAt: new Date().toISOString(), entries: [] }
    }
    try {
      return JSON.parse(fs.readFileSync(qPath, 'utf-8')) as QuarantineFile
    } catch {
      return { runId: this.runId, generatedAt: new Date().toISOString(), entries: [] }
    }
  }

  private writeQuarantine(testId: string, testTitle: string, count: number): void {
    const qPath = this.getQuarantinePath()
    fs.mkdirSync(path.dirname(qPath), { recursive: true })
    const file = this.readQuarantineFile()
    const record: QuarantineRecord = {
      testId,
      testTitle,
      consecutiveFailures: count,
      quarantinedAt: new Date().toISOString(),
      runId: this.runId,
    }
    const idx = file.entries.findIndex(e => e.testId === testId)
    if (idx >= 0) {
      file.entries[idx] = record
    } else {
      file.entries.push(record)
    }
    file.generatedAt = new Date().toISOString()
    fs.writeFileSync(qPath, JSON.stringify(file, null, 2))
  }
}
