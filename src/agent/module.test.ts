import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-module-test-'))
  vi.resetModules()
  process.env['SENTINEL_CLI_MODE'] = '1'
  process.env['SENTINEL_RUN_ID'] = 'run-abc'
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  delete process.env['SENTINEL_CLI_MODE']
  delete process.env['SENTINEL_RUN_ID']
})

describe('SentinelAgentModule', () => {
  it('has name "sentinel-agent"', async () => {
    const { createAgentModule } = await import('./module')
    const mod = createAgentModule({ root: tmpDir })
    expect(mod.name).toBe('sentinel-agent')
  })

  it('registers onRunStart and onTestEnd hooks', async () => {
    const { createAgentModule } = await import('./module')
    const mod = createAgentModule({ root: tmpDir })
    expect(typeof mod.hooks.onRunStart).toBe('function')
    expect(typeof mod.hooks.onTestEnd).toBe('function')
  })

  it('onRunStart resolves without throwing', async () => {
    const { createAgentModule } = await import('./module')
    const mod = createAgentModule({ root: tmpDir })
    await expect(mod.hooks.onRunStart!()).resolves.toBeUndefined()
  })

  it('onTestEnd resolves without throwing for a passing test', async () => {
    const { createAgentModule } = await import('./module')
    const mod = createAgentModule({ root: tmpDir })
    await mod.hooks.onRunStart!()
    await expect(mod.hooks.onTestEnd!('some-test-id')).resolves.toBeUndefined()
  })

  it('registers with globalRegistry when registerAgentModule is called', async () => {
    const { registerAgentModule } = await import('./module')
    const registrySpy = { register: vi.fn() }
    registerAgentModule({ root: tmpDir, registry: registrySpy as any })
    expect(registrySpy.register).toHaveBeenCalledOnce()
    expect(registrySpy.register.mock.calls[0][0].name).toBe('sentinel-agent')
  })

  it('quarantines a test after threshold consecutive failures via _recordFailure', async () => {
    const runDir = path.join(tmpDir, '.sentinel', 'runs', 'run-abc')
    fs.mkdirSync(runDir, { recursive: true })
    const { createAgentModule } = await import('./module')
    const mod = createAgentModule({ root: tmpDir, circuitBreakerThreshold: 2 })
    await mod.hooks.onRunStart!()
    mod._recordFailure('test-xyz', 'My Failing Test')
    mod._recordFailure('test-xyz', 'My Failing Test')
    expect(mod._isQuarantined('test-xyz')).toBe(true)
  })

  it('_recordPass resets counter so test is no longer approaching threshold', async () => {
    const { createAgentModule } = await import('./module')
    const mod = createAgentModule({ root: tmpDir, circuitBreakerThreshold: 2 })
    await mod.hooks.onRunStart!()
    mod._recordFailure('test-y', 'Test Y')
    mod._recordPass('test-y')
    mod._recordFailure('test-y', 'Test Y')
    expect(mod._isQuarantined('test-y')).toBe(false)
  })
})
