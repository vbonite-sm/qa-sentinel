import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { SageContext } from '../../sage/types'

const mockAskClaude = vi.fn()
const mockBuildSageContext = vi.fn()

vi.mock('../../sage/ai-client', () => ({ askClaude: mockAskClaude }))
vi.mock('../../sage/context-builder', () => ({ buildSageContext: mockBuildSageContext }))

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sage-ask-'))
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

function makeContext(): SageContext {
  return {
    runId: 'run-abc',
    currentRun: { runId: 'run-abc', timestamp: '', total: 100, passed: 90, failed: 10, flaky: 0, passRate: 0.90, grade: 'B' },
    history: [],
    rawSummaries: [],
  }
}

describe('runAsk (single-shot)', () => {
  it('calls buildSageContext with the runId from last-run.json', async () => {
    writeLastRun('run-abc')
    mockBuildSageContext.mockReturnValue(makeContext())
    mockAskClaude.mockResolvedValue('The test failed because of X.')

    const { runAsk } = await import('./ask')
    await runAsk('why did tests fail?', tmpDir)

    expect(mockBuildSageContext).toHaveBeenCalledWith('run-abc', tmpDir, undefined)
  })

  it('calls askClaude with the context and query', async () => {
    writeLastRun('run-abc')
    mockBuildSageContext.mockReturnValue(makeContext())
    mockAskClaude.mockResolvedValue('Root cause: network timeout.')

    const { runAsk } = await import('./ask')
    await runAsk('what failed?', tmpDir)

    expect(mockAskClaude).toHaveBeenCalledWith(makeContext(), 'what failed?')
  })

  it('prints the Claude response to stdout', async () => {
    writeLastRun('run-abc')
    mockBuildSageContext.mockReturnValue(makeContext())
    mockAskClaude.mockResolvedValue('All good.')

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const { runAsk } = await import('./ask')
    await runAsk('status?', tmpDir)

    expect(writeSpy.mock.calls.flat().join('')).toContain('All good.')
    writeSpy.mockRestore()
  })

  it('exits with code 1 when last-run.json does not exist', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never)
    const { runAsk } = await import('./ask')
    await runAsk('what broke?', tmpDir)
    expect(exitSpy).toHaveBeenCalledWith(1)
    exitSpy.mockRestore()
  })

  it('exits with code 1 when askClaude throws', async () => {
    writeLastRun('run-abc')
    mockBuildSageContext.mockReturnValue(makeContext())
    mockAskClaude.mockRejectedValue(new Error('API error'))

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never)
    const { runAsk } = await import('./ask')
    await runAsk('what broke?', tmpDir)
    expect(exitSpy).toHaveBeenCalledWith(1)
    exitSpy.mockRestore()
  })
})
