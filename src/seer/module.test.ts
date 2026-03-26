import { describe, it, expect } from 'vitest'
import { SentinelSeerModule } from './module'

describe('SentinelSeerModule', () => {
  it('has name "seer"', () => {
    const mod = new SentinelSeerModule()
    expect(mod.name).toBe('seer')
  })

  it('exposes a hooks object', () => {
    const mod = new SentinelSeerModule()
    expect(typeof mod.hooks).toBe('object')
  })

  it('onBeforeRun resolves without throwing', async () => {
    const mod = new SentinelSeerModule()
    await expect(mod.hooks.onBeforeRun?.()).resolves.not.toThrow()
  })
})
