import { execFileSync } from 'child_process'
import * as path from 'path'

/**
 * Returns the basenames of files changed between the current state and diffBase.
 * Uses `git diff --name-only <diffBase>` via execFileSync (no shell — injection safe).
 * Returns empty array if git is unavailable or the repo has no such diff.
 */
export function getChangedBasenames(diffBase: string, root: string): string[] {
  try {
    const output = execFileSync('git', ['diff', '--name-only', diffBase], {
      cwd: root,
      encoding: 'utf-8',
    }) as string

    return output
      .split('\n')
      .filter(Boolean)
      .map(f => path.basename(f))
  } catch {
    return []
  }
}
