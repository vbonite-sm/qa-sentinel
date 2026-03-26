import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { writeDigest } from './digest-writer'
import type { AIAnalysis } from '../types'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sage-digest-'))
  fs.mkdirSync(path.join(tmpDir, '.sentinel', 'runs'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const analysis: AIAnalysis = {
  summary: 'Three login tests failed due to an expired auth token.',
  rootCauses: ['Expired OAUTH token in CI environment', 'Missing token refresh logic'],
  recommendations: ['Add token refresh before test suite', 'Pin token expiry to 24h in CI'],
  generatedAt: '2026-03-26T10:00:00.000Z',
}

describe('writeDigest', () => {
  it('creates digest.md in the run directory', () => {
    writeDigest('run-123', analysis, tmpDir)
    const digestPath = path.join(tmpDir, '.sentinel', 'runs', 'run-123', 'digest.md')
    expect(fs.existsSync(digestPath)).toBe(true)
  })

  it('creates the run directory if it does not exist', () => {
    writeDigest('run-new', analysis, tmpDir)
    const runDir = path.join(tmpDir, '.sentinel', 'runs', 'run-new')
    expect(fs.existsSync(runDir)).toBe(true)
  })

  it('digest contains summary text', () => {
    writeDigest('run-123', analysis, tmpDir)
    const content = fs.readFileSync(
      path.join(tmpDir, '.sentinel', 'runs', 'run-123', 'digest.md'),
      'utf-8'
    )
    expect(content).toContain('Three login tests failed due to an expired auth token.')
  })

  it('digest contains all root causes', () => {
    writeDigest('run-123', analysis, tmpDir)
    const content = fs.readFileSync(
      path.join(tmpDir, '.sentinel', 'runs', 'run-123', 'digest.md'),
      'utf-8'
    )
    expect(content).toContain('Expired OAUTH token in CI environment')
    expect(content).toContain('Missing token refresh logic')
  })

  it('digest contains all recommendations', () => {
    writeDigest('run-123', analysis, tmpDir)
    const content = fs.readFileSync(
      path.join(tmpDir, '.sentinel', 'runs', 'run-123', 'digest.md'),
      'utf-8'
    )
    expect(content).toContain('Add token refresh before test suite')
    expect(content).toContain('Pin token expiry to 24h in CI')
  })

  it('digest contains the generatedAt timestamp', () => {
    writeDigest('run-123', analysis, tmpDir)
    const content = fs.readFileSync(
      path.join(tmpDir, '.sentinel', 'runs', 'run-123', 'digest.md'),
      'utf-8'
    )
    expect(content).toContain('2026-03-26T10:00:00.000Z')
  })

  it('overwrites an existing digest.md', () => {
    const digestPath = path.join(tmpDir, '.sentinel', 'runs', 'run-123', 'digest.md')
    fs.mkdirSync(path.dirname(digestPath), { recursive: true })
    fs.writeFileSync(digestPath, 'old content')

    const updated: AIAnalysis = { ...analysis, summary: 'Updated summary.' }
    writeDigest('run-123', updated, tmpDir)

    const content = fs.readFileSync(digestPath, 'utf-8')
    expect(content).toContain('Updated summary.')
    expect(content).not.toContain('old content')
  })
})
