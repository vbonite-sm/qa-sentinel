import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as childProcess from 'child_process'
import type { EventEmitter } from 'events'

// We test the logic of runTest by mocking child_process.spawn
vi.mock('child_process')
vi.mock('../../seer/filter')
vi.mock('../config-loader')

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-test-cmd-'))
  vi.resetAllMocks()
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function mockSpawn(exitCode: number) {
  const emitter = {
    on: vi.fn((event: string, cb: (code: number) => void) => {
      if (event === 'close') setTimeout(() => cb(exitCode), 0)
      return emitter
    }),
  } as unknown as EventEmitter
  vi.mocked(childProcess.spawn).mockReturnValue(emitter as ReturnType<typeof childProcess.spawn>)
  return emitter
}

describe('runTest', () => {
  it('creates .sentinel directory before spawning playwright', async () => {
    mockSpawn(0)
    const { runTest } = await import('./test')
    await runTest([], tmpDir)
    expect(fs.existsSync(path.join(tmpDir, '.sentinel'))).toBe(true)
  })

  it('spawns playwright with SENTINEL_CLI_MODE and SENTINEL_RUN_ID env vars', async () => {
    mockSpawn(0)
    const { runTest } = await import('./test')
    await runTest(['--grep', '@smoke'], tmpDir)
    expect(childProcess.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['test', '--grep', '@smoke']),
      expect.objectContaining({
        env: expect.objectContaining({
          SENTINEL_CLI_MODE: '1',
          SENTINEL_RUN_ID: expect.stringMatching(/^[a-z0-9-]+$/),
        }),
      })
    )
  })

  it('writes .sentinel/last-run.json after playwright exits', async () => {
    mockSpawn(0)
    const { runTest } = await import('./test')
    await runTest([], tmpDir)
    const lastRun = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.sentinel', 'last-run.json'), 'utf-8')
    )
    expect(lastRun.exitCode).toBe(0)
    expect(typeof lastRun.runId).toBe('string')
    expect(typeof lastRun.durationMs).toBe('number')
  })

  it('records failing exit code in last-run.json', async () => {
    mockSpawn(1)
    const { runTest } = await import('./test')
    await runTest([], tmpDir)
    const lastRun = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.sentinel', 'last-run.json'), 'utf-8')
    )
    expect(lastRun.exitCode).toBe(1)
  })

  it('uses stdio: inherit so playwright output is visible', async () => {
    mockSpawn(0)
    const { runTest } = await import('./test')
    await runTest([], tmpDir)
    expect(childProcess.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ stdio: 'inherit' })
    )
  })
})

// ---- Seer --predict integration ----

import { applySeerFilter } from '../../seer/filter'
import { loadConfig } from '../config-loader'

// Set safe defaults after each resetAllMocks so existing tests don't require
// --predict setup, and new tests can override per-case.
beforeEach(() => {
  vi.mocked(loadConfig).mockResolvedValue({})
  vi.mocked(applySeerFilter).mockImplementation(async (args) => args)
})

describe('runTest — --predict flag', () => {
  it('strips --predict from args before spawning playwright', async () => {
    mockSpawn(0)
    vi.mocked(loadConfig).mockResolvedValue({})
    vi.mocked(applySeerFilter).mockResolvedValue(['--grep', '@smoke'])

    const { runTest } = await import('./test')
    await runTest(['--predict', '--grep', '@smoke'], tmpDir)

    const spawnArgs = vi.mocked(childProcess.spawn).mock.calls[0][1] as string[]
    expect(spawnArgs).not.toContain('--predict')
  })

  it('strips --no-predict from args before spawning playwright', async () => {
    mockSpawn(0)
    vi.mocked(loadConfig).mockResolvedValue({})

    const { runTest } = await import('./test')
    await runTest(['--no-predict', '--grep', '@smoke'], tmpDir)

    const spawnArgs = vi.mocked(childProcess.spawn).mock.calls[0][1] as string[]
    expect(spawnArgs).not.toContain('--no-predict')
  })

  it('calls applySeerFilter when --predict flag is present', async () => {
    mockSpawn(0)
    vi.mocked(loadConfig).mockResolvedValue({})
    vi.mocked(applySeerFilter).mockResolvedValue([])

    const { runTest } = await import('./test')
    await runTest(['--predict'], tmpDir)

    expect(applySeerFilter).toHaveBeenCalledOnce()
  })

  it('does NOT call applySeerFilter without --predict and config.seer.predict not set', async () => {
    mockSpawn(0)
    vi.mocked(loadConfig).mockResolvedValue({})

    const { runTest } = await import('./test')
    await runTest(['--grep', '@smoke'], tmpDir)

    expect(applySeerFilter).not.toHaveBeenCalled()
  })

  it('calls applySeerFilter when config.seer.predict is true even without --predict flag', async () => {
    mockSpawn(0)
    vi.mocked(loadConfig).mockResolvedValue({ seer: { predict: true } })
    vi.mocked(applySeerFilter).mockResolvedValue([])

    const { runTest } = await import('./test')
    await runTest(['--grep', '@smoke'], tmpDir)

    expect(applySeerFilter).toHaveBeenCalledOnce()
  })

  it('does NOT call applySeerFilter when --no-predict overrides config.seer.predict', async () => {
    mockSpawn(0)
    vi.mocked(loadConfig).mockResolvedValue({ seer: { predict: true } })

    const { runTest } = await import('./test')
    await runTest(['--no-predict'], tmpDir)

    expect(applySeerFilter).not.toHaveBeenCalled()
  })

  it('passes minConfidence from config to applySeerFilter', async () => {
    mockSpawn(0)
    vi.mocked(loadConfig).mockResolvedValue({ seer: { predict: true, minConfidence: 0.9 } })
    vi.mocked(applySeerFilter).mockResolvedValue([])

    const { runTest } = await import('./test')
    await runTest([], tmpDir)

    expect(applySeerFilter).toHaveBeenCalledWith(
      expect.any(Array),
      tmpDir,
      0.9,
      expect.any(String)
    )
  })

  it('defaults minConfidence to 0.8 when not set in config', async () => {
    mockSpawn(0)
    vi.mocked(loadConfig).mockResolvedValue({ seer: { predict: true } })
    vi.mocked(applySeerFilter).mockResolvedValue([])

    const { runTest } = await import('./test')
    await runTest([], tmpDir)

    expect(applySeerFilter).toHaveBeenCalledWith(
      expect.any(Array),
      tmpDir,
      0.8,
      expect.any(String)
    )
  })
})
