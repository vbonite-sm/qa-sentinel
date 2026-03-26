// src/scribe/module.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

vi.mock('../cli/commands/sync')

import { SentinelScribeModule } from './module'
import { runSync } from '../cli/commands/sync'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-scribe-mod-'))
  vi.resetAllMocks()
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('SentinelScribeModule', () => {
  it('has name "scribe"', () => {
    const mod = new SentinelScribeModule(tmpDir)
    expect(mod.name).toBe('scribe')
  })

  it('exposes an onComplete hook', () => {
    const mod = new SentinelScribeModule(tmpDir)
    expect(typeof mod.hooks.onComplete).toBe('function')
  })

  it('onComplete calls runSync with the root directory', async () => {
    vi.mocked(runSync).mockResolvedValue(undefined)
    const mod = new SentinelScribeModule(tmpDir)
    await mod.hooks.onComplete!()
    expect(runSync).toHaveBeenCalledWith(tmpDir)
  })

  it('onComplete does not throw when runSync rejects', async () => {
    vi.mocked(runSync).mockRejectedValue(new Error('sync failed'))
    const mod = new SentinelScribeModule(tmpDir)
    await expect(mod.hooks.onComplete!()).resolves.not.toThrow()
  })
})
