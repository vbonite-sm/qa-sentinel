# Sentinel CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `npx sentinel test` — the CLI backbone that wraps `playwright test`, manages the `.sentinel/` data store, injects `SENTINEL_CLI_MODE`, and stubs all future module commands.

**Architecture:** A new `src/bin/sentinel.ts` entry point (compiled to `dist/bin/sentinel.js`) built with `commander`. It spawns `playwright test` as a child process with env vars injected, pipes stdio transparently, and writes `.sentinel/last-run.json` on completion. A `SentinelModuleRegistry` class defines the hook interface all future modules will implement — in this sub-project no modules are registered, so all hooks are no-ops. The existing `QaSentinel` Playwright reporter is left functionally unchanged; a `SENTINEL_CLI_MODE` env var check is added to its constructor as a foundation for Sub-project 2.

**Tech Stack:** TypeScript → CommonJS (existing), `commander` (new dep), Node.js `child_process.spawn`, vitest for tests.

---

## File Map

### New Files
| File | Responsibility |
|---|---|
| `src/cli/types.ts` | `SentinelConfig`, `RunManifest`, `SentinelHooks`, `SentinelModule` interfaces |
| `src/cli/run-id.ts` | `generateRunId()` — collision-safe run identifier |
| `src/cli/sentinel-dir.ts` | `.sentinel/` dir management: ensure, migrate, cleanup, write manifest |
| `src/cli/config-loader.ts` | `loadConfig()`, `defineConfig()` — loads `sentinel.config.js` |
| `src/cli/module-registry.ts` | `SentinelModuleRegistry` class — register modules, fire hooks |
| `src/cli/commands/test.ts` | `runTest(args)` — spawns playwright, injects env, writes last-run |
| `src/cli/commands/stubs.ts` | Stub handlers for heal, ask, report, sync, status |
| `src/bin/sentinel.ts` | `commander` program — registers all commands, entry point |
| `src/cli/run-id.test.ts` | Tests for `generateRunId()` |
| `src/cli/sentinel-dir.test.ts` | Tests for dir management + migration |
| `src/cli/config-loader.test.ts` | Tests for `loadConfig()` and `defineConfig()` |
| `src/cli/module-registry.test.ts` | Tests for registry register + fire |
| `src/cli/commands/test.test.ts` | Tests for `runTest()` (mocked spawn) |

### Modified Files
| File | Change |
|---|---|
| `src/types.ts` | Add `SentinelConfig`, `RunManifest` (referenced by both CLI and reporter) |
| `src/qa-sentinel.ts` | Add `SENTINEL_CLI_MODE` env var check in constructor |
| `package.json` | Add `"sentinel"` bin entry, add `commander` to `dependencies` |
| `.gitignore` | Add `.sentinel/` |

---

## Task 1: Shared Types

**Files:**
- Create: `src/cli/types.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Add `RunManifest` and `SentinelConfig` to `src/types.ts`**

Open `src/types.ts` and append at the end:

```ts
// ============================================================================
// Sentinel CLI Types
// ============================================================================

export interface SentinelConfig {
  agent?: {
    heal?: boolean
    cdp?: boolean
    circuitBreakerThreshold?: number
  }
  sage?: {
    ai?: 'claude' | 'openai'
    digest?: boolean
    historyDepth?: number
  }
  scribe?: {
    jira?: boolean
    github?: boolean
    slack?: boolean
    teams?: boolean
    jiraCloseOnNConsecutivePasses?: number
  }
  seer?: {
    predict?: boolean
    minConfidence?: number
    diffBase?: string
  }
}

export interface RunManifest {
  runId: string
  timestamp: string
  branch?: string
  commitSha?: string
  exitCode: number
  durationMs: number
}
```

- [ ] **Step 2: Create `src/cli/types.ts`** — CLI-internal types (hooks + module interface)

```ts
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
```

- [ ] **Step 3: Build and verify types compile**

```bash
npm run build 2>&1 | tail -5
```

Expected: zero TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/cli/types.ts
git commit -m "feat(cli): add SentinelConfig, RunManifest, and hook types"
```

