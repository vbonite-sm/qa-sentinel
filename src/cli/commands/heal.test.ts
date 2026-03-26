import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as readline from 'readline'
import type { HealSuggestion } from '../../types'

vi.mock('readline')

let tmpDir: string

function makeSuggestion(overrides: Partial<HealSuggestion> = {}): HealSuggestion {
  return {
    testId: 'src/tests/login.spec.ts::should login',
    testTitle: 'should login',
    brokenSelector: "getByTestId('login-btn')",
    suggestedSelector: "getByTestId('login-button')",
    confidence: 0.85,
    detectedAt: '2026-03-26T10:00:00.000Z',
    status: 'pending',
    filePath: 'src/tests/login.spec.ts',
    lineNumber: 12,
    ...overrides,
  }
}

function writeSuggestions(suggestions: HealSuggestion[]): void {
  const store = path.join(tmpDir, '.sentinel', 'heal-suggestions.json')
  fs.mkdirSync(path.dirname(store), { recursive: true })
  fs.writeFileSync(store, JSON.stringify(suggestions))
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heal-cmd-test-'))
  vi.resetModules()
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('runHeal', () => {
  it('prints "no pending suggestions" when store is empty', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { runHeal } = await import('./heal')
    await runHeal(tmpDir)
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('no pending'))
  })

  it('prints "no pending suggestions" when all suggestions are applied', async () => {
    writeSuggestions([makeSuggestion({ status: 'applied' })])
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { runHeal } = await import('./heal')
    await runHeal(tmpDir)
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('no pending'))
  })

  it('applies suggestion and marks applied when user answers y', async () => {
    const testFilePath = path.join(tmpDir, 'src', 'tests', 'login.spec.ts')
    fs.mkdirSync(path.dirname(testFilePath), { recursive: true })
    fs.writeFileSync(testFilePath, `page.getByTestId('login-btn').click()`)

    const suggestion = makeSuggestion({ filePath: testFilePath })
    writeSuggestions([suggestion])

    vi.spyOn(readline, 'createInterface').mockReturnValue({
      question: (_prompt: string, cb: (answer: string) => void) => cb('y'),
      close: vi.fn(),
    } as any)

    const { runHeal } = await import('./heal')
    await runHeal(tmpDir)

    const content = fs.readFileSync(testFilePath, 'utf-8')
    expect(content).toContain("getByTestId('login-button')")
    expect(content).not.toContain("getByTestId('login-btn')")
  })

  it('marks dismissed when user answers n', async () => {
    const testFilePath = path.join(tmpDir, 'src', 'tests', 'login.spec.ts')
    fs.mkdirSync(path.dirname(testFilePath), { recursive: true })
    fs.writeFileSync(testFilePath, `page.getByTestId('login-btn').click()`)

    writeSuggestions([makeSuggestion({ filePath: testFilePath })])

    vi.spyOn(readline, 'createInterface').mockReturnValue({
      question: (_prompt: string, cb: (answer: string) => void) => cb('n'),
      close: vi.fn(),
    } as any)

    const { runHeal } = await import('./heal')
    await runHeal(tmpDir)

    const { readHealSuggestions } = await import('../../agent/heal-store')
    const stored = readHealSuggestions(tmpDir)
    expect(stored[0].status).toBe('dismissed')

    const content = fs.readFileSync(testFilePath, 'utf-8')
    expect(content).toContain("getByTestId('login-btn')")
  })

  it('warns and skips when broken selector is not found in file', async () => {
    const testFilePath = path.join(tmpDir, 'src', 'tests', 'login.spec.ts')
    fs.mkdirSync(path.dirname(testFilePath), { recursive: true })
    fs.writeFileSync(testFilePath, `// file does not contain the selector`)

    writeSuggestions([makeSuggestion({ filePath: testFilePath })])

    vi.spyOn(readline, 'createInterface').mockReturnValue({
      question: (_prompt: string, cb: (answer: string) => void) => cb('y'),
      close: vi.fn(),
    } as any)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { runHeal } = await import('./heal')
    await runHeal(tmpDir)

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not found in'))
  })

  it('skips non-existent files gracefully', async () => {
    const suggestion = makeSuggestion({ filePath: '/nonexistent/path/login.spec.ts' })
    writeSuggestions([suggestion])

    vi.spyOn(readline, 'createInterface').mockReturnValue({
      question: (_prompt: string, cb: (answer: string) => void) => cb('y'),
      close: vi.fn(),
    } as any)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { runHeal } = await import('./heal')
    await runHeal(tmpDir)

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('File not found'))
  })

  it('handles multiple pending suggestions sequentially', async () => {
    const fileA = path.join(tmpDir, 'a.spec.ts')
    const fileB = path.join(tmpDir, 'b.spec.ts')
    fs.writeFileSync(fileA, `getByTestId('btn-a')`)
    fs.writeFileSync(fileB, `getByTestId('btn-b')`)

    writeSuggestions([
      makeSuggestion({
        testId: 'a',
        filePath: fileA,
        brokenSelector: "getByTestId('btn-a')",
        suggestedSelector: "getByTestId('button-a')",
      }),
      makeSuggestion({
        testId: 'b',
        filePath: fileB,
        brokenSelector: "getByTestId('btn-b')",
        suggestedSelector: "getByTestId('button-b')",
      }),
    ])

    let callCount = 0
    vi.spyOn(readline, 'createInterface').mockReturnValue({
      question: (_prompt: string, cb: (answer: string) => void) => {
        callCount++
        cb('y')
      },
      close: vi.fn(),
    } as any)

    const { runHeal } = await import('./heal')
    await runHeal(tmpDir)

    expect(fs.readFileSync(fileA, 'utf-8')).toContain("getByTestId('button-a')")
    expect(fs.readFileSync(fileB, 'utf-8')).toContain("getByTestId('button-b')")
    expect(callCount).toBe(2)
  })
})
