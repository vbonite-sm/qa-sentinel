import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const mockOpen = vi.fn().mockResolvedValue(undefined)
vi.mock('open', () => ({ default: mockOpen }))

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sage-report-'))
  fs.mkdirSync(path.join(tmpDir, '.sentinel', 'runs'), { recursive: true })
  vi.resetAllMocks()
  mockOpen.mockResolvedValue(undefined)
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

function createReport(runId: string): string {
  const runDir = path.join(tmpDir, '.sentinel', 'runs', runId)
  fs.mkdirSync(runDir, { recursive: true })
  const reportPath = path.join(runDir, 'report.html')
  fs.writeFileSync(reportPath, '<html><body>Report</body></html>')
  return reportPath
}

describe('runReport', () => {
  it('calls open with the path to report.html', async () => {
    writeLastRun('run-abc')
    const reportPath = createReport('run-abc')

    const { runReport } = await import('./report')
    await runReport(tmpDir)

    expect(mockOpen).toHaveBeenCalledWith(reportPath)
  })

  it('exits with code 1 when last-run.json does not exist', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never)
    const { runReport } = await import('./report')
    await runReport(tmpDir)
    expect(exitSpy).toHaveBeenCalledWith(1)
    exitSpy.mockRestore()
  })

  it('exits with code 1 when report.html does not exist', async () => {
    writeLastRun('run-abc')
    // Do not create report.html

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never)
    const { runReport } = await import('./report')
    await runReport(tmpDir)
    expect(exitSpy).toHaveBeenCalledWith(1)
    exitSpy.mockRestore()
  })

  it('prints the report path before opening', async () => {
    writeLastRun('run-abc')
    createReport('run-abc')

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const { runReport } = await import('./report')
    await runReport(tmpDir)

    expect(writeSpy.mock.calls.flat().join('')).toContain('report.html')
    writeSpy.mockRestore()
  })
})
