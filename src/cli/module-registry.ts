import type { SentinelModule, SentinelHooks } from './types'

export class SentinelModuleRegistry {
  private modules: SentinelModule[] = []

  register(module: SentinelModule): void {
    this.modules.push(module)
  }

  async fire<K extends keyof SentinelHooks>(
    hook: K,
    ...args: Parameters<NonNullable<SentinelHooks[K]>>
  ): Promise<void> {
    for (const mod of this.modules) {
      const handler = mod.hooks[hook] as
        | ((...a: unknown[]) => Promise<void>)
        | undefined
      if (handler) {
        await handler(...(args as unknown[]))
      }
    }
  }

  getModules(): SentinelModule[] {
    return [...this.modules]
  }
}

export const globalRegistry = new SentinelModuleRegistry()
