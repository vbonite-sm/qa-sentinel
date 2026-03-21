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
  .enablePositionalOptions()

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
