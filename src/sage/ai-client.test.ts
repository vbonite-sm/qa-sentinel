import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SageContext } from './types'

// Mock the Anthropic SDK before any imports that may require it
const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class Anthropic {
      messages = { create: mockCreate }
    },
  }
})

function makeContext(overrides: Partial<SageContext> = {}): SageContext {
  return {
    runId: 'run-abc',
    currentRun: {
      runId: 'run-abc',
      timestamp: '2026-03-26T00:00:00.000Z',
      total: 100,
      passed: 90,
      failed: 10,
      flaky: 2,
      passRate: 0.90,
      grade: 'B',
    },
    history: [],
    rawSummaries: [],
    ...overrides,
  }
}

describe('askClaude', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetAllMocks()
    process.env.ANTHROPIC_API_KEY = 'test-key'
    delete process.env.SENTINEL_AI_MODEL
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('throws when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const { askClaude } = await import('./ai-client')
    await expect(askClaude(makeContext(), 'why did tests fail?')).rejects.toThrow(/ANTHROPIC_API_KEY/)
  })

  it('calls Anthropic messages.create with the correct model', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Here is the analysis.' }],
    })
    const { askClaude } = await import('./ai-client')
    await askClaude(makeContext(), 'what broke?')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-opus-4-6' })
    )
  })

  it('uses SENTINEL_AI_MODEL env var when set', async () => {
    process.env.SENTINEL_AI_MODEL = 'claude-haiku-4-5'
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Analysis done.' }],
    })
    const { askClaude } = await import('./ai-client')
    await askClaude(makeContext(), 'what broke?')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5' })
    )
  })

  it('returns the text from the first content block', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Root cause: flaky selector.' }],
    })
    const { askClaude } = await import('./ai-client')
    const result = await askClaude(makeContext(), 'what broke?')
    expect(result).toBe('Root cause: flaky selector.')
  })

  it('includes the query in the user message', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Answer.' }],
    })
    const { askClaude } = await import('./ai-client')
    await askClaude(makeContext(), 'which tests are flaky?')
    const call = mockCreate.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> }
    const userMsg = call.messages.find(m => m.role === 'user')
    expect(userMsg?.content).toContain('which tests are flaky?')
  })

  it('includes run stats in the system prompt context', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Answer.' }],
    })
    const ctx = makeContext()
    const { askClaude } = await import('./ai-client')
    await askClaude(ctx, 'summary?')
    const call = mockCreate.mock.calls[0][0] as { system: string }
    expect(call.system).toContain('run-abc')
  })

  it('throws when Anthropic API returns an error', async () => {
    mockCreate.mockRejectedValue(new Error('API rate limit exceeded'))
    const { askClaude } = await import('./ai-client')
    await expect(askClaude(makeContext(), 'what broke?')).rejects.toThrow('API rate limit exceeded')
  })
})