---

## Task 2: Run ID Generator

**Files:**
- Create: `src/cli/run-id.ts`
- Create: `src/cli/run-id.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/cli/run-id.test.ts
import { describe, it, expect } from 'vitest'
import { generateRunId } from './run-id'

describe('generateRunId', () => {
  it('returns a non-empty string', () => {
    expect(typeof generateRunId()).toBe('string')
    expect(generateRunId().length).toBeGreaterThan(0)
  })

  it('returns unique IDs on successive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, generateRunId))
    expect(ids.size).toBe(100)
  })

  it('contains only URL-safe characters', () => {
    const id = generateRunId()
    expect(id).toMatch(/^[a-z0-9-]+$/)
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run src/cli/run-id.test.ts
```

Expected: FAIL — `Cannot find module './run-id'`

- [ ] **Step 3: Implement `generateRunId`**

```ts
// src/cli/run-id.ts
import { randomBytes } from 'crypto'

export function generateRunId(): string {
  const timestamp = Date.now().toString(36)
  const random = randomBytes(4).toString('hex')
  return `${timestamp}-${random}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/cli/run-id.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/run-id.ts src/cli/run-id.test.ts
git commit -m "feat(cli): add generateRunId utility"
```

---

## Task 3: `.sentinel/` Directory Utilities

**Files:**
- Create: `src/cli/sentinel-dir.ts`
- Create: `src/cli/sentinel-dir.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/cli/sentinel-dir.test.ts
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
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run src/cli/sentinel-dir.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `sentinel-dir.ts`**

```ts
// src/cli/sentinel-dir.ts
import * as fs from 'fs'
import * as path from 'path'
import type { RunManifest } from '../types'

const SENTINEL_DIR = '.sentinel'
const LEGACY_HISTORY_FILENAME = 'sentinel-history.json'

export function getSentinelDir(root = process.cwd()): string {
  return path.join(root, SENTINEL_DIR)
}

export function ensureSentinelDir(root = process.cwd()): void {
  const base = getSentinelDir(root)
  fs.mkdirSync(path.join(base, 'runs'), { recursive: true })
}

export function migrateHistory(root = process.cwd()): void {
  const legacy = path.join(root, LEGACY_HISTORY_FILENAME)
  const target = path.join(getSentinelDir(root), 'history.json')
  if (fs.existsSync(legacy) && !fs.existsSync(target)) {
    fs.renameSync(legacy, target)
  }
}

export function ensureRunDir(runId: string, root = process.cwd()): string {
  const dir = path.join(getSentinelDir(root), 'runs', runId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function cleanupFixtureFiles(runId: string, root = process.cwd()): void {
  const runDir = path.join(getSentinelDir(root), 'runs', runId)
  if (!fs.existsSync(runDir)) return
  for (const file of fs.readdirSync(runDir)) {
    if (file.endsWith('-fixture.json')) {
      fs.unlinkSync(path.join(runDir, file))
    }
  }
}

export function writeLastRun(manifest: RunManifest, root = process.cwd()): void {
  const target = path.join(getSentinelDir(root), 'last-run.json')
  fs.writeFileSync(target, JSON.stringify(manifest, null, 2))
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/cli/sentinel-dir.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/sentinel-dir.ts src/cli/sentinel-dir.test.ts
git commit -m "feat(cli): add .sentinel/ directory utilities with legacy migration"
```

---

## Task 4: Config Loader

