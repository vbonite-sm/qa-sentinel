import type { SentinelModule, SentinelHooks } from '../cli/types'

export class SentinelSeerModule implements SentinelModule {
  name = 'seer'
  hooks: SentinelHooks

  constructor(_root = process.cwd()) {
    this.hooks = {
      onBeforeRun: async () => {
        // Seer filtering is applied in runTest() when --predict is passed.
        // This hook is a registration point for future pre-run capabilities.
      },
    }
  }
}
