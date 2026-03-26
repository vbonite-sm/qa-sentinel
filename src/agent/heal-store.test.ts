import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  readHealSuggestions,
  appendHealSuggestion,
  markApplied,
  markDismissed,
  getHealStorePath,
} from './heal-store'
import type { HealSuggestion } from '../types'

let tmpDir: string

function makeSuggestion(overrides: Partial<HealSuggestion> = {}): HealSuggestion {
  return {
    testId: 'src/tests/login.spec.ts::should login',
    testTitle: 'should login',
    brokenSelector: "getByTestId('login-btn')",
    suggestedSelector: "getByTestId('login-button')",
    confidence: 0.85,
    detectedAt: '2026-03-26T10:00:00.000Z',
    status: 'pending',
    filePath: 'src/tests/login.spec.ts',
    lineNumber: 12,
    ...overrides,
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heal-store-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('getHealStorePath', () => {
  it('returns .sentinel/heal-suggestions.json under the given root', () => {
    const p = getHealStorePath('/some/project')
    expect(p).toBe(path.join('/some/project', '.sentinel', 'heal-suggestions.json'))
  })
})

describe('readHealSuggestions', () => {
  it('returns empty array when file does not exist', () => {
    const result = readHealSuggestions(tmpDir)
    expect(result).toEqual([])
  })

  it('returns parsed suggestions when file exists', () => {
    const store = path.join(tmpDir, '.sentinel', 'heal-suggestions.json')
    fs.mkdirSync(path.dirname(store), { recursive: true })
    fs.writeFileSync(store, JSON.stringify([makeSuggestion()]))
    const result = readHealSuggestions(tmpDir)
    expect(result).toHaveLength(1)
    expect(result[0].testId).toBe('src/tests/login.spec.ts::should login')
  })

  it('returns empty array when file contains invalid JSON', () => {
    const store = path.join(tmpDir, '.sentinel', 'heal-suggestions.json')
    fs.mkdirSync(path.dirname(store), { recursive: true })
    fs.writeFileSync(store, 'not-valid-json{{{')
    const result = readHealSuggestions(tmpDir)
    expect(result).toEqual([])
  })
})

describe('appendHealSuggestion', () => {
  it('creates the file and appends when it does not exist', () => {
    const suggestion = makeSuggestion()
    appendHealSuggestion(suggestion, tmpDir)
    const result = readHealSuggestions(tmpDir)
    expect(result).toHaveLength(1)
    expect(result[0].brokenSelector).toBe("getByTestId('login-btn')")
  })

  it('appends to existing suggestions', () => {
    const s1 = makeSuggestion({ testId: 'test-1', brokenSelector: 'getByTestId("a")' })
    const s2 = makeSuggestion({ testId: 'test-2', brokenSelector: 'getByTestId("b")' })
    appendHealSuggestion(s1, tmpDir)
    appendHealSuggestion(s2, tmpDir)
    const result = readHealSuggestions(tmpDir)
    expect(result).toHaveLength(2)
  })

  it('deduplicates by testId + brokenSelector — does not add duplicate', () => {
    const suggestion = makeSuggestion()
    appendHealSuggestion(suggestion, tmpDir)
    appendHealSuggestion(suggestion, tmpDir)
    const result = readHealSuggestions(tmpDir)
    expect(result).toHaveLength(1)
  })

  it('creates .sentinel directory if it does not exist', () => {
    appendHealSuggestion(makeSuggestion(), tmpDir)
    expect(fs.existsSync(path.join(tmpDir, '.sentinel', 'heal-suggestions.json'))).toBe(true)
  })
})

describe('markApplied', () => {
  it('sets status to applied and sets appliedAt', () => {
    appendHealSuggestion(makeSuggestion(), tmpDir)
    markApplied('src/tests/login.spec.ts::should login', tmpDir)
    const result = readHealSuggestions(tmpDir)
    expect(result[0].status).toBe('applied')
    expect(result[0].appliedAt).toBeDefined()
    expect(result[0].appliedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('is a no-op when testId is not found', () => {
    appendHealSuggestion(makeSuggestion(), tmpDir)
    markApplied('nonexistent-test-id', tmpDir)
    const result = readHealSuggestions(tmpDir)
    expect(result[0].status).toBe('pending')
  })
})

describe('markDismissed', () => {
  it('sets status to dismissed', () => {
    appendHealSuggestion(makeSuggestion(), tmpDir)
    markDismissed('src/tests/login.spec.ts::should login', tmpDir)
    const result = readHealSuggestions(tmpDir)
    expect(result[0].status).toBe('dismissed')
  })

  it('is a no-op when testId is not found', () => {
    appendHealSuggestion(makeSuggestion(), tmpDir)
    markDismissed('nonexistent', tmpDir)
    const result = readHealSuggestions(tmpDir)
    expect(result[0].status).toBe('pending')
  })
})
