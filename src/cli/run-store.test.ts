import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { TestResultData } from '../types'
import {
  writeRunSnapshot,
  readRunSnapshot,
  readLastRunSnapshot,
  buildRunSnapshot,
} from './run-store'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-store-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function makeResult(overrides: Partial<TestResultData> & { testId: string }): TestResultData {
  return {
    title: overrides.title ?? 'a test',
    file: overrides.file ?? 'spec.ts',
    status: overrides.status ?? 'passed',
    duration: overrides.duration ?? 100,
    retry: overrides.retry ?? 0,
    steps: [],
    history: [],
    ...overrides,
  }
}

function writeLastRun(runId: string): void {
  fs.mkdirSync(path.join(tmpDir, '.sentinel'), { recursive: true })
  fs.writeFileSync(
    path.join(tmpDir, '.sentinel', 'last-run.json'),
    JSON.stringify({ runId, timestamp: '2026-06-03T00:00:00.000Z', exitCode: 0, durationMs: 1000 })
  )
}

describe('run-store', () => {
  it('writes a snapshot keyed by testId and reads it back', () => {
    const results = [
      makeResult({ testId: 'a', title: 'login works', status: 'passed' }),
      makeResult({ testId: 'b', title: 'checkout fails', status: 'failed', error: 'boom' }),
    ]
    writeRunSnapshot('run-1', '2026-06-03T00:00:00.000Z', results, tmpDir)

    const snap = readRunSnapshot('run-1', tmpDir)
    expect(snap).not.toBeNull()
    expect(snap!.runId).toBe('run-1')
    expect(Object.keys(snap!.tests)).toEqual(['a', 'b'])
    expect(snap!.tests.b.status).toBe('failed')
    expect(snap!.tests.b.error).toBe('boom')
  })

  it('projects diagnose fields and omits heavy base64 payloads', () => {
    const results = [
      makeResult({
        testId: 'a',
        status: 'failed',
        flakinessScore: 0.5,
        flakinessIndicator: 'Flaky',
        stabilityScore: { overall: 42, flakiness: 50, performance: 30, reliability: 40, grade: 'F', needsAttention: true },
        failureCluster: { id: 'c1', errorType: 'Timeout Error', count: 2, tests: [] },
        screenshot: 'data:image/png;base64,AAAA',
        tags: ['@smoke'],
      }),
    ]
    const snap = buildRunSnapshot('run-1', 'ts', results)
    const t = snap.tests.a
    expect(t.flakinessScore).toBe(0.5)
    expect(t.stabilityGrade).toBe('F')
    expect(t.needsAttention).toBe(true)
    expect(t.failureClusterType).toBe('Timeout Error')
    expect(t.tags).toEqual(['@smoke'])
    // Heavy base64 fields are not part of the lean snapshot shape.
    expect((t as unknown as Record<string, unknown>).screenshot).toBeUndefined()
    expect((t as unknown as Record<string, unknown>).traceData).toBeUndefined()
  })

  it('readRunSnapshot returns null when the snapshot is absent', () => {
    expect(readRunSnapshot('missing', tmpDir)).toBeNull()
  })

  it('readLastRunSnapshot resolves the run via last-run.json', () => {
    writeLastRun('run-7')
    writeRunSnapshot('run-7', '2026-06-03T00:00:00.000Z', [makeResult({ testId: 'a' })], tmpDir)

    const last = readLastRunSnapshot(tmpDir)
    expect(last).not.toBeNull()
    expect(last!.manifest.runId).toBe('run-7')
    expect(last!.snapshot).not.toBeNull()
    expect(Object.keys(last!.snapshot!.tests)).toEqual(['a'])
  })

  it('readLastRunSnapshot returns null when there is no last run', () => {
    expect(readLastRunSnapshot(tmpDir)).toBeNull()
  })

  it('readLastRunSnapshot returns a null snapshot when the manifest exists but no snapshot was written', () => {
    writeLastRun('run-9')
    const last = readLastRunSnapshot(tmpDir)
    expect(last).not.toBeNull()
    expect(last!.manifest.runId).toBe('run-9')
    expect(last!.snapshot).toBeNull()
  })
})
