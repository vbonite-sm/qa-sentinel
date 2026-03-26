import * as fs from 'fs'
import * as path from 'path'
import type { HealSuggestion } from '../types'

export function getHealStorePath(root = process.cwd()): string {
  return path.join(root, '.sentinel', 'heal-suggestions.json')
}

export function readHealSuggestions(root = process.cwd()): HealSuggestion[] {
  const storePath = getHealStorePath(root)
  if (!fs.existsSync(storePath)) return []
  try {
    const raw = fs.readFileSync(storePath, 'utf-8')
    return JSON.parse(raw) as HealSuggestion[]
  } catch {
    return []
  }
}

function writeHealSuggestions(suggestions: HealSuggestion[], root = process.cwd()): void {
  const storePath = getHealStorePath(root)
  fs.mkdirSync(path.dirname(storePath), { recursive: true })
  fs.writeFileSync(storePath, JSON.stringify(suggestions, null, 2))
}

export function appendHealSuggestion(suggestion: HealSuggestion, root = process.cwd()): void {
  const existing = readHealSuggestions(root)
  const isDuplicate = existing.some(
    s => s.testId === suggestion.testId && s.brokenSelector === suggestion.brokenSelector
  )
  if (isDuplicate) return
  existing.push(suggestion)
  writeHealSuggestions(existing, root)
}

export function markApplied(testId: string, root = process.cwd()): void {
  const suggestions = readHealSuggestions(root)
  const idx = suggestions.findIndex(s => s.testId === testId)
  if (idx === -1) return
  suggestions[idx].status = 'applied'
  suggestions[idx].appliedAt = new Date().toISOString()
  writeHealSuggestions(suggestions, root)
}

export function markDismissed(testId: string, root = process.cwd()): void {
  const suggestions = readHealSuggestions(root)
  const idx = suggestions.findIndex(s => s.testId === testId)
  if (idx === -1) return
  suggestions[idx].status = 'dismissed'
  writeHealSuggestions(suggestions, root)
}
