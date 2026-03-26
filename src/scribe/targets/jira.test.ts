import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as https from 'https'
import { EventEmitter } from 'events'

vi.mock('https')

import { JiraScribeTarget } from './jira'
import type { RunData, SentinelConfig } from '../../types'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-jira-'))
  fs.mkdirSync(path.join(tmpDir, '.sentinel'), { recursive: true })
  vi.resetAllMocks()
  vi.stubEnv('JIRA_BASE_URL', 'https://myorg.atlassian.net')
  vi.stubEnv('JIRA_EMAIL', 'ci@example.com')
  vi.stubEnv('JIRA_API_TOKEN', 'token-abc')
  vi.stubEnv('JIRA_PROJECT_KEY', 'PROJ')
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function makeRunData(overrides: Partial<RunData> = {}): RunData {
  return {
    manifest: {
      runId: 'run-123',
      timestamp: '2026-03-26T00:00:00.000Z',
      exitCode: 1,
      durationMs: 5000,
    },
    failedTests: [
      {
        testId: 'test-login',
        title: 'Login flow',
        error: 'Expected to find element',
        filePath: 'tests/auth/login.spec.ts',
      },
    ],
    passedTests: [],
    passRate: 0,
    stabilityGrade: 'F',
    ...overrides,
  }
}

function mockHttpsRequest(statusCode: number, responseBody: unknown) {
  const req = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
  req.write = vi.fn()
  req.end = vi.fn()

  vi.mocked(https.request).mockImplementation((_opts, callback) => {
    const res = new EventEmitter() as EventEmitter & { statusCode: number }
    res.statusCode = statusCode
    setImmediate(() => {
      if (callback) (callback as (res: unknown) => void)(res)
      res.emit('data', Buffer.from(JSON.stringify(responseBody)))
      res.emit('end')
    })
    return req as unknown as ReturnType<typeof https.request>
  })
  return req
}

