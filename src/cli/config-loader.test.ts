import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { defineConfig, loadConfig } from './config-loader'
import type { SentinelConfig } from '../types'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-cfg-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('defineConfig', () => {
  it('returns the config object unchanged', () => {
    const cfg: SentinelConfig = { sage: { ai: 'claude' } }
    expect(defineConfig(cfg)).toEqual(cfg)
  })
})

describe('loadConfig', () => {
  it('returns empty object when no config file exists', async () => {
    const cfg = await loadConfig(tmpDir)
    expect(cfg).toEqual({})
  })

  it('loads sentinel.config.json when present', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'sentinel.config.json'),
      JSON.stringify({ sage: { ai: 'claude' } })
    )
    const cfg = await loadConfig(tmpDir)
    expect(cfg.sage?.ai).toBe('claude')
  })

  it('loads sentinel.config.js when present', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'sentinel.config.js'),
      `module.exports = { sage: { digest: true } }`
    )
    const cfg = await loadConfig(tmpDir)
    expect(cfg.sage?.digest).toBe(true)
  })

  it('prefers .js over .json when both exist', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'sentinel.config.json'),
      JSON.stringify({ sage: { ai: 'openai' } })
    )
    fs.writeFileSync(
      path.join(tmpDir, 'sentinel.config.js'),
      `module.exports = { sage: { ai: 'claude' } }`
    )
    const cfg = await loadConfig(tmpDir)
    expect(cfg.sage?.ai).toBe('claude')
  })

  it('returns empty object if config file throws on load', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'sentinel.config.js'),
      `throw new Error('bad config')`
    )
    const cfg = await loadConfig(tmpDir)
    expect(cfg).toEqual({})
  })
})
