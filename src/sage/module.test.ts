import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { RunSummary, TestHistory } from '../types'

const mockAskClaude = vi.fn()
const mockWriteDigest = vi.fn()
const mockBuildSageContext = vi.fn()
const mockAnalyzeTrends = vi.fn()

vi.mock('./ai-client', () => ({ askClaude: mockAskClaude }))
vi.mock('./digest-writer', () => ({ writeDigest: mockWriteDigest }))
vi.mock('./context-builder', () => ({ buildSageContext: mockBuildSageContext }))
vi.mock('./trend-analyzer', () => ({ analyzeTrends: mockAnalyzeTrends }))

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sage-module-'))
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
  fs.writeFileSync(path.join(tmpDir, '.sentinel', 'history.json'), JSON.stringify(history))
}

function makeSummary(runId: string): RunSummary {
  return { runId, timestamp: '2026-01-01T00:00:00.000Z', total: 100, passed: 95, failed: 5, skipped: 0, flaky: 0, slow: 0, duration: 10000, passRate: 0.95 }
}

describe('SentinelSageModule', () => {
  it('has name "sage"', async () => {
    const { SentinelSageModule } = await import('./module')
    const mod = new SentinelSageModule({}, tmpDir)
    expect(mod.name).toBe('sage')
  })

  it('onRunEnd calls buildSageContext', async () => {
    writeLastRun('run-abc')
    writeHistory([makeSummary('run-abc')])
    mockBuildSageContext.mockReturnValue({ runId: 'run-abc', currentRun: {}, history: [], rawSummaries: [] })
    mockAnalyzeTrends.mockReturnValue({ currentGrade: 'A', gradeDelta: 0, flakinessTrend: 'stable', newFailures: [], recoveredTests: [], totalRuns: 1 })

    const { SentinelSageModule } = await import('./module')
    const mod = new SentinelSageModule({}, tmpDir)
    await mod.hooks.onRunEnd!()

    expect(mockBuildSageContext).toHaveBeenCalledWith('run-abc', tmpDir, undefined)
  })

  it('onRunEnd does not call writeDigest when digest is disabled', async () => {
    writeLastRun('run-abc')
    writeHistory([makeSummary('run-abc')])
    mockBuildSageContext.mockReturnValue({ runId: 'run-abc', currentRun: {}, history: [], rawSummaries: [] })
    mockAnalyzeTrends.mockReturnValue({ currentGrade: 'A', gradeDelta: 0, flakinessTrend: 'stable', newFailures: [], recoveredTests: [], totalRuns: 1 })

    const { SentinelSageModule } = await import('./module')
    const mod = new SentinelSageModule({ sage: { digest: false } }, tmpDir)
    await mod.hooks.onRunEnd!()

    expect(mockWriteDigest).not.toHaveBeenCalled()
  })

  it('onRunEnd calls askClaude and writeDigest when digest is enabled', async () => {
    writeLastRun('run-abc')
    writeHistory([makeSummary('run-abc')])
    const ctx = { runId: 'run-abc', currentRun: { grade: 'A', passRate: 0.95, failed: 5, flaky: 0, total: 100, passed: 95, timestamp: '', runId: 'run-abc' }, history: [], rawSummaries: [] }
    mockBuildSageContext.mockReturnValue(ctx)
    mockAnalyzeTrends.mockReturnValue({ currentGrade: 'A', gradeDelta: 0, flakinessTrend: 'stable', newFailures: [], recoveredTests: [], totalRuns: 1 })
    mockAskClaude.mockResolvedValue('Digest content here.')

    const { SentinelSageModule } = await import('./module')
    const mod = new SentinelSageModule({ sage: { digest: true } }, tmpDir)
    await mod.hooks.onRunEnd!()

    expect(mockAskClaude).toHaveBeenCalled()
    expect(mockWriteDigest).toHaveBeenCalled()
  })

  it('onRunEnd does not throw when last-run.json is missing', async () => {
    const { SentinelSageModule } = await import('./module')
    const mod = new SentinelSageModule({}, tmpDir)
    await expect(mod.hooks.onRunEnd!()).resolves.not.toThrow()
  })

  it('exposes onReportGenerated hook', async () => {
    const { SentinelSageModule } = await import('./module')
    const mod = new SentinelSageModule({}, tmpDir)
    expect(typeof mod.hooks.onReportGenerated).toBe('function')
  })
})