**Files:**
- Create: `src/cli/config-loader.ts`
- Create: `src/cli/config-loader.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/cli/config-loader.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { defineConfig, loadConfig } from './config-loader'
import type { SentinelConfig } from '../types'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-cfg-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('defineConfig', () => {
  it('returns the config object unchanged', () => {
    const cfg: SentinelConfig = { sage: { ai: 'claude' } }
    expect(defineConfig(cfg)).toEqual(cfg)
  })
})

describe('loadConfig', () => {
  it('returns empty object when no config file exists', async () => {
    const cfg = await loadConfig(tmpDir)
    expect(cfg).toEqual({})
  })

  it('loads sentinel.config.json when present', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'sentinel.config.json'),
      JSON.stringify({ sage: { ai: 'claude' } })
    )
    const cfg = await loadConfig(tmpDir)
    expect(cfg.sage?.ai).toBe('claude')
  })

  it('loads sentinel.config.js when present', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'sentinel.config.js'),
      `module.exports = { sage: { digest: true } }`
    )
    const cfg = await loadConfig(tmpDir)
    expect(cfg.sage?.digest).toBe(true)
  })

  it('prefers .js over .json when both exist', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'sentinel.config.json'),
      JSON.stringify({ sage: { ai: 'openai' } })
    )
    fs.writeFileSync(
      path.join(tmpDir, 'sentinel.config.js'),
      `module.exports = { sage: { ai: 'claude' } }`
    )
    const cfg = await loadConfig(tmpDir)
    expect(cfg.sage?.ai).toBe('claude')
  })

  it('returns empty object if config file throws on load', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'sentinel.config.js'),
      `throw new Error('bad config')`
    )
    const cfg = await loadConfig(tmpDir)
    expect(cfg).toEqual({})
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run src/cli/config-loader.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `config-loader.ts`**

```ts
// src/cli/config-loader.ts
import * as fs from 'fs'
import * as path from 'path'
import type { SentinelConfig } from '../types'

export function defineConfig(config: SentinelConfig): SentinelConfig {
  return config
}

export async function loadConfig(root = process.cwd()): Promise<SentinelConfig> {
  // Try .js first (compiled TS or plain JS)
  const jsPath = path.join(root, 'sentinel.config.js')
  if (fs.existsSync(jsPath)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(jsPath)
      return (mod.default ?? mod) as SentinelConfig
    } catch {
      return {}
    }
  }

  // Fall back to JSON
  const jsonPath = path.join(root, 'sentinel.config.json')
  if (fs.existsSync(jsonPath)) {
    try {
      return JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as SentinelConfig
    } catch {
      return {}
    }
  }

  return {}
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/cli/config-loader.test.ts
```

Expected: all tests pass.

> **Note:** `sentinel.config.ts` support (TypeScript-native config without compiling) is intentionally deferred. Users may use `sentinel.config.js` or `sentinel.config.json` for Sub-projects 1–2. TypeScript config loading via `tsx`/`jiti` will be added in a later sub-project. `config-cache.json` (resolved config written to `.sentinel/`) is also deferred — it is only needed once modules query config at runtime (Sub-project 2+).

- [ ] **Step 5: Commit**

```bash
git add src/cli/config-loader.ts src/cli/config-loader.test.ts
git commit -m "feat(cli): add config loader with JS and JSON support"
```

---

## Task 5: Module Registry

**Files:**
- Create: `src/cli/module-registry.ts`
- Create: `src/cli/module-registry.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/cli/module-registry.test.ts
import { describe, it, expect, vi } from 'vitest'
import { SentinelModuleRegistry } from './module-registry'

