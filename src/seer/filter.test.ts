import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

vi.mock('./diff')

import { applySeerFilter } from './filter'
import { getChangedBasenames } from './diff'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-seer-'))
  fs.mkdirSync(path.join(tmpDir, '.sentinel'), { recursive: true })
  vi.resetAllMocks()
  vi.mocked(getChangedBasenames).mockReturnValue([])
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

function writeHistory(
  dir: string,
  tests: Record<string, { passed: boolean }[]>
): void {
  const history = {
    runs: [],
    tests: Object.fromEntries(
      Object.entries(tests).map(([id, entries]) => [
        id,
        entries.map(e => ({
          passed: e.passed,
          duration: 100,
          timestamp: '2026-03-26T00:00:00.000Z',
        })),
      ])
    ),
  }
  fs.writeFileSync(
    path.join(dir, '.sentinel', 'history.json'),
    JSON.stringify(history)
  )
}

describe('applySeerFilter', () => {
  it('returns original args unchanged when no history.json exists', async () => {
    const args = ['--grep', '@smoke']
    const result = await applySeerFilter(args, tmpDir, 0.8)
    expect(result).toEqual(args)
  })

  it('returns original args when all tests are below confidence threshold', async () => {
    writeHistory(tmpDir, {
      'src/auth.spec.ts::login test': [
        { passed: false },
        { passed: false },
        { passed: true },
      ],
    })
    // Score: weights 1,2,3 → (1*0 + 2*0 + 3*1) / 6 = 0.5 — below 0.8
    const result = await applySeerFilter([], tmpDir, 0.8)
    expect(result).toEqual([]) // no --grep-invert added
  })

  it('adds --grep-invert when a test meets the confidence threshold', async () => {
    writeHistory(tmpDir, {
      'src/auth.spec.ts::login test': [
        { passed: true },
        { passed: true },
        { passed: true },
      ],
    })
    const result = await applySeerFilter([], tmpDir, 0.8)
    expect(result).toContain('--grep-invert')
    const patternIdx = result.indexOf('--grep-invert')
    expect(result[patternIdx + 1]).toContain('login test')
  })

  it('escapes regex special characters in test titles', async () => {
    writeHistory(tmpDir, {
      'src/auth.spec.ts::user clicks (button)': [
        { passed: true },
        { passed: true },
        { passed: true },
      ],
    })
    const result = await applySeerFilter([], tmpDir, 0.8)
    const patternIdx = result.indexOf('--grep-invert')
    expect(result[patternIdx + 1]).toContain('user clicks \\(button\\)')
  })

  it('never skips a test with no history entries', async () => {
    writeHistory(tmpDir, {})
    // Threshold at 0.0 — still never skips new tests
    const result = await applySeerFilter([], tmpDir, 0.0)
    expect(result).not.toContain('--grep-invert')
  })

  it('never skips a test whose file was changed in the diff', async () => {
    writeHistory(tmpDir, {
      'src/auth.spec.ts::login test': [
        { passed: true },
        { passed: true },
        { passed: true },
      ],
    })
    vi.mocked(getChangedBasenames).mockReturnValue(['auth.spec.ts'])
    const result = await applySeerFilter([], tmpDir, 0.8, 'HEAD~1')
    expect(result).not.toContain('--grep-invert')
  })

  it('includes multiple skippable tests in the same pattern', async () => {
    writeHistory(tmpDir, {
      'src/auth.spec.ts::login test': [{ passed: true }, { passed: true }, { passed: true }],
      'src/home.spec.ts::renders homepage': [{ passed: true }, { passed: true }, { passed: true }],
    })
    const result = await applySeerFilter([], tmpDir, 0.8)
    const patternIdx = result.indexOf('--grep-invert')
    const pattern = result[patternIdx + 1]
    expect(pattern).toContain('login test')
    expect(pattern).toContain('renders homepage')
  })

  it('preserves existing args and appends --grep-invert at the end', async () => {
    writeHistory(tmpDir, {
      'src/auth.spec.ts::login test': [{ passed: true }, { passed: true }, { passed: true }],
    })
    const args = ['--reporter', 'list', '--timeout', '30000']
    const result = await applySeerFilter(args, tmpDir, 0.8)
    expect(result[0]).toBe('--reporter')
    expect(result[1]).toBe('list')
    expect(result[result.length - 2]).toBe('--grep-invert')
  })

  it('deduplicates titles from multiple testIds with the same title', async () => {
    writeHistory(tmpDir, {
      '[Chrome] src/auth.spec.ts::login test': [{ passed: true }, { passed: true }, { passed: true }],
      '[Firefox] src/auth.spec.ts::login test': [{ passed: true }, { passed: true }, { passed: true }],
    })
    const result = await applySeerFilter([], tmpDir, 0.8)
    const patternIdx = result.indexOf('--grep-invert')
    const pattern = result[patternIdx + 1]
    // "login test" should appear exactly once — deduplication
    const matches = pattern.match(/login test/g)
    expect(matches).toHaveLength(1)
  })

  it('returns original args when history.json contains corrupt JSON', async () => {
    fs.writeFileSync(path.join(tmpDir, '.sentinel', 'history.json'), 'not valid json {{')
    const args = ['--grep', '@smoke']
    const result = await applySeerFilter(args, tmpDir, 0.8)
    expect(result).toEqual(args)
  })
})
