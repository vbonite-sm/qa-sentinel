import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { generateRunId } from '../run-id'
import { ensureSentinelDir, migrateHistory, writeLastRun } from '../sentinel-dir'
import type { RunManifest } from '../../types'

function findPlaywrightBin(root: string): string {
  const local = path.join(root, 'node_modules', '.bin', 'playwright')
  if (fs.existsSync(local)) return local
  // Windows adds .cmd extension
  const localCmd = `${local}.cmd`
  if (fs.existsSync(localCmd)) return localCmd
  return 'playwright' // fall back to PATH
}

export async function runTest(
  playwrightArgs: string[],
  root = process.cwd()
): Promise<void> {
  const runId = generateRunId()

  ensureSentinelDir(root)
  migrateHistory(root)

  const playwrightBin = findPlaywrightBin(root)
  const startMs = Date.now()

  return new Promise((resolve, reject) => {
    const child = spawn(playwrightBin, ['test', ...playwrightArgs], {
      stdio: 'inherit',
      env: {
        ...process.env,
        SENTINEL_CLI_MODE: '1',
        SENTINEL_RUN_ID: runId,
      },
    })

    child.on('error', reject)

    child.on('close', (code) => {
      const manifest: RunManifest = {
        runId,
        timestamp: new Date().toISOString(),
        exitCode: code ?? 1,
        durationMs: Date.now() - startMs,
      }

      try {
        writeLastRun(manifest, root)
      } catch {
        // non-fatal — don't let a write failure kill the process
      }

      process.exitCode = code ?? 1
      resolve()
    })
  })
}
