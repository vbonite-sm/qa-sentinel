import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import type { RunManifest } from '../../types'
import { getSentinelDir } from '../sentinel-dir'
import { buildSageContext } from '../../sage/context-builder'
import { askClaude } from '../../sage/ai-client'

function readLastRunId(root: string): string {
  const lastRunPath = path.join(getSentinelDir(root), 'last-run.json')
  if (!fs.existsSync(lastRunPath)) {
    throw new Error(`qa-sentinel: No last run found. Run \`sentinel test\` first.`)
  }
  const manifest = JSON.parse(fs.readFileSync(lastRunPath, 'utf-8')) as RunManifest
  return manifest.runId
}

async function answerQuery(
  query: string,
  root: string,
  historyDepth?: number
): Promise<void> {
  const runId = readLastRunId(root)
  const context = buildSageContext(runId, root, historyDepth)
  const answer = await askClaude(context, query)
  process.stdout.write('\n' + answer + '\n\n')
}

export async function runAsk(
  query?: string,
  root = process.cwd(),
  historyDepth?: number
): Promise<void> {
  if (query) {
    // Single-shot mode
    try {
      await answerQuery(query, root, historyDepth)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write('qa-sentinel: ' + msg + '\n')
      process.exit(1)
    }
    return
  }

  // REPL mode
  let runId: string
  try {
    runId = readLastRunId(root)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write('qa-sentinel: ' + msg + '\n')
    process.exit(1)
    return
  }

  const context = buildSageContext(runId, root, historyDepth)

  process.stdout.write('Sentinel Sage REPL -- type your question, or "exit" to quit.\n\n')

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'sage> ',
  })

  rl.prompt()

  rl.on('line', (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) {
      rl.prompt()
      return
    }
    if (trimmed === 'exit' || trimmed === 'quit') {
      rl.close()
      return
    }
    rl.pause()
    askClaude(context, trimmed)
      .then(answer => {
        process.stdout.write('\n' + answer + '\n\n')
      })
      .catch(err => {
        const msg = err instanceof Error ? err.message : String(err)
        process.stderr.write('qa-sentinel: ' + msg + '\n')
      })
      .finally(() => {
        rl.resume()
        rl.prompt()
      })
  })

  await new Promise<void>(resolve => rl.on('close', resolve))
}
