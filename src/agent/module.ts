import type { SentinelModule } from '../cli/types'
import type { SentinelModuleRegistry } from '../cli/module-registry'
import { CircuitBreaker } from './circuit-breaker'

interface AgentModuleOptions {
  root?: string;
  circuitBreakerThreshold?: number;
  registry?: SentinelModuleRegistry;
}

interface AgentModuleInstance extends SentinelModule {
  _recordFailure: (testId: string, testTitle: string) => void;
  _recordPass: (testId: string) => void;
  _isQuarantined: (testId: string) => boolean;
}

export function createAgentModule(options: AgentModuleOptions = {}): AgentModuleInstance {
  const root = options.root ?? process.cwd()
  const threshold = options.circuitBreakerThreshold ?? 3
  const runId = process.env['SENTINEL_RUN_ID'] ?? 'unknown'

  let circuitBreaker: CircuitBreaker

  return {
    name: 'sentinel-agent',
    hooks: {
      async onRunStart(): Promise<void> {
        circuitBreaker = new CircuitBreaker(runId, threshold, root)
      },
      async onTestEnd(_testId: string): Promise<void> {
        // Registry hook receives testId only.
        // Circuit breaker is driven by the reporter directly via _recordFailure/_recordPass.
      },
    },
    _recordFailure(testId: string, testTitle: string): void {
      if (circuitBreaker) circuitBreaker.recordFailure(testId, testTitle)
    },
    _recordPass(testId: string): void {
      if (circuitBreaker) circuitBreaker.recordPass(testId)
    },
    _isQuarantined(testId: string): boolean {
      return circuitBreaker ? circuitBreaker.isQuarantined(testId) : false
    },
  }
}

export function registerAgentModule(options: AgentModuleOptions = {}): void {
  const { registry, ...rest } = options
  if (!registry) return
  registry.register(createAgentModule(rest))
}
