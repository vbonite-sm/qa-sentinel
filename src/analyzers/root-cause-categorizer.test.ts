import { describe, it, expect } from 'vitest'
import { categorizeFailure, categoryLabel } from './root-cause-categorizer'
import type { FixtureData } from '../types'

function fixture(overrides: Partial<FixtureData>): FixtureData {
  return {
    testId: 't1',
    testTitle: 'test',
    workerIndex: 0,
    consoleErrors: [],
    failureDetected: true,
    ...overrides,
  }
}

describe('categorizeFailure', () => {
  it('classifies timeouts as timing', () => {
    const r = categorizeFailure('TimeoutError: page.goto: Timeout 30000 ms exceeded')
    expect(r.category).toBe('timing')
    expect(r.confidence).toBeGreaterThan(0.5)
    expect(r.signals.length).toBeGreaterThan(0)
  })

  it('classifies strict-mode / resolution failures as selector-not-found', () => {
    const r = categorizeFailure('Error: strict mode violation: locator resolved to 3 elements')
    expect(r.category).toBe('selector-not-found')
  })

  it('classifies assertion errors', () => {
    const r = categorizeFailure("AssertionError: expected 'foo' to equal 'bar'")
    expect(r.category).toBe('assertion')
  })

  it('classifies connection errors as network', () => {
    const r = categorizeFailure('Error: connect ECONNREFUSED 127.0.0.1:8080')
    expect(r.category).toBe('network')
  })

  it('classifies heap errors as resource-exhaustion', () => {
    const r = categorizeFailure('FATAL ERROR: JavaScript heap out of memory')
    expect(r.category).toBe('resource-exhaustion')
  })

  it('uses fixture heap delta as a resource signal without error text', () => {
    const r = categorizeFailure(undefined, fixture({ heapDeltaMB: 800 }))
    expect(r.category).toBe('resource-exhaustion')
    expect(r.signals[0]).toMatch(/heap grew/)
  })

  it('returns unknown with zero confidence when there is no signal', () => {
    const r = categorizeFailure(undefined)
    expect(r.category).toBe('unknown')
    expect(r.confidence).toBe(0)
  })

  it('prefers network over timing when both signals are present (precedence)', () => {
    const r = categorizeFailure('TimeoutError while fetching: ECONNREFUSED 10.0.0.1:443')
    expect(r.category).toBe('network')
  })

  it('reinforces selector confidence with an agent-detected selector error', () => {
    const withFixture = categorizeFailure(
      'Error: strict mode violation: resolved to 2 elements',
      fixture({ selectorError: "getByRole('button')" })
    )
    expect(withFixture.category).toBe('selector-not-found')
    expect(withFixture.signals).toContain('agent detected broken selector')
  })

  it('provides a human label for each category', () => {
    expect(categoryLabel('timing')).toMatch(/timing/i)
    expect(categoryLabel('selector-not-found')).toMatch(/selector/i)
    expect(categoryLabel('network')).toMatch(/network/i)
    expect(categoryLabel('resource-exhaustion')).toMatch(/resource/i)
    expect(categoryLabel('unknown')).toMatch(/unknown/i)
  })
})
