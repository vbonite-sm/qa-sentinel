import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'
import { analyzeSelector } from './selector-analyzer'
import { appendHealSuggestion, readHealSuggestions } from './heal-store'
import { CircuitBreaker } from './circuit-breaker'
import type { FixtureData, HealSuggestion } from '../types'

let tmpDir: string

const SAMPLE_DOM = `
<html><body>
  <button data-testid="submit-order-btn" role="button">Place Order</button>
  <input data-testid="card-number" placeholder="Card number" />
</body></html>
`

function writeFixtureFile(
  runId: string,
  workerIndex: number,
  testTitle: string,
  data: FixtureData,
  root: string
): void {
  const hash = crypto.createHash('sha1').update(testTitle).digest('hex').slice(0, 8)
  const fileName = `${runId}-${workerIndex}-${hash}-fixture.json`
  const runDir = path.join(root, '.sentinel', 'runs', runId)
  fs.mkdirSync(runDir, { recursive: true })
  fs.writeFileSync(path.join(runDir, fileName), JSON.stringify(data, null, 2))
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-integration-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('Agent integration', () => {
  it('full pipeline: fixture write -> analyzeSelector -> appendHealSuggestion -> readHealSuggestions', () => {
    const runId = 'int-run-001'
    const testTitle = 'Checkout should submit order'
    const brokenSelector = "getByTestId('submit-btn')"

    const fixtureData: FixtureData = {
      testId: 'tests/checkout.spec.ts::Checkout should submit order',
      testTitle,
      workerIndex: 0,
      domSnapshot: SAMPLE_DOM,
      consoleErrors: [],
      selectorError: brokenSelector,
      failureDetected: true,
    }
    writeFixtureFile(runId, 0, testTitle, fixtureData, tmpDir)

    const runDir = path.join(tmpDir, '.sentinel', 'runs', runId)
    const files = fs.readdirSync(runDir)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/-fixture\.json$/)

    const suggestion = analyzeSelector(brokenSelector, SAMPLE_DOM)
    expect(suggestion).not.toBeNull()
    expect(suggestion!.confidence).toBeGreaterThanOrEqual(0.3)

    const fullSuggestion: HealSuggestion = {
      ...suggestion!,
      testId: fixtureData.testId,
      testTitle,
      filePath: path.join(tmpDir, 'tests', 'checkout.spec.ts'),
    }

    appendHealSuggestion(fullSuggestion, tmpDir)

    const stored = readHealSuggestions(tmpDir)
    expect(stored).toHaveLength(1)
    expect(stored[0].testId).toBe(fixtureData.testId)
    expect(stored[0].status).toBe('pending')
    expect(stored[0].suggestedSelector).toContain('submit')
  })

  it('circuit breaker quarantines after threshold and quarantine.json is written', () => {
    const runId = 'int-run-002'
    const runDir = path.join(tmpDir, '.sentinel', 'runs', runId)
    fs.mkdirSync(runDir, { recursive: true })

    const cb = new CircuitBreaker(runId, 3, tmpDir)
    cb.recordFailure('tests/login.spec.ts::Login', 'Login')
    cb.recordFailure('tests/login.spec.ts::Login', 'Login')
    expect(cb.isQuarantined('tests/login.spec.ts::Login')).toBe(false)
    cb.recordFailure('tests/login.spec.ts::Login', 'Login')
    expect(cb.isQuarantined('tests/login.spec.ts::Login')).toBe(true)

    const qPath = path.join(runDir, 'quarantine.json')
    expect(fs.existsSync(qPath)).toBe(true)
    const qFile = JSON.parse(fs.readFileSync(qPath, 'utf-8'))
    expect(qFile.runId).toBe(runId)
    expect(qFile.entries[0].testId).toBe('tests/login.spec.ts::Login')
    expect(qFile.entries[0].consecutiveFailures).toBe(3)
  })

  it('duplicate suggestions are not appended', () => {
    const suggestion: HealSuggestion = {
      testId: 'test-dupe',
      testTitle: 'Dupe Test',
      brokenSelector: "getByTestId('x')",
      suggestedSelector: "getByTestId('y')",
      confidence: 0.7,
      detectedAt: new Date().toISOString(),
      status: 'pending',
      filePath: '/tests/dupe.spec.ts',
    }
    appendHealSuggestion(suggestion, tmpDir)
    appendHealSuggestion(suggestion, tmpDir)
    appendHealSuggestion(suggestion, tmpDir)
    const stored = readHealSuggestions(tmpDir)
    expect(stored).toHaveLength(1)
  })

  it('heal store survives corrupt JSON -- returns empty array', () => {
    const store = path.join(tmpDir, '.sentinel', 'heal-suggestions.json')
    fs.mkdirSync(path.dirname(store), { recursive: true })
    fs.writeFileSync(store, '{corrupt json:::')
    const stored = readHealSuggestions(tmpDir)
    expect(stored).toEqual([])
  })
})
