#!/usr/bin/env node
import { Command } from 'commander'
import { runTest } from '../cli/commands/test'
import { runHeal } from '../cli/commands/heal'
import { runAsk } from '../cli/commands/ask'
import { runReport } from '../cli/commands/report'
import { runStatus } from '../cli/commands/status'
import { runDiagnose } from '../cli/commands/diagnose'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require('../../package.json') as { version: string }

const program = new Command()

program
  .name('sentinel')
  .description('Sentinel -- your intelligent QA assistant')
  .version(pkg.version)
  .enablePositionalOptions()

program
  .command('test')
  .description('Run Playwright tests with Sentinel intelligence')
  .allowUnknownOption()
  .passThroughOptions()
  .argument('[args...]', 'Playwright CLI arguments passed through verbatim')
  .action(async function (this: Command) {
    await runTest(this.args)
  })

program
  .command('heal')
  .description('Apply pending selector healing suggestions')
  .action(async () => {
    await runHeal()
  })

program
  .command('ask [query]')
  .description('Ask Sentinel a question about your test history')
  .action(async (query?: string) => {
    await runAsk(query)
  })

program
  .command('report')
  .description('Open the last generated HTML report')
  .action(async () => {
    await runReport()
  })

program
  .command('sync')
  .description('Push results to configured Scribe integration targets')
  .action(async () => {
    const { runSync } = await import('../cli/commands/sync')
    await runSync()
  })

program
  .command('status')
  .description('Show test suite health grade and trend summary')
  .action(async () => {
    await runStatus()
  })

program
  .command('diagnose')
  .description('Structured failure analysis for the last run (agent-friendly)')
  .option('--json', 'Emit machine-readable JSON for agents and scripts')
  .action(async (opts: { json?: boolean }) => {
    await runDiagnose(opts)
  })

program.parse(process.argv)