describe('SentinelModuleRegistry', () => {
  it('starts with no modules', () => {
    const registry = new SentinelModuleRegistry()
    expect(registry.getModules()).toHaveLength(0)
  })

  it('registers a module', () => {
    const registry = new SentinelModuleRegistry()
    registry.register({ name: 'test-module', hooks: {} })
    expect(registry.getModules()).toHaveLength(1)
    expect(registry.getModules()[0].name).toBe('test-module')
  })

  it('fires a hook on all registered modules', async () => {
    const registry = new SentinelModuleRegistry()
    const onRunStart = vi.fn().mockResolvedValue(undefined)
    registry.register({ name: 'mod-a', hooks: { onRunStart } })
    registry.register({ name: 'mod-b', hooks: { onRunStart } })
    await registry.fire('onRunStart')
    expect(onRunStart).toHaveBeenCalledTimes(2)
  })

  it('skips modules that do not implement the fired hook', async () => {
    const registry = new SentinelModuleRegistry()
    const onRunEnd = vi.fn().mockResolvedValue(undefined)
    registry.register({ name: 'mod-a', hooks: { onRunEnd } })
    registry.register({ name: 'mod-b', hooks: {} }) // no onRunEnd
    await registry.fire('onRunEnd')
    expect(onRunEnd).toHaveBeenCalledTimes(1)
  })

  it('fires hooks in registration order', async () => {
    const registry = new SentinelModuleRegistry()
    const order: string[] = []
    registry.register({
      name: 'first',
      hooks: { onRunStart: async () => { order.push('first') } },
    })
    registry.register({
      name: 'second',
      hooks: { onRunStart: async () => { order.push('second') } },
    })
    await registry.fire('onRunStart')
    expect(order).toEqual(['first', 'second'])
  })

  it('passes arguments to hooks that accept them', async () => {
    const registry = new SentinelModuleRegistry()
    const onTestEnd = vi.fn().mockResolvedValue(undefined)
    registry.register({ name: 'mod', hooks: { onTestEnd } })
    await registry.fire('onTestEnd', 'test-id-123')
    expect(onTestEnd).toHaveBeenCalledWith('test-id-123')
  })

  it('passes path argument to onReportGenerated', async () => {
    const registry = new SentinelModuleRegistry()
    const onReportGenerated = vi.fn().mockResolvedValue(undefined)
    registry.register({ name: 'mod', hooks: { onReportGenerated } })
    await registry.fire('onReportGenerated', '/path/to/report.html')
    expect(onReportGenerated).toHaveBeenCalledWith('/path/to/report.html')
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run src/cli/module-registry.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `module-registry.ts`**

```ts
// src/cli/module-registry.ts
import type { SentinelModule, SentinelHooks } from './types'

export class SentinelModuleRegistry {
  private modules: SentinelModule[] = []

  register(module: SentinelModule): void {
    this.modules.push(module)
  }

  async fire<K extends keyof SentinelHooks>(
    hook: K,
    ...args: Parameters<NonNullable<SentinelHooks[K]>>
  ): Promise<void> {
    for (const mod of this.modules) {
      const handler = mod.hooks[hook] as
        | ((...a: unknown[]) => Promise<void>)
        | undefined
      if (handler) {
        await handler(...(args as unknown[]))
      }
    }
  }

  getModules(): SentinelModule[] {
    return [...this.modules]
  }
}

export const globalRegistry = new SentinelModuleRegistry()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/cli/module-registry.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/module-registry.ts src/cli/module-registry.test.ts
git commit -m "feat(cli): add SentinelModuleRegistry with typed hook system"
```

---

## Task 6: Reporter CLI-Mode Hook

**Files:**
- Modify: `src/qa-sentinel.ts`

The reporter needs to recognise when it is running under `sentinel test` (detected via `SENTINEL_CLI_MODE=1`). In Sub-project 1 this is a foundation-only change — it logs a message and sets a flag. Sub-project 2 will wire actual module hooks through the registry.

- [ ] **Step 1: Add `isCLIMode` class field and CLI-mode log in reporter constructor**

In `src/qa-sentinel.ts`, make two separate edits:

**Edit A — add class field** (in the class body, alongside other private fields like `historyCollector`, `stepCollector`, etc.):

```ts
private readonly isCLIMode: boolean = process.env['SENTINEL_CLI_MODE'] === '1'
```

**Edit B — add log block** (inside the `constructor` body, after the existing initialisation code):

```ts
if (this.isCLIMode) {
  const runId = process.env['SENTINEL_RUN_ID'] ?? 'unknown'
  console.log(`qa-sentinel: CLI mode active (run ${runId})`)
}
```

These are two separate edits. The field declaration goes in the class body. The `if` block goes inside the constructor.

- [ ] **Step 2: Build and run existing tests to verify no regressions**

```bash
npm run build 2>&1 | tail -5
npx vitest run --reporter=verbose 2>&1 | tail -10
```

Expected: build succeeds, all existing tests still pass.

- [ ] **Step 3: Commit**

```bash
git add src/qa-sentinel.ts
git commit -m "feat(cli): add SENTINEL_CLI_MODE detection in QaSentinel reporter"
```

---

## Task 7: `sentinel test` Command

**Files:**
- Create: `src/cli/commands/test.ts`
- Create: `src/cli/commands/test.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/cli/commands/test.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as childProcess from 'child_process'
import type { EventEmitter } from 'events'

// We test the logic of runTest by mocking child_process.spawn
vi.mock('child_process')

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-test-cmd-'))
  vi.resetAllMocks()
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function mockSpawn(exitCode: number) {
  const emitter = {
    on: vi.fn((event: string, cb: (code: number) => void) => {
      if (event === 'close') setTimeout(() => cb(exitCode), 0)
      return emitter
    }),
  } as unknown as EventEmitter
  vi.mocked(childProcess.spawn).mockReturnValue(emitter as ReturnType<typeof childProcess.spawn>)
  return emitter
}

describe('runTest', () => {
  it('creates .sentinel directory before spawning playwright', async () => {
    mockSpawn(0)
    const { runTest } = await import('./test')
    await runTest([], tmpDir)
    expect(fs.existsSync(path.join(tmpDir, '.sentinel'))).toBe(true)
  })

  it('spawns playwright with SENTINEL_CLI_MODE and SENTINEL_RUN_ID env vars', async () => {
    mockSpawn(0)
    const { runTest } = await import('./test')
    await runTest(['--grep', '@smoke'], tmpDir)
    expect(childProcess.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['test', '--grep', '@smoke']),
      expect.objectContaining({
        env: expect.objectContaining({
          SENTINEL_CLI_MODE: '1',
          SENTINEL_RUN_ID: expect.stringMatching(/^[a-z0-9-]+$/),
        }),
      })
    )
  })

  it('writes .sentinel/last-run.json after playwright exits', async () => {
    mockSpawn(0)
    const { runTest } = await import('./test')
    await runTest([], tmpDir)
    const lastRun = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.sentinel', 'last-run.json'), 'utf-8')
    )
    expect(lastRun.exitCode).toBe(0)
    expect(typeof lastRun.runId).toBe('string')
    expect(typeof lastRun.durationMs).toBe('number')
  })

  it('records failing exit code in last-run.json', async () => {
    mockSpawn(1)
    const { runTest } = await import('./test')
    await runTest([], tmpDir)
    const lastRun = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.sentinel', 'last-run.json'), 'utf-8')
    )
    expect(lastRun.exitCode).toBe(1)
  })

  it('uses stdio: inherit so playwright output is visible', async () => {
    mockSpawn(0)
    const { runTest } = await import('./test')
    await runTest([], tmpDir)
    expect(childProcess.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ stdio: 'inherit' })
    )
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run src/cli/commands/test.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `commands/test.ts`**

```ts
// src/cli/commands/test.ts
import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { generateRunId } from '../run-id'
import { ensureSentinelDir, migrateHistory, writeLastRun } from '../sentinel-dir'
import type { RunManifest } from '../../types'

function findPlaywrightBin(root: string): string {
  const local = path.join(root, 'node_modules', '.bin', 'playwright')
  if (fs.existsSync(local)) return local
  // Windows adds .cmd extension
  const localCmd = `${local}.cmd`
  if (fs.existsSync(localCmd)) return localCmd
  return 'playwright' // fall back to PATH
}

export async function runTest(
  playwrightArgs: string[],
  root = process.cwd()
): Promise<void> {
  const runId = generateRunId()

  ensureSentinelDir(root)
  migrateHistory(root)

  const playwrightBin = findPlaywrightBin(root)
  const startMs = Date.now()

  return new Promise((resolve, reject) => {
    const child = spawn(playwrightBin, ['test', ...playwrightArgs], {
      stdio: 'inherit',
      env: {
        ...process.env,
        SENTINEL_CLI_MODE: '1',
        SENTINEL_RUN_ID: runId,
      },
    })

    child.on('error', reject)

    child.on('close', (code) => {
      const manifest: RunManifest = {
        runId,
        timestamp: new Date().toISOString(),
        exitCode: code ?? 1,
        durationMs: Date.now() - startMs,
      }

      try {
        writeLastRun(manifest, root)
      } catch {
        // non-fatal — don't let a write failure kill the process
      }

      process.exitCode = code ?? 1
      resolve()
    })
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/cli/commands/test.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/test.ts src/cli/commands/test.test.ts
git commit -m "feat(cli): implement sentinel test command with playwright spawn"
```

---

## Task 8: Command Stubs

**Files:**
- Create: `src/cli/commands/stubs.ts`

No tests needed for stubs — they are one-liners with no logic.

- [ ] **Step 1: Create `stubs.ts`**

```ts
// src/cli/commands/stubs.ts

export interface StubOptions {
  name: string
  requirement: string
}

export function createStub({ name, requirement }: StubOptions): () => void {
  return () => {
    console.log(`sentinel ${name}: not yet available`)
    console.log(`Requires: ${requirement}`)
    process.exitCode = 1
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/cli/commands/stubs.ts
git commit -m "feat(cli): add stub factory for unimplemented commands"
```

---

## Task 9: CLI Entry Point + Package Registration

**Files:**
- Create: `src/bin/sentinel.ts`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Add `commander` to dependencies**

```bash
npm install commander
```

Verify it was added to `package.json` dependencies.

- [ ] **Step 2: Create `src/bin/sentinel.ts`**

```ts
#!/usr/bin/env node
import { Command } from 'commander'
import { runTest } from '../cli/commands/test'
import { createStub } from '../cli/commands/stubs'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require('../../package.json') as { version: string }

const program = new Command()

program
  .name('sentinel')
  .description('Sentinel — your intelligent QA assistant')
  .version(pkg.version)

program
  .command('test')
  .description('Run Playwright tests with Sentinel intelligence')
  .allowUnknownOption()
  .passThroughOptions()
  .action(async function (this: Command) {
    // `this.args` is the reliable way to get pass-through args with commander
    // when using .passThroughOptions() + .allowUnknownOption()
    await runTest(this.args)
  })

program
  .command('heal')
  .description('Apply pending selector healing suggestions')
  .action(createStub({ name: 'heal', requirement: 'Sentinel Agent (Sub-project 2)' }))

program
  .command('ask [query]')
  .description('Ask Sentinel a question about your test history')
  .action(createStub({ name: 'ask', requirement: 'Sentinel Sage (Sub-project 3)' }))

program
  .command('report')
  .description('Open the last generated HTML report')
  .action(createStub({ name: 'report', requirement: 'Coming in Sub-project 3' }))

program
  .command('sync')
  .description('Push results to configured Scribe integration targets')
  .action(createStub({ name: 'sync', requirement: 'Sentinel Scribe (Sub-project 4)' }))

program
  .command('status')
  .description('Show test suite health grade and trend summary')
  .action(createStub({ name: 'status', requirement: 'Coming in Sub-project 3' }))

program.parse(process.argv)
```

- [ ] **Step 3: Add `sentinel` bin entry to `package.json`**

In `package.json`, update the `"bin"` block to add:

```json
"sentinel": "./dist/bin/sentinel.js"
```

Full updated block:

```json
"bin": {
  "qa-sentinel-merge-history": "./dist/bin/merge-history.js",
  "qa-sentinel-view-trace": "./dist/bin/view-trace.js",
  "qa-sentinel-serve": "./dist/bin/serve.js",
  "qa-sentinel": "./dist/bin/cli.js",
  "sentinel": "./dist/bin/sentinel.js"
}
```

- [ ] **Step 4: Add `.sentinel/` to `.gitignore`**

Append to `.gitignore`:

```
# Sentinel data store
.sentinel/
```

- [ ] **Step 5: Build**

```bash
npm run build 2>&1 | tail -10
```

Expected: zero errors. `dist/bin/sentinel.js` should exist.

```bash
ls dist/bin/sentinel.js
```

- [ ] **Step 6: Verify the binary works**

```bash
node dist/bin/sentinel.js --version
node dist/bin/sentinel.js --help
node dist/bin/sentinel.js heal
```

Expected:
- `--version` prints the package version
- `--help` lists all commands
- `heal` prints the stub message and exits with code 1

- [ ] **Step 7: Run full test suite to verify no regressions**

```bash
npm test 2>&1 | tail -15
```

Expected: all existing + new tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/bin/sentinel.ts package.json package-lock.json .gitignore
git commit -m "feat(cli): add sentinel bin entry point with commander and command stubs"
```

---

## Task 10: Integration Smoke Test

Verify the full `sentinel test` flow works end-to-end against the existing example tests.

- [ ] **Step 1: Build**

```bash
npm run build
```

- [ ] **Step 2: Run `sentinel test` against the example suite**

```bash
node dist/bin/sentinel.js test --project=chromium 2>&1 | head -30
```

Expected:
- Output includes `qa-sentinel: CLI mode active (run <runId>)`
- Playwright test output is visible (piped through)
- Process exits (0 or non-zero depending on example test state)

- [ ] **Step 3: Verify `.sentinel/` directory was created**

```bash
ls .sentinel/
ls .sentinel/runs/
cat .sentinel/last-run.json
```

Expected: `.sentinel/last-run.json` exists with `runId`, `timestamp`, `exitCode`, `durationMs`.

- [ ] **Step 4: Verify legacy migration works (if sentinel-history.json exists)**

```bash
# Create a dummy legacy file to test migration
echo '{"runs":[]}' > sentinel-history.json
node dist/bin/sentinel.js test --list 2>&1 | head -5
ls .sentinel/history.json
ls sentinel-history.json 2>/dev/null || echo "legacy file removed — migration succeeded"
```

Expected: `.sentinel/history.json` exists, `sentinel-history.json` is gone.

- [ ] **Step 5: Final full test run**

```bash
npm test 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 6: Final commit**

```bash
git add src/ package.json package-lock.json .gitignore
git commit -m "feat(cli): Sub-project 1 complete — sentinel test CLI backbone"
```

---

## Definition of Done

- [ ] `npx sentinel test` wraps `playwright test` transparently — all args pass through
- [ ] `.sentinel/` directory is created on first run
- [ ] `legacy sentinel-history.json` is auto-migrated to `.sentinel/history.json`
- [ ] `.sentinel/last-run.json` is written after every run
- [ ] `SENTINEL_CLI_MODE=1` and `SENTINEL_RUN_ID` are injected as env vars
- [ ] `QaSentinel` reporter logs CLI mode activation when those vars are present
- [ ] `sentinel heal/ask/report/sync/status` all exit cleanly with stub messages
- [ ] `SentinelModuleRegistry` is in place with typed hooks — ready for Sub-project 2
- [ ] All existing vitest tests continue to pass
- [ ] `npm run build` produces zero TypeScript errors
