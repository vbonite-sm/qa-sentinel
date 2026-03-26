import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { RunSummary, TestHistory } from '../../types'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sage-status-'))
  fs.mkdirSync(path.join(tmpDir, '.sentinel', 'runs'), { recursive: true })
  vi.resetAllMocks()
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function writeLastRun(runId: string): void {
  fs.writeFileSync(
    path.join(tmpDir, '.sentinel', 'last-run.json'),
    JSON.stringify({ runId, timestamp: '2026-03-26T00:00:00.000Z', exitCode: 0, durationMs: 5000 })
  )
}

function writeHistory(summaries: RunSummary[]): void {
  const history: TestHistory = {
    runs: summaries.map(s => ({ runId: s.runId, timestamp: s.timestamp })),
    tests: {},
    summaries,
  }
  fs.writeFileSync(
    path.join(tmpDir, '.sentinel', 'history.json'),
    JSON.stringify(history)
  )
}

function makeSummary(overrides: Partial<RunSummary> & { runId: string }): RunSummary {
  return {
    runId: overrides.runId,
    timestamp: overrides.timestamp ?? '2026-01-01T00:00:00.000Z',
    total: overrides.total ?? 100,
    passed: overrides.passed ?? 95,
    failed: overrides.failed ?? 5,
    skipped: 0,
    flaky: overrides.flaky ?? 0,
    slow: 0,
    duration: 10000,
    passRate: overrides.passRate ?? 0.95,
  }
}

describe('runStatus', () => {
  it('prints the health grade', async () => {
    writeLastRun('run-a')
    writeHistory([makeSummary({ runId: 'run-a', passRate: 0.97, passed: 97, failed: 3 })])

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const { runStatus } = await import('./status')
    await runStatus(tmpDir)

    const output = writeSpy.mock.calls.flat().join('')
    expect(output).toContain('A')
    writeSpy.mockRestore()
  })

  it('prints pass rate', async () => {
    writeLastRun('run-a')
    writeHistory([makeSummary({ runId: 'run-a', passRate: 0.90, passed: 90, failed: 10 })])

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const { runStatus } = await import('./status')
    await runStatus(tmpDir)

    const output = writeSpy.mock.calls.flat().join('')
    expect(output).toContain('90.0%')
    writeSpy.mockRestore()
  })

  it('prints flakiness trend', async () => {
    writeLastRun('run-b')
    writeHistory([
      makeSummary({ runId: 'run-a', flaky: 0, passRate: 0.95 }),
      makeSummary({ runId: 'run-b', flaky: 5, passRate: 0.95 }),
    ])

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const { runStatus } = await import('./status')
    await runStatus(tmpDir)

    const output = writeSpy.mock.calls.flat().join('')
    expect(output).toMatch(/degrading|stable|improving/)
    writeSpy.mockRestore()
  })

  it('prints total runs count', async () => {
    writeLastRun('run-b')
    writeHistory([
      makeSummary({ runId: 'run-a', passRate: 0.95 }),
      makeSummary({ runId: 'run-b', passRate: 0.90 }),
    ])

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const { runStatus } = await import('./status')
    await runStatus(tmpDir)

    const output = writeSpy.mock.calls.flat().join('')
    expect(output).toContain('2')
    writeSpy.mockRestore()
  })

  it('exits with code 1 when last-run.json does not exist', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never)
    const { runStatus } = await import('./status')
    await runStatus(tmpDir)
    expect(exitSpy).toHaveBeenCalledWith(1)
    exitSpy.mockRestore()
  })

  it('shows previous grade when history has more than one run', async () => {
    writeLastRun('run-b')
    writeHistory([
      makeSummary({ runId: 'run-a', passRate: 0.97, passed: 97, failed: 3 }), // A
      makeSummary({ runId: 'run-b', passRate: 0.90, passed: 90, failed: 10 }), // B
    ])

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const { runStatus } = await import('./status')
    await runStatus(tmpDir)

    const output = writeSpy.mock.calls.flat().join('')
    expect(output).toContain('was A')
    writeSpy.mockRestore()
  })
})
