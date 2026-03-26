import type { SageContext } from './types'

const DEFAULT_MODEL = 'claude-opus-4-6'

function buildSystemPrompt(context: SageContext): string {
  const { currentRun, history } = context

  const historyLines = history.length > 0
    ? history
        .slice(-5)
        .map(r => `  - ${r.timestamp} | runId: ${r.runId} | grade: ${r.grade} | pass: ${(r.passRate * 100).toFixed(1)}% | failed: ${r.failed} | flaky: ${r.flaky}`)
        .join('\n')
    : '  (no prior runs)'

  return `You are Sentinel Sage, an expert QA engineer AI assistant embedded in the qa-sentinel test intelligence platform.

You have access to the following test run data:

Current Run: ${currentRun.runId}
  Timestamp:  ${currentRun.timestamp}
  Grade:      ${currentRun.grade}
  Pass Rate:  ${(currentRun.passRate * 100).toFixed(1)}%
  Total:      ${currentRun.total}
  Passed:     ${currentRun.passed}
  Failed:     ${currentRun.failed}
  Flaky:      ${currentRun.flaky}

Historical Runs (most recent ${history.length}):
${historyLines}

Answer the user's question about this test suite concisely and accurately. Focus on actionable insights. When you mention specific test IDs or file paths, be precise. If data is insufficient to answer definitively, say so.`
}

export async function askClaude(
  context: SageContext,
  query: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    const msg = 'qa-sentinel: ANTHROPIC_API_KEY is not set. Export it and retry.'
    process.stderr.write(msg + '\n')
    throw new Error(msg)
  }

  const model = process.env.SENTINEL_AI_MODEL ?? DEFAULT_MODEL

  // Dynamic import so the optional SDK does not break builds when absent
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: buildSystemPrompt(context),
    messages: [{ role: 'user', content: query }],
  })

  const block = response.content[0]
  if (!block || block.type !== 'text') {
    return 'qa-sentinel: No text response from Claude.'
  }
  return block.text
}
