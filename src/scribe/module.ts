// src/scribe/module.ts
import type { SentinelModule, SentinelHooks } from '../cli/types'
import { runSync } from '../cli/commands/sync'

export class SentinelScribeModule implements SentinelModule {
  name = 'scribe'
  hooks: SentinelHooks
  private root: string

  constructor(root = process.cwd()) {
    this.root = root
    this.hooks = {
      onComplete: async () => {
        try {
          await runSync(this.root)
        } catch {
          // Non-fatal — scribe must not crash the run lifecycle
        }
      },
    }
  }
}
