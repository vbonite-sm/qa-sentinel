// src/cli/commands/sync.ts
import { loadConfig } from '../config-loader'
import { ScribeOrchestrator } from '../../scribe/orchestrator'
import { JiraScribeTarget } from '../../scribe/targets/jira'
import { GitHubScribeTarget } from '../../scribe/targets/github'
import { SlackScribeTarget } from '../../scribe/targets/slack'
import { TeamsScribeTarget } from '../../scribe/targets/teams'

export async function runSync(root = process.cwd()): Promise<void> {
  const config = await loadConfig(root)

  const targets = [
    new JiraScribeTarget(root),
    new GitHubScribeTarget(root),
    new SlackScribeTarget(),
    new TeamsScribeTarget(),
  ]

  const orchestrator = new ScribeOrchestrator(targets, root)
  const runData = orchestrator.buildRunData()

  if (!runData) {
    console.warn('qa-sentinel: No last-run.json found — run `sentinel test` first')
    return
  }

  try {
    await orchestrator.run(config, runData)
    console.log('qa-sentinel: scribe sync complete')
  } catch {
    // Non-fatal — errors from individual targets are already handled inside orchestrator
  }
}
