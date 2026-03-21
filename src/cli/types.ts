export interface SentinelHooks {
  onBeforeRun?: () => Promise<void>
  onRunStart?: () => Promise<void>
  onTestEnd?: (testId: string) => Promise<void>
  onRunEnd?: () => Promise<void>
  onReportGenerated?: (reportPath: string) => Promise<void>
  onComplete?: () => Promise<void>
}

export interface SentinelModule {
  name: string
  hooks: SentinelHooks
}
