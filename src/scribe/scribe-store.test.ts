import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { ScribeStore } from './scribe-store'
import type { ScribeRecord } from '../types'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-scribe-'))
  fs.mkdirSync(path.join(tmpDir, '.sentinel'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('ScribeStore', () => {
  it('returns empty records when scribe.json does not exist', () => {
    const store = new ScribeStore(tmpDir)
    expect(store.getRecords()).toEqual([])
  })

  it('loads existing records from scribe.json', () => {
    const record: ScribeRecord = {
      testId: 'test-1',
      jiraTicketId: 'PROJ-42',
      filedAt: '2026-03-26T00:00:00.000Z',
    }
    fs.writeFileSync(
      path.join(tmpDir, '.sentinel', 'scribe.json'),
      JSON.stringify({ records: [record] })
    )
    const store = new ScribeStore(tmpDir)
    expect(store.getRecords()).toHaveLength(1)
    expect(store.getRecords()[0].jiraTicketId).toBe('PROJ-42')
  })

  it('upsertRecord adds a new record and persists to disk', () => {
    const store = new ScribeStore(tmpDir)
    store.upsertRecord({ testId: 'test-2', filedAt: '2026-03-26T00:00:00.000Z' })
    expect(store.getRecords()).toHaveLength(1)
    const raw = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.sentinel', 'scribe.json'), 'utf-8')
    )
    expect(raw.records).toHaveLength(1)
    expect(raw.records[0].testId).toBe('test-2')
  })

  it('upsertRecord updates an existing record by testId', () => {
    const store = new ScribeStore(tmpDir)
    store.upsertRecord({ testId: 'test-3', filedAt: '2026-03-26T00:00:00.000Z' })
    store.upsertRecord({ testId: 'test-3', jiraTicketId: 'PROJ-99', filedAt: '2026-03-26T00:00:00.000Z' })
    expect(store.getRecords()).toHaveLength(1)
    expect(store.getRecords()[0].jiraTicketId).toBe('PROJ-99')
  })

  it('findByTestId returns undefined when testId not in store', () => {
    const store = new ScribeStore(tmpDir)
    expect(store.findByTestId('nonexistent')).toBeUndefined()
  })

  it('findByTestId returns matching record', () => {
    const store = new ScribeStore(tmpDir)
    store.upsertRecord({ testId: 'test-4', jiraTicketId: 'X-1', filedAt: '2026-03-26T00:00:00.000Z' })
    expect(store.findByTestId('test-4')?.jiraTicketId).toBe('X-1')
  })

  it('does not throw when scribe.json contains malformed JSON', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.sentinel', 'scribe.json'),
      'not json at all'
    )
    expect(() => new ScribeStore(tmpDir)).not.toThrow()
  })
})
