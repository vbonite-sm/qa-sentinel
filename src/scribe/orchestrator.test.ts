// src/scribe/orchestrator.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { ScribeOrchestrator } from './orchestrator'
import type { ScribeTarget } from './types'
import type { RunData, SentinelConfig } from '../types'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-orch-'))
  fs.mkdirSync(path.join(tmpDir, '.sentinel'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

function makeRunData(overrides: Partial<RunData> = {}): RunData {
  return {
    manifest: { runId: 'run-orch', timestamp: '2026-03-26T00:00:00.000Z', exitCode: 0, durationMs: 1000 },
    failedTests: [],
    passedTests: [{ testId: 'test-1', title: 'All good' }],
    passRate: 100,
    stabilityGrade: 'A',
    ...overrides,
  }
}

function makeTarget(name: string, handles: boolean): ScribeTarget & { push: ReturnType<typeof vi.fn> } {
  return {
    name,
    canHandle: vi.fn().mockReturnValue(handles),
    push: vi.fn().mockResolvedValue(undefined),
  }
}

describe('ScribeOrchestrator', () => {
  it('runs only targets where canHandle returns true', async () => {
    const enabled = makeTarget('enabled', true)
    const disabled = makeTarget('disabled', false)
    const orch = new ScribeOrchestrator([enabled, disabled], tmpDir)
    const config: SentinelConfig = {}
    await orch.run(config, makeRunData())
    expect(enabled.push).toHaveBeenCalledOnce()
    expect(disabled.push).not.toHaveBeenCalled()
  })

  it('passes RunData to each enabled target', async () => {
    const target = makeTarget('test-target', true)
    const orch = new ScribeOrchestrator([target], tmpDir)
    const runData = makeRunData({ passRate: 75 })
    await orch.run({}, runData)
    expect(target.push).toHaveBeenCalledWith(runData)
  })

  it('runs targets sequentially — second target runs after first resolves', async () => {
    const order: string[] = []
    const first: ScribeTarget = {
      name: 'first',
      canHandle: () => true,
      push: vi.fn().mockImplementation(async () => { order.push('first') }),
    }
    const second: ScribeTarget = {
      name: 'second',
      canHandle: () => true,
      push: vi.fn().mockImplementation(async () => { order.push('second') }),
    }
    const orch = new ScribeOrchestrator([first, second], tmpDir)
    await orch.run({}, makeRunData())
    expect(order).toEqual(['first', 'second'])
  })

  it('continues running remaining targets when one target throws', async () => {
    const failing: ScribeTarget = {
      name: 'failing',
      canHandle: () => true,
      push: vi.fn().mockRejectedValue(new Error('Target exploded')),
    }
    const succeeding = makeTarget('succeeding', true)
    const orch = new ScribeOrchestrator([failing, succeeding], tmpDir)
    await expect(orch.run({}, makeRunData())).resolves.not.toThrow()
    expect(succeeding.push).toHaveBeenCalledOnce()
  })

  it('buildRunData reads last-run.json and history to construct RunData', async () => {
    const manifest = {
      runId: 'run-read',
      timestamp: '2026-03-26T00:00:00.000Z',
      exitCode: 0,
      durationMs: 2000,
    }
    fs.writeFileSync(
      path.join(tmpDir, '.sentinel', 'last-run.json'),
      JSON.stringify(manifest)
    )
    const orch = new ScribeOrchestrator([], tmpDir)
    const runData = orch.buildRunData()
    expect(runData.manifest.runId).toBe('run-read')
  })

  it('buildRunData returns null when last-run.json does not exist', () => {
    const orch = new ScribeOrchestrator([], tmpDir)
    expect(orch.buildRunData()).toBeNull()
  })
})