describe('JiraScribeTarget', () => {
  describe('canHandle', () => {
    it('returns true when config.scribe.jira is true and env vars are set', () => {
      const target = new JiraScribeTarget(tmpDir)
      const config: SentinelConfig = { scribe: { jira: true } }
      expect(target.canHandle(config)).toBe(true)
    })

    it('returns false when config.scribe.jira is false', () => {
      const target = new JiraScribeTarget(tmpDir)
      const config: SentinelConfig = { scribe: { jira: false } }
      expect(target.canHandle(config)).toBe(false)
    })

    it('returns false when JIRA_BASE_URL is missing', () => {
      vi.stubEnv('JIRA_BASE_URL', '')
      const target = new JiraScribeTarget(tmpDir)
      const config: SentinelConfig = { scribe: { jira: true } }
      expect(target.canHandle(config)).toBe(false)
    })

    it('returns false when JIRA_API_TOKEN is missing', () => {
      vi.stubEnv('JIRA_API_TOKEN', '')
      const target = new JiraScribeTarget(tmpDir)
      const config: SentinelConfig = { scribe: { jira: true } }
      expect(target.canHandle(config)).toBe(false)
    })
  })

  describe('push -- filing tickets', () => {
    it('calls https.request to create a Jira issue for each new failed test', async () => {
      mockHttpsRequest(201, { id: '10001', key: 'PROJ-1' })
      const target = new JiraScribeTarget(tmpDir)
      const runData = makeRunData()
      await target.push(runData)
      expect(https.request).toHaveBeenCalledTimes(1)
      const opts = vi.mocked(https.request).mock.calls[0][0] as unknown as { path: string; method: string }
      expect(opts.path).toContain('/rest/api/3/issue')
      expect(opts.method).toBe('POST')
    })

    it('sends correct summary and priority (High) when passRate < 50', async () => {
      mockHttpsRequest(201, { id: '10001', key: 'PROJ-1' })
      const target = new JiraScribeTarget(tmpDir)
      const runData = makeRunData({ passRate: 40 })
      await target.push(runData)
      const req = vi.mocked(https.request).mock.results[0].value as { write: ReturnType<typeof vi.fn> }
      const body = JSON.parse(req.write.mock.calls[0][0] as string)
      expect(body.fields.summary).toBe('[Sentinel] Login flow failing')
      expect(body.fields.priority.name).toBe('High')
    })

    it('sends Medium priority when passRate is between 50 and 80', async () => {
      mockHttpsRequest(201, { id: '10001', key: 'PROJ-1' })
      const target = new JiraScribeTarget(tmpDir)
      const runData = makeRunData({ passRate: 65 })
      await target.push(runData)
      const req = vi.mocked(https.request).mock.results[0].value as { write: ReturnType<typeof vi.fn> }
      const body = JSON.parse(req.write.mock.calls[0][0] as string)
      expect(body.fields.priority.name).toBe('Medium')
    })

    it('sends Low priority when passRate >= 80', async () => {
      mockHttpsRequest(201, { id: '10001', key: 'PROJ-1' })
      const target = new JiraScribeTarget(tmpDir)
      const runData = makeRunData({
        passRate: 90,
        failedTests: [{ testId: 'test-login', title: 'Login flow', error: 'err', filePath: 'f.ts' }],
        passedTests: [],
      })
      await target.push(runData)
      const req = vi.mocked(https.request).mock.results[0].value as { write: ReturnType<typeof vi.fn> }
      const body = JSON.parse(req.write.mock.calls[0][0] as string)
      expect(body.fields.priority.name).toBe('Low')
    })

    it('persists the jiraTicketId to scribe.json after filing', async () => {
      mockHttpsRequest(201, { id: '10001', key: 'PROJ-42' })
      const target = new JiraScribeTarget(tmpDir)
      await target.push(makeRunData())
      const raw = JSON.parse(
        fs.readFileSync(path.join(tmpDir, '.sentinel', 'scribe.json'), 'utf-8')
      )
      expect(raw.records[0].jiraTicketId).toBe('PROJ-42')
      expect(raw.records[0].testId).toBe('test-login')
    })

    it('skips filing when a ticket already exists for that testId', async () => {
      fs.writeFileSync(
        path.join(tmpDir, '.sentinel', 'scribe.json'),
        JSON.stringify({
          records: [{ testId: 'test-login', jiraTicketId: 'PROJ-99', filedAt: '2026-03-26T00:00:00.000Z' }],
        })
      )
      const target = new JiraScribeTarget(tmpDir)
      await target.push(makeRunData())
      expect(https.request).not.toHaveBeenCalled()
    })

    it('does not throw when https.request emits an error', async () => {
      const req = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
      req.write = vi.fn()
      req.end = vi.fn()
      vi.mocked(https.request).mockImplementation(() => {
        setImmediate(() => req.emit('error', new Error('Network failure')))
        return req as unknown as ReturnType<typeof https.request>
      })
      const target = new JiraScribeTarget(tmpDir)
      await expect(target.push(makeRunData())).resolves.not.toThrow()
    })
  })

  describe('push -- closing tickets', () => {
    it('fetches transitions and posts "Done" when test now passes and jiraCloseOnNConsecutivePasses met', async () => {
      fs.writeFileSync(
        path.join(tmpDir, '.sentinel', 'scribe.json'),
        JSON.stringify({
          records: [{ testId: 'test-login', jiraTicketId: 'PROJ-99', filedAt: '2026-03-26T00:00:00.000Z' }],
        })
      )
      let callCount = 0
      vi.mocked(https.request).mockImplementation((_opts, callback) => {
        const req = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
        req.write = vi.fn()
        req.end = vi.fn()
        const res = new EventEmitter() as EventEmitter & { statusCode: number }
        res.statusCode = 200
        const body = callCount === 0
          ? { transitions: [{ id: '31', name: 'Done' }] }
          : {}
        callCount++
        setImmediate(() => {
          if (callback) (callback as (res: unknown) => void)(res)
          res.emit('data', Buffer.from(JSON.stringify(body)))
          res.emit('end')
        })
        return req as unknown as ReturnType<typeof https.request>
      })

      const target = new JiraScribeTarget(tmpDir)
      const runData = makeRunData({
        failedTests: [],
        passedTests: [{ testId: 'test-login', title: 'Login flow' }],
        passRate: 100,
      })
      await target.push(runData)
      expect(https.request).toHaveBeenCalledTimes(2)
      const transitionCall = vi.mocked(https.request).mock.calls[1][0] as unknown as { path: string; method: string }
      expect(transitionCall.path).toContain('/transitions')
      expect(transitionCall.method).toBe('POST')
    })

    it('marks resolvedAt in scribe.json when closing a ticket', async () => {
      fs.writeFileSync(
        path.join(tmpDir, '.sentinel', 'scribe.json'),
        JSON.stringify({
          records: [{ testId: 'test-login', jiraTicketId: 'PROJ-99', filedAt: '2026-03-25T00:00:00.000Z' }],
        })
      )
      let callCount = 0
      vi.mocked(https.request).mockImplementation((_opts, callback) => {
        const req = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
        req.write = vi.fn()
        req.end = vi.fn()
        const res = new EventEmitter() as EventEmitter & { statusCode: number }
        res.statusCode = 200
        const body = callCount === 0
          ? { transitions: [{ id: '31', name: 'Done' }] }
          : {}
        callCount++
        setImmediate(() => {
          if (callback) (callback as (res: unknown) => void)(res)
          res.emit('data', Buffer.from(JSON.stringify(body)))
          res.emit('end')
        })
        return req as unknown as ReturnType<typeof https.request>
      })

      const target = new JiraScribeTarget(tmpDir)
      await target.push(makeRunData({
        failedTests: [],
        passedTests: [{ testId: 'test-login', title: 'Login flow' }],
        passRate: 100,
      }))
      const raw = JSON.parse(
        fs.readFileSync(path.join(tmpDir, '.sentinel', 'scribe.json'), 'utf-8')
      )
      expect(raw.records[0].resolvedAt).toBeDefined()
    })
  })
})
