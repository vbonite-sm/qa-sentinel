import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { generateRunId } from '../run-id'
import { ensureSentinelDir, migrateHistory, writeLastRun } from '../sentinel-dir'
import { loadConfig } from '../config-loader'
import { applySeerFilter } from '../../seer/filter'
import type { RunManifest } from '../../types'

function findPlaywrightBin(root: string): string {
  const local = path.join(root, 'node_modules', '.bin', 'playwright')
  // On Windows, spawn() cannot execute the bash shim — prefer the .cmd wrapper
  const localCmd = `${local}.cmd`
  if (fs.existsSync(localCmd)) return localCmd
  if (fs.existsSync(local)) return local
  return 'playwright' // fall back to PATH
}

export async function runTest(
  playwrightArgs: string[],
  root = process.cwd()
): Promise<void> {
  const runId = generateRunId()

  ensureSentinelDir(root)
  migrateHistory(root)

  // Extract Seer flags — must be stripped before passing args to Playwright
  const hasPredict = playwrightArgs.includes('--predict')
  const hasNoPredict = playwrightArgs.includes('--no-predict')
  const filteredArgs = playwrightArgs.filter(
    a => a !== '--predict' && a !== '--no-predict'
  )

  // Load config to check config-driven prediction and thresholds
  const config = await loadConfig(root)
  const shouldPredict = (hasPredict || config.seer?.predict === true) && !hasNoPredict

  let effectiveArgs = filteredArgs
  if (shouldPredict) {
    const minConfidence = config.seer?.minConfidence ?? 0.8
    const diffBase = config.seer?.diffBase ?? 'HEAD~1'
    effectiveArgs = await applySeerFilter(filteredArgs, root, minConfidence, diffBase)
  }

  const playwrightBin = findPlaywrightBin(root)
  const startMs = Date.now()

  // On Windows, .cmd files require shell: true to be spawnable
  const useShell = playwrightBin.endsWith('.cmd')

  return new Promise((resolve, reject) => {
    const child = spawn(playwrightBin, ['test', ...effectiveArgs], {
      stdio: 'inherit',
      shell: useShell,
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
