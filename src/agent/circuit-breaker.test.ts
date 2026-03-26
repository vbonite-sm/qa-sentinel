import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { CircuitBreaker } from './circuit-breaker'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'circuit-breaker-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('CircuitBreaker', () => {
  it('is not tripped after fewer failures than threshold', () => {
    const cb = new CircuitBreaker('run-001', 3, tmpDir)
    cb.recordFailure('test-1', 'My Test')
    cb.recordFailure('test-1', 'My Test')
    expect(cb.isQuarantined('test-1')).toBe(false)
  })

  it('trips and quarantines after reaching threshold', () => {
    const cb = new CircuitBreaker('run-001', 3, tmpDir)
    cb.recordFailure('test-1', 'My Test')
    cb.recordFailure('test-1', 'My Test')
    cb.recordFailure('test-1', 'My Test')
    expect(cb.isQuarantined('test-1')).toBe(true)
  })

  it('writes quarantine.json when threshold is reached', () => {
    const runDir = path.join(tmpDir, '.sentinel', 'runs', 'run-001')
    fs.mkdirSync(runDir, { recursive: true })
    const cb = new CircuitBreaker('run-001', 2, tmpDir)
    cb.recordFailure('test-1', 'My Test')
    cb.recordFailure('test-1', 'My Test')
    const qPath = path.join(runDir, 'quarantine.json')
    expect(fs.existsSync(qPath)).toBe(true)
    const qFile = JSON.parse(fs.readFileSync(qPath, 'utf-8'))
    expect(qFile.entries).toHaveLength(1)
    expect(qFile.entries[0].testId).toBe('test-1')
    expect(qFile.entries[0].consecutiveFailures).toBe(2)
  })

  it('resets counter on pass — does not quarantine after reset', () => {
    const cb = new CircuitBreaker('run-001', 3, tmpDir)
    cb.recordFailure('test-1', 'My Test')
    cb.recordFailure('test-1', 'My Test')
    cb.recordPass('test-1')
    cb.recordFailure('test-1', 'My Test')
    cb.recordFailure('test-1', 'My Test')
    expect(cb.isQuarantined('test-1')).toBe(false)
  })

  it('tracks multiple tests independently', () => {
    const cb = new CircuitBreaker('run-001', 2, tmpDir)
    cb.recordFailure('test-a', 'Test A')
    cb.recordFailure('test-a', 'Test A')
    cb.recordFailure('test-b', 'Test B')
    expect(cb.isQuarantined('test-a')).toBe(true)
    expect(cb.isQuarantined('test-b')).toBe(false)
  })

  it('appends to quarantine.json when a second test trips the breaker', () => {
    const runDir = path.join(tmpDir, '.sentinel', 'runs', 'run-001')
    fs.mkdirSync(runDir, { recursive: true })
    const cb = new CircuitBreaker('run-001', 2, tmpDir)
    cb.recordFailure('test-a', 'Test A')
    cb.recordFailure('test-a', 'Test A')
    cb.recordFailure('test-b', 'Test B')
    cb.recordFailure('test-b', 'Test B')
    const qFile = JSON.parse(
      fs.readFileSync(path.join(runDir, 'quarantine.json'), 'utf-8')
    )
    expect(qFile.entries).toHaveLength(2)
  })

  it('uses default threshold of 3 when not specified', () => {
    const cb = new CircuitBreaker('run-001', undefined, tmpDir)
    cb.recordFailure('t', 'T')
    cb.recordFailure('t', 'T')
    expect(cb.isQuarantined('t')).toBe(false)
    cb.recordFailure('t', 'T')
    expect(cb.isQuarantined('t')).toBe(true)
  })

  it('getQuarantinedIds returns all quarantined test IDs', () => {
    const runDir = path.join(tmpDir, '.sentinel', 'runs', 'run-001')
    fs.mkdirSync(runDir, { recursive: true })
    const cb = new CircuitBreaker('run-001', 2, tmpDir)
    cb.recordFailure('test-x', 'Test X')
    cb.recordFailure('test-x', 'Test X')
    expect(cb.getQuarantinedIds()).toContain('test-x')
  })
})
