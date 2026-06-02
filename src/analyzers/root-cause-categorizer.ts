import type { FixtureData } from '../types'

/**
 * Heuristic, LLM-free failure categorization.
 *
 * This is the "heuristic-first root-cause" differentiator: fast, transparent,
 * and free. It maps a raw Playwright/Node error (plus optional agent fixture
 * signals) into one of a small, stable taxonomy of root causes. An LLM can
 * still be layered on top for deep analysis, but the 80% case is covered here
 * without any API call.
 *
 * Categories (checked in precedence order, most-specific first):
 *   resource-exhaustion > network > selector-not-found > assertion > timing
 */

export type RootCauseCategory =
  | 'timing'
  | 'selector-not-found'
  | 'assertion'
  | 'network'
  | 'resource-exhaustion'
  | 'unknown'

export interface RootCauseResult {
  category: RootCauseCategory
  /** 0-1, strength of the match (more/stronger signals => higher). */
  confidence: number
  /** Human-readable phrases that triggered the classification. */
  signals: string[]
}

interface Rule {
  category: Exclude<RootCauseCategory, 'unknown'>
  patterns: RegExp[]
  /** Base confidence for a single matched pattern. */
  base: number
}

// Precedence order matters: the first rule with any match wins.
const RULES: Rule[] = [
  {
    category: 'resource-exhaustion',
    base: 0.9,
    patterns: [
      /javascript heap out of memory/i,
      /\benomem\b/i,
      /\bemfile\b/i,
      /out of memory/i,
      /page crashed/i,
      /target (?:page|frame|browser)?\s*closed/i,
      /maximum call stack/i,
    ],
  },
  {
    category: 'network',
    base: 0.85,
    patterns: [
      /\beconnrefused\b/i,
      /\beconnreset\b/i,
      /\benotfound\b/i,
      /\betimedout\b/i,
      /net::err[_a-z]*/i,
      /fetch failed/i,
      /socket hang up/i,
      /networkerror/i,
      /\b5\d{2}\b\s+(?:internal server error|bad gateway|service unavailable|gateway timeout)/i,
      /request to .+ failed/i,
    ],
  },
  {
    category: 'selector-not-found',
    base: 0.8,
    patterns: [
      /strict mode violation/i,
      /resolved to \d+ elements/i,
      /element(?:\s+is)? not (?:found|attached|visible)/i,
      /no (?:element|node)s? (?:match|found)/i,
      /elementnotfound/i,
      /did not match any elements/i,
      /unable to find (?:an? )?element/i,
      /waiting for (?:locator|selector|element|getby)/i,
    ],
  },
  {
    category: 'assertion',
    base: 0.85,
    patterns: [
      /assertionerror/i,
      /\bexpect\(/i,
      /expected[:\s].+received[:\s]/is,
      /expected (?:value|string|substring|pattern)/i,
      /to(?:be|equal|contain|havetext|havevalue|havecount|bevisible|bchecked)\b/i,
      /assertion failed/i,
    ],
  },
  {
    category: 'timing',
    base: 0.7,
    patterns: [
      /timeouterror/i,
      /timeout\s+\d+\s*ms\s+exceeded/i,
      /exceeded.+timeout/i,
      /timed out/i,
      /waiting for .+ to (?:be|finish|complete|settle)/i,
      /navigation timeout/i,
    ],
  },
]

function matchPatterns(patterns: RegExp[], haystack: string): string[] {
  const signals: string[] = []
  for (const pattern of patterns) {
    const match = pattern.exec(haystack)
    if (match) signals.push(match[0].trim().slice(0, 120))
  }
  return signals
}

/**
 * Categorize a failure from its error text and (optionally) the agent fixture
 * data captured at runtime. Pure and dependency-free.
 */
export function categorizeFailure(
  error?: string,
  fixture?: FixtureData
): RootCauseResult {
  // Fixture-level resource signal: a large heap delta is strong evidence even
  // without a matching error string.
  const heapDeltaMB = fixture?.heapDeltaMB
  if (typeof heapDeltaMB === 'number' && heapDeltaMB >= 512) {
    return {
      category: 'resource-exhaustion',
      confidence: 0.9,
      signals: [`heap grew ${Math.round(heapDeltaMB)}MB during test`],
    }
  }

  const haystack = [error, fixture?.selectorError, ...(fixture?.consoleErrors ?? [])]
    .filter(Boolean)
    .join('\n')
  if (!haystack) {
    return { category: 'unknown', confidence: 0, signals: [] }
  }

  for (const rule of RULES) {
    const signals = matchPatterns(rule.patterns, haystack)
    if (signals.length === 0) continue
    // A selector error surfaced by the agent fixture reinforces confidence.
    if (rule.category === 'selector-not-found' && fixture?.selectorError) {
      signals.push('agent detected broken selector')
    }
    const confidence = Math.min(0.99, rule.base + 0.05 * (signals.length - 1))
    return { category: rule.category, confidence: Number(confidence.toFixed(2)), signals }
  }

  return { category: 'unknown', confidence: 0.1, signals: [] }
}

/** Short human label for a category (for terminal/report display). */
export function categoryLabel(category: RootCauseCategory): string {
  switch (category) {
    case 'timing':
      return 'Timing / timeout'
    case 'selector-not-found':
      return 'Selector not found'
    case 'assertion':
      return 'Assertion failure'
    case 'network':
      return 'Network error'
    case 'resource-exhaustion':
      return 'Resource exhaustion'
    default:
      return 'Unknown'
  }
}
