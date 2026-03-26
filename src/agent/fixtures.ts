import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import type { FixtureData } from '../types'

const LOCATOR_ERROR_PATTERNS = [
  /locator\(/,
  /getByRole\(/,
  /getByText\(/,
  /getByLabel\(/,
  /getByPlaceholder\(/,
  /getByTestId\(/,
  /getByAltText\(/,
  /getByTitle\(/,
]

function isLocatorError(errorMessage: string): boolean {
  return LOCATOR_ERROR_PATTERNS.some(p => p.test(errorMessage))
}

function extractSelectorFromError(errorMessage: string): string {
  const m = errorMessage.match(/((?:locator|getBy\w+)\([^)]+\))/)
  if (m) return m[1]
  return errorMessage.split('\n')[0].slice(0, 200)
}

function fixtureFileName(runId: string, workerIndex: number, testTitle: string): string {
  const hash = crypto.createHash('sha1').update(testTitle).digest('hex').slice(0, 8)
  return `${runId}-${workerIndex}-${hash}-fixture.json`
}

function getRunDir(runId: string, root = process.cwd()): string {
  return path.join(root, '.sentinel', 'runs', runId)
}

type SentinelFixtures = {
  _sentinelAgent: void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sentinelFixtures: Record<string, any> = {
  _sentinelAgent: [
    async (
      { page }: { page: import('@playwright/test').Page },
      use: () => Promise<void>,
      testInfo: import('@playwright/test').TestInfo
    ) => {
      const isCLIMode = process.env['SENTINEL_CLI_MODE'] === '1'
      const runId = process.env['SENTINEL_RUN_ID'] ?? 'unknown'
      const workerIndex = testInfo.workerIndex
      const testTitle = testInfo.title
      const root = process.cwd()

      let heapAtStart = 0
      let cdpSession: import('@playwright/test').CDPSession | null = null

      try {
        cdpSession = await page.context().newCDPSession(page)
        const heap = await cdpSession.send('Runtime.getHeapUsage') as {
          usedSize: number;
          totalSize: number;
        }
        heapAtStart = heap.usedSize
      } catch {
        // CDP not supported on this browser/context -- continue without heap monitoring
      }

      const consoleErrors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text())
        }
      })

      await use()

      if (!isCLIMode) return

      const status = testInfo.status
      const failureDetected = status === 'failed' || status === 'timedOut'

      let heapDeltaMB: number | undefined
      if (cdpSession) {
        try {
          const heap = await cdpSession.send('Runtime.getHeapUsage') as {
            usedSize: number;
            totalSize: number;
          }
          const deltaMB = (heap.usedSize - heapAtStart) / (1024 * 1024)
          heapDeltaMB = Math.round(deltaMB * 100) / 100
          if (deltaMB > 100) {
            console.warn(`qa-sentinel: heap delta >100MB for "${testTitle}" -- possible memory leak`)
          } else if (deltaMB > 50) {
            console.warn(`qa-sentinel: heap delta >50MB for "${testTitle}" -- monitor for leaks`)
          }
        } catch {
          // CDP read failed after test -- ignore
        }
        try {
          await cdpSession.detach()
        } catch {
          // Ignore detach errors
        }
      }

      let domSnapshot: string | undefined
      let selectorError: string | undefined

      if (failureDetected) {
        const errors = testInfo.errors ?? []
        for (const err of errors) {
          const msg = err.message ?? ''
          if (isLocatorError(msg)) {
            selectorError = extractSelectorFromError(msg)
            try {
              domSnapshot = await page.evaluate('document.documentElement.outerHTML') as string
            } catch {
              // Page may be closed -- ignore
            }
            break
          }
        }
      }

      const fixtureData: FixtureData = {
        testId: testInfo.testId,
        testTitle,
        workerIndex,
        domSnapshot,
        heapDeltaMB,
        consoleErrors,
        selectorError,
        failureDetected,
      }

      try {
        const runDir = getRunDir(runId, root)
        fs.mkdirSync(runDir, { recursive: true })
        const fileName = fixtureFileName(runId, workerIndex, testTitle)
        fs.writeFileSync(
          path.join(runDir, fileName),
          JSON.stringify(fixtureData, null, 2)
        )
      } catch {
        // Non-fatal -- do not break the test run if fixture write fails
      }
    },
    { auto: true, scope: 'test' },
  ],
}
