import type { HealSuggestion } from '../types'

interface ParsedIntent {
  testId?: string;
  role?: string;
  text?: string;
  rawTokens: string[];
}

function tokenize(str: string): string[] {
  return str
    .replace(/[-_]/g, ' ')
    .split(/\s+/)
    .map(t => t.toLowerCase())
    .filter(t => t.length > 1)
}

function parseIntent(brokenSelector: string): ParsedIntent {
  const intent: ParsedIntent = { rawTokens: [] }

  const testIdMatch = brokenSelector.match(/getByTestId\(['"](.+?)['"]\)/)
  if (testIdMatch) {
    intent.testId = testIdMatch[1]
    intent.rawTokens.push(...tokenize(testIdMatch[1]))
  }

  const roleMatch = brokenSelector.match(/getByRole\(['"](.+?)['"]\)/)
  if (roleMatch) {
    intent.role = roleMatch[1]
    intent.rawTokens.push(roleMatch[1])
  }

  const textPatterns = [
    /has-text\(['"](.*?)['"]\)/,
    /getByText\(['"](.*?)['"]\)/,
    /getByLabel\(['"](.*?)['"]\)/,
    /getByPlaceholder\(['"](.*?)['"]\)/,
    /name:\s*['"](.*?)['"]/,
  ]
  for (const pat of textPatterns) {
    const m = brokenSelector.match(pat)
    if (m) {
      intent.text = m[1]
      intent.rawTokens.push(...tokenize(m[1]))
    }
  }

  if (intent.rawTokens.length === 0) {
    const quoted = brokenSelector.match(/['"]([^'"]+)['"]/g)
    if (quoted) {
      for (const q of quoted) {
        intent.rawTokens.push(...tokenize(q.replace(/['"]/g, '')))
      }
    }
  }

  intent.rawTokens = [...new Set(intent.rawTokens.map(t => t.toLowerCase()))]
  return intent
}

interface ElementMatch {
  tag: string;
  testId?: string;
  role?: string;
  ariaLabel?: string;
  text?: string;
  placeholder?: string;
  classes?: string;
  id?: string;
  href?: string;
}

function extractElements(dom: string): ElementMatch[] {
  const elements: ElementMatch[] = []
  const tagRegex = /<(\w+)([^>]*)>([^<]*)/g
  let m: RegExpExecArray | null

  while ((m = tagRegex.exec(dom)) !== null) {
    const tag = m[1].toLowerCase()
    const attrs = m[2]
    const innerText = m[3].trim()

    if (['script', 'style', 'meta', 'link', 'head', 'html', 'body'].includes(tag)) continue

    const el: ElementMatch = { tag }

    const testIdM = attrs.match(/data-testid=['"](.*?)['"]/)
    if (testIdM) el.testId = testIdM[1]

    const roleM = attrs.match(/role=['"](.*?)['"]/)
    if (roleM) el.role = roleM[1]

    const ariaM = attrs.match(/aria-label=['"](.*?)['"]/)
    if (ariaM) el.ariaLabel = ariaM[1]

    const placeholderM = attrs.match(/placeholder=['"](.*?)['"]/)
    if (placeholderM) el.placeholder = placeholderM[1]

    const classM = attrs.match(/class=['"](.*?)['"]/)
    if (classM) el.classes = classM[1]

    const idM = attrs.match(/\sid=['"](.*?)['"]/)
    if (idM) el.id = idM[1]

    const hrefM = attrs.match(/href=['"](.*?)['"]/)
    if (hrefM) el.href = hrefM[1]

    if (innerText) el.text = innerText

    elements.push(el)
  }

  return elements
}

function scoreElement(el: ElementMatch, intent: ParsedIntent): number {
  let score = 0

  const elTokens = new Set(
    [el.testId, el.role, el.ariaLabel, el.text, el.placeholder, el.id, el.classes, el.href]
      .filter(Boolean)
      .flatMap(s => tokenize(s!))
  )

  let tokenMatches = 0
  for (const tok of intent.rawTokens) {
    if (elTokens.has(tok)) tokenMatches++
    else {
      for (const etok of elTokens) {
        if (etok.includes(tok) || tok.includes(etok)) {
          tokenMatches += 0.5
          break
        }
      }
    }
  }
  const tokenScore = intent.rawTokens.length > 0
    ? Math.min(tokenMatches / intent.rawTokens.length, 1)
    : 0
  score += tokenScore * 0.5

  if (intent.role) {
    if (el.role === intent.role) score += 0.3
    else if (el.tag === intent.role) score += 0.2
    else if (intent.role === 'button' && el.tag === 'button') score += 0.3
    else if (intent.role === 'link' && el.tag === 'a') score += 0.3
    else if (intent.role === 'textbox' && el.tag === 'input') score += 0.3
  } else {
    if (['button', 'a', 'input', 'select', 'textarea'].includes(el.tag)) {
      score += 0.1
    }
  }

  if (intent.testId && el.testId) {
    if (el.testId === intent.testId) score += 0.2
    else if (el.testId.includes(intent.testId) || intent.testId.includes(el.testId)) {
      score += 0.1
    }
  }

  return Math.min(score, 1)
}

function buildSuggestedSelector(el: ElementMatch): string {
  if (el.testId) return `getByTestId('${el.testId}')`
  if (el.ariaLabel) return `getByLabel('${el.ariaLabel}')`
  if (el.placeholder) return `getByPlaceholder('${el.placeholder}')`
  if (el.role && el.text) return `getByRole('${el.role}', { name: '${el.text}' })`
  if (el.text && el.tag === 'a') return `getByRole('link', { name: '${el.text}' })`
  if (el.text && el.tag === 'button') return `getByRole('button', { name: '${el.text}' })`
  if (el.id) return `locator('#${el.id}')`
  if (el.text) return `getByText('${el.text}')`
  return `locator('${el.tag}')`
}

export function analyzeSelector(
  brokenSelector: string,
  domSnapshot: string
): HealSuggestion | null {
  if (!domSnapshot || domSnapshot.trim() === '') return null

  let intent: ParsedIntent
  try {
    intent = parseIntent(brokenSelector)
  } catch {
    return null
  }

  if (intent.rawTokens.length === 0 && !intent.role && !intent.testId) return null

  const elements = extractElements(domSnapshot)
  if (elements.length === 0) return null

  let bestEl: ElementMatch | null = null
  let bestScore = 0

  for (const el of elements) {
    const s = scoreElement(el, intent)
    if (s > bestScore) {
      bestScore = s
      bestEl = el
    }
  }

  if (bestScore < 0.3 || !bestEl) return null

  return {
    testId: '',
    testTitle: '',
    brokenSelector,
    suggestedSelector: buildSuggestedSelector(bestEl),
    confidence: Math.round(bestScore * 100) / 100,
    detectedAt: new Date().toISOString(),
    status: 'pending',
    filePath: '',
  }
}
