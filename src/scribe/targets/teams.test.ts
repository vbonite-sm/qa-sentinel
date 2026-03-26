import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as https from 'https'
import { EventEmitter } from 'events'

vi.mock('https')

import { TeamsScribeTarget } from './teams'
import type { RunData, SentinelConfig } from '../../types'

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('TEAMS_WEBHOOK_URL', 'https://outlook.office.com/webhook/xxx/IncomingWebhook/yyy/zzz')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function makeRunData(overrides: Partial<RunData> = {}): RunData {
  return {
    manifest: { runId: 'run-teams', timestamp: '2026-03-26T00:00:00.000Z', exitCode: 1, durationMs: 4000 },
    failedTests: [{ testId: 'test-1', title: 'Payment flow fails', error: 'Element not found', filePath: 'tests/payment.spec.ts' }],
    passedTests: [{ testId: 'test-2', title: 'Cart works' }],
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
      res.emit('data', Buffer.from('1'))
      res.emit('end')
    })
    return req as unknown as ReturnType<typeof https.request>
  })
  return req
}

describe('TeamsScribeTarget', () => {
  describe('canHandle', () => {
    it('returns true when teams enabled and TEAMS_WEBHOOK_URL set', () => {
      const target = new TeamsScribeTarget()
      expect(target.canHandle({ scribe: { teams: true } })).toBe(true)
    })

    it('returns false when teams disabled', () => {
      const target = new TeamsScribeTarget()
      expect(target.canHandle({ scribe: { teams: false } })).toBe(false)
    })

    it('returns false when TEAMS_WEBHOOK_URL is missing', () => {
      vi.stubEnv('TEAMS_WEBHOOK_URL', '')
      const target = new TeamsScribeTarget()
      expect(target.canHandle({ scribe: { teams: true } })).toBe(false)
    })
  })

  describe('push', () => {
    it('sends a POST to the Teams webhook', async () => {
      mockRequest(200)
      const target = new TeamsScribeTarget()
      await target.push(makeRunData())
      const opts = vi.mocked(https.request).mock.calls[0][0] as unknown as { hostname: string; method: string }
      expect(opts.hostname).toBe('outlook.office.com')
      expect(opts.method).toBe('POST')
    })

    it('sends MessageCard with themeColor red on failure', async () => {
      mockRequest(200)
      const target = new TeamsScribeTarget()
      await target.push(makeRunData())
      const req = vi.mocked(https.request).mock.results[0].value as { write: ReturnType<typeof vi.fn> }
      const body = JSON.parse(req.write.mock.calls[0][0] as string)
      expect(body['@type']).toBe('MessageCard')
      expect(body.themeColor).toBe('FF4444')
    })

    it('includes pass rate in facts', async () => {
      mockRequest(200)
      const target = new TeamsScribeTarget()
      await target.push(makeRunData())
      const req = vi.mocked(https.request).mock.results[0].value as { write: ReturnType<typeof vi.fn> }
      const body = JSON.parse(req.write.mock.calls[0][0] as string)
      const facts = body.sections[0].facts as Array<{ name: string; value: string }>
      const passRateFact = facts.find((f) => f.name === 'Pass Rate')
      expect(passRateFact?.value).toContain('50%')
    })

    it('includes failed test names in the body text', async () => {
      mockRequest(200)
      const target = new TeamsScribeTarget()
      await target.push(makeRunData())
      const req = vi.mocked(https.request).mock.results[0].value as { write: ReturnType<typeof vi.fn> }
      const body = JSON.parse(req.write.mock.calls[0][0] as string)
      const text = JSON.stringify(body)
      expect(text).toContain('Payment flow fails')
    })

    it('does not throw on network error', async () => {
      const req = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
      req.write = vi.fn()
      req.end = vi.fn()
      vi.mocked(https.request).mockImplementation(() => {
        setImmediate(() => req.emit('error', new Error('refused')))
        return req as unknown as ReturnType<typeof https.request>
      })
      const target = new TeamsScribeTarget()
      await expect(target.push(makeRunData())).resolves.not.toThrow()
    })

    it('skips when there are no failures', async () => {
      mockRequest(200)
      const target = new TeamsScribeTarget()
      await target.push(makeRunData({ failedTests: [], passRate: 100 }))
      expect(https.request).not.toHaveBeenCalled()
    })
  })
})
