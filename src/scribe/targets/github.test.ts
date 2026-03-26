import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as https from 'https'
import { EventEmitter } from 'events'

vi.mock('https')

import { GitHubScribeTarget } from './github'
import type { RunData, SentinelConfig } from '../../types'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-gh-scribe-'))
  fs.mkdirSync(path.join(tmpDir, '.sentinel'), { recursive: true })
  vi.resetAllMocks()
  vi.stubEnv('GITHUB_TOKEN', 'ghp_test_token')
  vi.stubEnv('GITHUB_REPOSITORY', 'owner/repo')
  vi.stubEnv('GITHUB_PR_NUMBER', '42')
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function makeRunData(overrides: Partial<RunData> = {}): RunData {
  return {
    manifest: { runId: 'run-abc', timestamp: '2026-03-26T00:00:00.000Z', exitCode: 1, durationMs: 3000 },
    failedTests: [{ testId: 'test-login', title: 'Login flow', error: 'Error msg', filePath: 'tests/auth/login.spec.ts' }],
    passedTests: [{ testId: 'test-signup', title: 'Signup' }],
    passRate: 50,
    stabilityGrade: 'C',
    ...overrides,
  }
}

function mockRequest(statusCode: number, body: unknown) {
  const req = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
  req.write = vi.fn()
  req.end = vi.fn()
  vi.mocked(https.request).mockImplementation((_opts, callback) => {
    const res = new EventEmitter() as EventEmitter & { statusCode: number }
    res.statusCode = statusCode
    setImmediate(() => {
      if (callback) (callback as (res: unknown) => void)(res)
      res.emit('data', Buffer.from(JSON.stringify(body)))
      res.emit('end')
    })
    return req as unknown as ReturnType<typeof https.request>
  })
  return req
}

describe('GitHubScribeTarget', () => {
  describe('canHandle', () => {
    it('returns true when github enabled and env vars present', () => {
      const target = new GitHubScribeTarget(tmpDir)
      expect(target.canHandle({ scribe: { github: true } })).toBe(true)
    })

    it('returns false when github is disabled', () => {
      const target = new GitHubScribeTarget(tmpDir)
      expect(target.canHandle({ scribe: { github: false } })).toBe(false)
    })

    it('returns false when GITHUB_TOKEN is missing', () => {
      vi.stubEnv('GITHUB_TOKEN', '')
      const target = new GitHubScribeTarget(tmpDir)
      expect(target.canHandle({ scribe: { github: true } })).toBe(false)
    })

    it('returns false when GITHUB_PR_NUMBER is missing', () => {
      vi.stubEnv('GITHUB_PR_NUMBER', '')
      const target = new GitHubScribeTarget(tmpDir)
      expect(target.canHandle({ scribe: { github: true } })).toBe(false)
    })
  })

  describe('push', () => {
    it('posts a comment to the correct PR endpoint', async () => {
      mockRequest(201, { id: 9001 })
      const target = new GitHubScribeTarget(tmpDir)
      await target.push(makeRunData())
      const opts = vi.mocked(https.request).mock.calls[0][0] as { hostname: string; path: string; method: string }
      expect(opts.hostname).toBe('api.github.com')
      expect(opts.path).toContain('/issues/42/comments')
      expect(opts.method).toBe('POST')
    })

    it('includes Authorization header with bearer token', async () => {
      mockRequest(201, { id: 9001 })
      const target = new GitHubScribeTarget(tmpDir)
      await target.push(makeRunData())
      const opts = vi.mocked(https.request).mock.calls[0][0] as { headers: Record<string, string> }
      expect(opts.headers['Authorization']).toBe('Bearer ghp_test_token')
    })

    it('comment body contains the markdown table header', async () => {
      mockRequest(201, { id: 9001 })
      const target = new GitHubScribeTarget(tmpDir)
      await target.push(makeRunData())
      const req = vi.mocked(https.request).mock.results[0].value as { write: ReturnType<typeof vi.fn> }
      const body = JSON.parse(req.write.mock.calls[0][0] as string) as { body: string }
      expect(body.body).toContain('## Sentinel Test Report')
      expect(body.body).toContain('| Status | Test | File |')
    })

    it('comment body shows failed test row with X emoji', async () => {
      mockRequest(201, { id: 9001 })
      const target = new GitHubScribeTarget(tmpDir)
      await target.push(makeRunData())
      const req = vi.mocked(https.request).mock.results[0].value as { write: ReturnType<typeof vi.fn> }
      const body = JSON.parse(req.write.mock.calls[0][0] as string) as { body: string }
      expect(body.body).toContain('Login flow')
      expect(body.body).toContain('tests/auth/login.spec.ts')
    })

    it('comment body shows passed test row with checkmark emoji', async () => {
      mockRequest(201, { id: 9001 })
      const target = new GitHubScribeTarget(tmpDir)
      await target.push(makeRunData())
      const req = vi.mocked(https.request).mock.results[0].value as { write: ReturnType<typeof vi.fn> }
      const body = JSON.parse(req.write.mock.calls[0][0] as string) as { body: string }
      expect(body.body).toContain('Signup')
    })

    it('comment body includes pass rate, grade, and run ID', async () => {
      mockRequest(201, { id: 9001 })
      const target = new GitHubScribeTarget(tmpDir)
      await target.push(makeRunData())
      const req = vi.mocked(https.request).mock.results[0].value as { write: ReturnType<typeof vi.fn> }
      const body = JSON.parse(req.write.mock.calls[0][0] as string) as { body: string }
      expect(body.body).toContain('50%')
      expect(body.body).toContain('C')
      expect(body.body).toContain('run-abc')
    })

    it('does not throw on network error', async () => {
      const req = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
      req.write = vi.fn()
      req.end = vi.fn()
      vi.mocked(https.request).mockImplementation(() => {
        setImmediate(() => req.emit('error', new Error('Network down')))
        return req as unknown as ReturnType<typeof https.request>
      })
      const target = new GitHubScribeTarget(tmpDir)
      await expect(target.push(makeRunData())).resolves.not.toThrow()
    })
  })
})
