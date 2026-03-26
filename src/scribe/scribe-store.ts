import * as fs from 'fs'
import * as path from 'path'
import type { ScribeRecord } from '../types'
import type { ScribeStoreFile } from './types'

const SCRIBE_FILE = 'scribe.json'

export class ScribeStore {
  private filePath: string
  private records: ScribeRecord[]

  constructor(root = process.cwd()) {
    this.filePath = path.join(root, '.sentinel', SCRIBE_FILE)
    this.records = this.load()
  }

  private load(): ScribeRecord[] {
    if (!fs.existsSync(this.filePath)) return []
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as ScribeStoreFile
      return Array.isArray(parsed.records) ? parsed.records : []
    } catch {
      return []
    }
  }

  private persist(): void {
    const data: ScribeStoreFile = { records: this.records }
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2))
  }

  getRecords(): ScribeRecord[] {
    return [...this.records]
  }

  findByTestId(testId: string): ScribeRecord | undefined {
    return this.records.find(r => r.testId === testId)
  }

  upsertRecord(record: ScribeRecord): void {
    const idx = this.records.findIndex(r => r.testId === record.testId)
    if (idx === -1) {
      this.records.push(record)
    } else {
      this.records[idx] = { ...this.records[idx], ...record }
    }
    this.persist()
  }
}
