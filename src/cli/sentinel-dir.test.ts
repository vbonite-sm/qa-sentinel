import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  getSentinelDir,
  ensureSentinelDir,
  migrateHistory,
  ensureRunDir,
  cleanupFixtureFiles,
  writeLastRun,
} from './sentinel-dir'
import type { RunManifest } from '../types'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('getSentinelDir', () => {
  it('returns .sentinel path under root', () => {
    expect(getSentinelDir(tmpDir)).toBe(path.join(tmpDir, '.sentinel'))
  })
})

describe('ensureSentinelDir', () => {
  it('creates .sentinel and .sentinel/runs directories', () => {
    ensureSentinelDir(tmpDir)
    expect(fs.existsSync(path.join(tmpDir, '.sentinel'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, '.sentinel', 'runs'))).toBe(true)
  })

  it('is idempotent — calling twice does not throw', () => {
    expect(() => {
      ensureSentinelDir(tmpDir)
      ensureSentinelDir(tmpDir)
    }).not.toThrow()
  })
})

describe('migrateHistory', () => {
  it('moves sentinel-history.json to .sentinel/history.json when legacy file exists', () => {
    const legacy = path.join(tmpDir, 'sentinel-history.json')
    fs.writeFileSync(legacy, '{"runs":[]}')
    ensureSentinelDir(tmpDir)
    migrateHistory(tmpDir)
    expect(fs.existsSync(legacy)).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, '.sentinel', 'history.json'))).toBe(true)
  })

  it('does nothing when no legacy file exists', () => {
    ensureSentinelDir(tmpDir)
    expect(() => migrateHistory(tmpDir)).not.toThrow()
  })

  it('does not overwrite existing .sentinel/history.json', () => {
    const legacy = path.join(tmpDir, 'sentinel-history.json')
    const target = path.join(tmpDir, '.sentinel', 'history.json')
    fs.writeFileSync(legacy, '{"runs":["legacy"]}')
    ensureSentinelDir(tmpDir)
    fs.writeFileSync(target, '{"runs":["existing"]}')
    migrateHistory(tmpDir)
    expect(fs.readFileSync(target, 'utf-8')).toContain('existing')
    expect(fs.existsSync(legacy)).toBe(true) // legacy left untouched
  })
})

describe('ensureRunDir', () => {
  it('creates .sentinel/runs/{runId} and returns its path', () => {
    ensureSentinelDir(tmpDir)
    const dir = ensureRunDir('abc-123', tmpDir)
    expect(fs.existsSync(dir)).toBe(true)
    expect(dir).toBe(path.join(tmpDir, '.sentinel', 'runs', 'abc-123'))
  })
})

describe('cleanupFixtureFiles', () => {
  it('removes only *-fixture.json files from run dir', () => {
    ensureSentinelDir(tmpDir)
    const runDir = ensureRunDir('run-1', tmpDir)
    fs.writeFileSync(path.join(runDir, 'abc-fixture.json'), '{}')
    fs.writeFileSync(path.join(runDir, 'manifest.json'), '{}')
    fs.writeFileSync(path.join(runDir, 'report.html'), '<html/>')
    cleanupFixtureFiles('run-1', tmpDir)
    expect(fs.existsSync(path.join(runDir, 'abc-fixture.json'))).toBe(false)
    expect(fs.existsSync(path.join(runDir, 'manifest.json'))).toBe(true)
    expect(fs.existsSync(path.join(runDir, 'report.html'))).toBe(true)
  })

  it('does not throw if run dir does not exist', () => {
    ensureSentinelDir(tmpDir)
    expect(() => cleanupFixtureFiles('nonexistent', tmpDir)).not.toThrow()
  })
})

describe('writeLastRun', () => {
  it('writes manifest as JSON to .sentinel/last-run.json', () => {
    ensureSentinelDir(tmpDir)
    const manifest: RunManifest = {
      runId: 'test-run',
      timestamp: '2026-03-21T00:00:00.000Z',
      exitCode: 0,
      durationMs: 1234,
    }
    writeLastRun(manifest, tmpDir)
    const written = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.sentinel', 'last-run.json'), 'utf-8')
    )
    expect(written.runId).toBe('test-run')
    expect(written.exitCode).toBe(0)
  })
})
