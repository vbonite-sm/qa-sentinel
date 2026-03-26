// src/cli/commands/sync.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Mock the orchestrator and config loader so sync is testable without real HTTP
vi.mock('../../scribe/orchestrator')
vi.mock('../config-loader')

import { runSync } from './sync'
import { ScribeOrchestrator } from '../../scribe/orchestrator'
import { loadConfig } from '../config-loader'
import type { RunData, SentinelConfig } from '../../types'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-sync-'))
  fs.mkdirSync(path.join(tmpDir, '.sentinel'), { recursive: true })
  vi.resetAllMocks()
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

function makeRunData(): RunData {
  return {
    manifest: { runId: 'run-sync', timestamp: '2026-03-26T00:00:00.000Z', exitCode: 0, durationMs: 1000 },
    failedTests: [],
    passedTests: [{ testId: 'test-1', title: 'OK' }],
    passRate: 100,
    stabilityGrade: 'A',
  }
}

describe('runSync', () => {
  it('calls loadConfig with the root directory', async () => {
    vi.mocked(loadConfig).mockResolvedValue({})
    const mockBuildRunData = vi.fn().mockReturnValue(makeRunData())
    const mockRun = vi.fn().mockResolvedValue(undefined)
    vi.mocked(ScribeOrchestrator).mockImplementation(() => ({
      buildRunData: mockBuildRunData,
      run: mockRun,
    } as unknown as ScribeOrchestrator))

    await runSync(tmpDir)

    expect(loadConfig).toHaveBeenCalledWith(tmpDir)
  })

  it('calls orchestrator.run with config and runData', async () => {
    const config: SentinelConfig = { scribe: { slack: true } }
    vi.mocked(loadConfig).mockResolvedValue(config)
    const runData = makeRunData()
    const mockBuildRunData = vi.fn().mockReturnValue(runData)
    const mockRun = vi.fn().mockResolvedValue(undefined)
    vi.mocked(ScribeOrchestrator).mockImplementation(() => ({
      buildRunData: mockBuildRunData,
      run: mockRun,
    } as unknown as ScribeOrchestrator))

    await runSync(tmpDir)

    expect(mockRun).toHaveBeenCalledWith(config, runData)
  })

  it('logs a warning and exits early when no last-run.json is found', async () => {
    vi.mocked(loadConfig).mockResolvedValue({})
    const mockBuildRunData = vi.fn().mockReturnValue(null)
    const mockRun = vi.fn()
    vi.mocked(ScribeOrchestrator).mockImplementation(() => ({
      buildRunData: mockBuildRunData,
      run: mockRun,
    } as unknown as ScribeOrchestrator))

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await runSync(tmpDir)

    expect(mockRun).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('qa-sentinel'))
  })

  it('does not throw when orchestrator.run rejects', async () => {
    vi.mocked(loadConfig).mockResolvedValue({})
    const mockBuildRunData = vi.fn().mockReturnValue(makeRunData())
    vi.mocked(ScribeOrchestrator).mockImplementation(() => ({
      buildRunData: mockBuildRunData,
      run: vi.fn().mockRejectedValue(new Error('orch failure')),
    } as unknown as ScribeOrchestrator))

    await expect(runSync(tmpDir)).resolves.not.toThrow()
  })
})
