import * as fs from 'fs'
import * as path from 'path'
import type { SentinelConfig } from '../types'

export function defineConfig(config: SentinelConfig): SentinelConfig {
  return config
}

export async function loadConfig(root = process.cwd()): Promise<SentinelConfig> {
  // Try .js first (compiled TS or plain JS)
  const jsPath = path.join(root, 'sentinel.config.js')
  if (fs.existsSync(jsPath)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(jsPath)
      return (mod.default ?? mod) as SentinelConfig
    } catch {
      return {}
    }
  }

  // Fall back to JSON
  const jsonPath = path.join(root, 'sentinel.config.json')
  if (fs.existsSync(jsonPath)) {
    try {
      return JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as SentinelConfig
    } catch {
      return {}
    }
  }

  return {}
}
