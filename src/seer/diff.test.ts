import { describe, it, expect, vi, afterEach } from 'vitest'
import * as childProcess from 'child_process'

vi.mock('child_process')

import { getChangedBasenames } from './diff'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getChangedBasenames', () => {
  it('returns basenames of changed files', () => {
    vi.mocked(childProcess.execFileSync).mockReturnValue(
      'src/pages/Login.page.ts\nsrc/tests/auth.spec.ts\n'
    )
    const result = getChangedBasenames('HEAD~1', '/repo')
    expect(result).toEqual(['Login.page.ts', 'auth.spec.ts'])
  })

  it('filters out empty lines', () => {
    vi.mocked(childProcess.execFileSync).mockReturnValue('src/foo.ts\n\n')
    const result = getChangedBasenames('HEAD~1', '/repo')
    expect(result).toEqual(['foo.ts'])
  })

  it('returns empty array when execFileSync throws (not a git repo)', () => {
    vi.mocked(childProcess.execFileSync).mockImplementation(() => {
      throw new Error('not a git repository')
    })
    const result = getChangedBasenames('HEAD~1', '/not-a-repo')
    expect(result).toEqual([])
  })

  it('returns empty array when git diff output is empty', () => {
    vi.mocked(childProcess.execFileSync).mockReturnValue('')
    const result = getChangedBasenames('HEAD~1', '/repo')
    expect(result).toEqual([])
  })

  it('passes diffBase as an argument to git (not via shell interpolation)', () => {
    vi.mocked(childProcess.execFileSync).mockReturnValue('')
    getChangedBasenames('main', '/repo')
    expect(childProcess.execFileSync).toHaveBeenCalledWith(
      'git',
      ['diff', '--name-only', 'main'],
      expect.objectContaining({ cwd: '/repo' })
    )
  })
})
