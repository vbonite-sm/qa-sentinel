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
