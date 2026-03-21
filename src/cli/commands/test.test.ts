import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as childProcess from 'child_process'
import type { EventEmitter } from 'events'

// We test the logic of runTest by mocking child_process.spawn
vi.mock('child_process')

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
