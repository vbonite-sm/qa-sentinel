import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as https from 'https'
import { EventEmitter } from 'events'

vi.mock('https')

import { SlackScribeTarget } from './slack'
import type { RunData, SentinelConfig } from '../../types'

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('SLACK_WEBHOOK_URL', 'https://hooks.slack.com/services/T00/B00/xxx')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function makeRunData(overrides: Partial<RunData> = {}): RunData {
  return {
    manifest: { runId: 'run-slack', timestamp: '2026-03-26T00:00:00.000Z', exitCode: 1, durationMs: 2000 },
    failedTests: [{ testId: 'test-1', title: 'Checkout fails', error: 'Timeout', filePath: 'tests/checkout.spec.ts' }],
    passedTests: [{ testId: 'test-2', title: 'Login passes' }],
    passRate: 50,
    stabilityGrade: 'C',
    ...overrides,
  }
}

function mockRequest(statusCode: number) {
  const req = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
  req.write = vi.fn()
  req.end = vi.fn()
  vi.mocked(https.request).mockImplementation((_opts, callback) => {
    const res = new EventEmitter() as EventEmitter & { statusCode: number }
    res.statusCode = statusCode
    setImmediate(() => {
      if (callback) (callback as (res: unknown) => void)(res)
      res.emit('data', Buffer.from('ok'))
      res.emit('end')
    })
    return req as unknown as ReturnType<typeof https.request>
  })
  return req
}

describe('SlackScribeTarget', () => {
  describe('canHandle', () => {
    it('returns true when slack enabled and SLACK_WEBHOOK_URL set', () => {
      const target = new SlackScribeTarget()
      expect(target.canHandle({ scribe: { slack: true } })).toBe(true)
    })

    it('returns false when slack disabled', () => {
      const target = new SlackScribeTarget()
      expect(target.canHandle({ scribe: { slack: false } })).toBe(false)
    })

    it('returns false when SLACK_WEBHOOK_URL is missing', () => {
      vi.stubEnv('SLACK_WEBHOOK_URL', '')
      const target = new SlackScribeTarget()
      expect(target.canHandle({ scribe: { slack: true } })).toBe(false)
    })
  })

  describe('push', () => {
    it('sends a POST to the Slack webhook URL', async () => {
      mockRequest(200)
      const target = new SlackScribeTarget()
      await target.push(makeRunData())
      const opts = vi.mocked(https.request).mock.calls[0][0] as { hostname: string; path: string; method: string }
      expect(opts.hostname).toBe('hooks.slack.com')
      expect(opts.method).toBe('POST')
    })

    it('payload contains the run summary with pass rate', async () => {
      mockRequest(200)
      const target = new SlackScribeTarget()
      await target.push(makeRunData())
      const req = vi.mocked(https.request).mock.results[0].value as { write: ReturnType<typeof vi.fn> }
      const body = JSON.parse(req.write.mock.calls[0][0] as string)
      const text = JSON.stringify(body)
      expect(text).toContain('50%')
    })

    it('payload lists failed test names', async () => {
      mockRequest(200)
      const target = new SlackScribeTarget()
      await target.push(makeRunData())
      const req = vi.mocked(https.request).mock.results[0].value as { write: ReturnType<typeof vi.fn> }
      const body = JSON.parse(req.write.mock.calls[0][0] as string)
      const text = JSON.stringify(body)
      expect(text).toContain('Checkout fails')
    })

    it('payload includes grade and run ID', async () => {
      mockRequest(200)
      const target = new SlackScribeTarget()
      await target.push(makeRunData())
      const req = vi.mocked(https.request).mock.results[0].value as { write: ReturnType<typeof vi.fn> }
      const body = JSON.parse(req.write.mock.calls[0][0] as string)
      const text = JSON.stringify(body)
      expect(text).toContain('run-slack')
      expect(text).toContain('C')
    })

    it('does not throw on network error', async () => {
      const req = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
      req.write = vi.fn()
      req.end = vi.fn()
      vi.mocked(https.request).mockImplementation(() => {
        setImmediate(() => req.emit('error', new Error('socket hang up')))
        return req as unknown as ReturnType<typeof https.request>
      })
      const target = new SlackScribeTarget()
      await expect(target.push(makeRunData())).resolves.not.toThrow()
    })

    it('skips sending when there are no failures and all tests pass', async () => {
      mockRequest(200)
      const target = new SlackScribeTarget()
      await target.push(makeRunData({ failedTests: [], passRate: 100 }))
      expect(https.request).not.toHaveBeenCalled()
    })
  })
})
