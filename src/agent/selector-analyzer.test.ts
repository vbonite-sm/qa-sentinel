import { describe, it, expect } from 'vitest'
import { analyzeSelector } from './selector-analyzer'

const DOM_SIMPLE = `
<html><body>
  <button data-testid="submit-btn" role="button">Submit Order</button>
  <input data-testid="email-input" placeholder="Email address" />
  <a href="/login" role="link">Sign In</a>
</body></html>
`

const DOM_COMPLEX = `
<html><body>
  <div class="modal">
    <h2>Confirm Payment</h2>
    <button data-testid="confirm-payment-button" aria-label="Confirm payment">Confirm</button>
    <button data-testid="cancel-btn">Cancel</button>
  </div>
</body></html>
`

describe('analyzeSelector', () => {
  it('returns null when domSnapshot is empty string', () => {
    const result = analyzeSelector("locator('button#submit')", '')
    expect(result).toBeNull()
  })

  it('returns null when confidence is below 0.3 threshold', () => {
    const result = analyzeSelector("locator('#xyz-nonexistent-id-abc')", DOM_SIMPLE)
    expect(result).toBeNull()
  })

  it('detects a getByTestId broken selector and suggests the matching element', () => {
    const result = analyzeSelector("getByTestId('submit')", DOM_SIMPLE)
    expect(result).not.toBeNull()
    expect(result!.suggestedSelector).toContain('submit-btn')
    expect(result!.confidence).toBeGreaterThanOrEqual(0.3)
    expect(result!.status).toBe('pending')
  })

  it('detects a getByRole broken selector and suggests by role + text', () => {
    const result = analyzeSelector("getByRole('button', { name: 'Submit' })", DOM_SIMPLE)
    expect(result).not.toBeNull()
    expect(result!.suggestedSelector).toMatch(/submit/i)
    expect(result!.confidence).toBeGreaterThanOrEqual(0.3)
  })

  it('detects a locator broken selector with text and suggests best match', () => {
    const result = analyzeSelector("locator('button:has-text(\"Confirm\")')", DOM_COMPLEX)
    expect(result).not.toBeNull()
    expect(result!.suggestedSelector).toMatch(/confirm/i)
  })

  it('populates all required HealSuggestion fields', () => {
    const result = analyzeSelector("getByTestId('submit')", DOM_SIMPLE)
    expect(result).not.toBeNull()
    expect(typeof result!.brokenSelector).toBe('string')
    expect(typeof result!.suggestedSelector).toBe('string')
    expect(typeof result!.confidence).toBe('number')
    expect(result!.confidence).toBeGreaterThan(0)
    expect(result!.confidence).toBeLessThanOrEqual(1)
    expect(result!.detectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(result!.status).toBe('pending')
    expect(result!.testId).toBe('')
    expect(result!.testTitle).toBe('')
    expect(result!.filePath).toBe('')
  })

  it('extracts text tokens from locator string to improve scoring', () => {
    const result = analyzeSelector("locator('a:has-text(\"Sign In\")')", DOM_SIMPLE)
    expect(result).not.toBeNull()
    expect(result!.suggestedSelector).toMatch(/sign.?in|login/i)
  })

  it('handles malformed selector string without throwing', () => {
    expect(() => analyzeSelector('!!!invalid{[selector', DOM_SIMPLE)).not.toThrow()
  })
})
