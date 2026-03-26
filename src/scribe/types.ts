import type { RunData } from '../types'
import type { SentinelConfig } from '../types'

export interface ScribeTarget {
  name: string
  canHandle(config: SentinelConfig): boolean
  push(runData: RunData): Promise<void>
}

export interface ScribeStoreFile {
  records: import('../types').ScribeRecord[]
}
