import * as fs from 'fs'
import * as path from 'path'
import type { RunManifest } from '../types'

const SENTINEL_DIR = '.sentinel'
const LEGACY_HISTORY_FILENAME = 'sentinel-history.json'

export function getSentinelDir(root = process.cwd()): string {
  return path.join(root, SENTINEL_DIR)
}

export function ensureSentinelDir(root = process.cwd()): void {
  const base = getSentinelDir(root)
  fs.mkdirSync(path.join(base, 'runs'), { recursive: true })
}

export function migrateHistory(root = process.cwd()): void {
  const legacy = path.join(root, LEGACY_HISTORY_FILENAME)
  const target = path.join(getSentinelDir(root), 'history.json')
  if (fs.existsSync(legacy) && !fs.existsSync(target)) {
    fs.renameSync(legacy, target)
  }
}

export function ensureRunDir(runId: string, root = process.cwd()): string {
  const dir = path.join(getSentinelDir(root), 'runs', runId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function cleanupFixtureFiles(runId: string, root = process.cwd()): void {
  const runDir = path.join(getSentinelDir(root), 'runs', runId)
  if (!fs.existsSync(runDir)) return
  for (const file of fs.readdirSync(runDir)) {
    if (file.endsWith('-fixture.json')) {
      fs.unlinkSync(path.join(runDir, file))
    }
  }
}

export function writeLastRun(manifest: RunManifest, root = process.cwd()): void {
  const target = path.join(getSentinelDir(root), 'last-run.json')
  fs.writeFileSync(target, JSON.stringify(manifest, null, 2))
}
