import { describe, it, expect, vi } from 'vitest'
import { SentinelModuleRegistry } from './module-registry'

describe('SentinelModuleRegistry', () => {
  it('starts with no modules', () => {
    const registry = new SentinelModuleRegistry()
    expect(registry.getModules()).toHaveLength(0)
  })

  it('registers a module', () => {
    const registry = new SentinelModuleRegistry()
    registry.register({ name: 'test-module', hooks: {} })
    expect(registry.getModules()).toHaveLength(1)
    expect(registry.getModules()[0].name).toBe('test-module')
  })

  it('fires a hook on all registered modules', async () => {
    const registry = new SentinelModuleRegistry()
    const onRunStart = vi.fn().mockResolvedValue(undefined)
    registry.register({ name: 'mod-a', hooks: { onRunStart } })
    registry.register({ name: 'mod-b', hooks: { onRunStart } })
    await registry.fire('onRunStart')
    expect(onRunStart).toHaveBeenCalledTimes(2)
  })

  it('skips modules that do not implement the fired hook', async () => {
    const registry = new SentinelModuleRegistry()
    const onRunEnd = vi.fn().mockResolvedValue(undefined)
    registry.register({ name: 'mod-a', hooks: { onRunEnd } })
    registry.register({ name: 'mod-b', hooks: {} }) // no onRunEnd
    await registry.fire('onRunEnd')
    expect(onRunEnd).toHaveBeenCalledTimes(1)
  })

  it('fires hooks in registration order', async () => {
    const registry = new SentinelModuleRegistry()
    const order: string[] = []
    registry.register({
      name: 'first',
      hooks: { onRunStart: async () => { order.push('first') } },
    })
    registry.register({
      name: 'second',
      hooks: { onRunStart: async () => { order.push('second') } },
    })
    await registry.fire('onRunStart')
    expect(order).toEqual(['first', 'second'])
  })

  it('passes arguments to hooks that accept them', async () => {
    const registry = new SentinelModuleRegistry()
    const onTestEnd = vi.fn().mockResolvedValue(undefined)
    registry.register({ name: 'mod', hooks: { onTestEnd } })
    await registry.fire('onTestEnd', 'test-id-123')
    expect(onTestEnd).toHaveBeenCalledWith('test-id-123')
  })

  it('passes path argument to onReportGenerated', async () => {
    const registry = new SentinelModuleRegistry()
    const onReportGenerated = vi.fn().mockResolvedValue(undefined)
    registry.register({ name: 'mod', hooks: { onReportGenerated } })
    await registry.fire('onReportGenerated', '/path/to/report.html')
    expect(onReportGenerated).toHaveBeenCalledWith('/path/to/report.html')
  })
})
