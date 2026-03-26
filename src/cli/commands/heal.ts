import * as fs from 'fs'
import * as readline from 'readline'
import { readHealSuggestions, markApplied, markDismissed } from '../../agent/heal-store'
import type { HealSuggestion } from '../../types'

function promptYN(rl: readline.Interface, question: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer.trim().toLowerCase()))
  })
}

function applyReplacement(
  suggestion: HealSuggestion
): { success: boolean; reason?: string } {
  const { filePath, brokenSelector, suggestedSelector } = suggestion

  if (!fs.existsSync(filePath)) {
    return { success: false, reason: `File not found: ${filePath}` }
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  if (!content.includes(brokenSelector)) {
    return {
      success: false,
      reason: `Broken selector "${brokenSelector}" not found in ${filePath}`,
    }
  }

  const updated = content.split(brokenSelector).join(suggestedSelector)
  fs.writeFileSync(filePath, updated, 'utf-8')
  return { success: true }
}

export async function runHeal(root = process.cwd()): Promise<void> {
  const suggestions = readHealSuggestions(root).filter(s => s.status === 'pending')

  if (suggestions.length === 0) {
    console.log('qa-sentinel heal: no pending suggestions found in .sentinel/heal-suggestions.json')
    return
  }

  console.log(`qa-sentinel heal: ${suggestions.length} pending suggestion(s)\n`)

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  for (const suggestion of suggestions) {
    const { testTitle, brokenSelector, suggestedSelector, confidence, filePath } = suggestion

    console.log(`Test:     ${testTitle}`)
    console.log(`File:     ${filePath}`)
    console.log(`Broken:   ${brokenSelector}`)
    console.log(`Suggest:  ${suggestedSelector}  (confidence: ${Math.round(confidence * 100)}%)`)

    const answer = await promptYN(rl, 'Apply this suggestion? [y/n] ')

    if (answer === 'y' || answer === 'yes') {
      const result = applyReplacement(suggestion)
      if (result.success) {
        markApplied(suggestion.testId, root)
        console.log('  Applied.\n')
      } else {
        console.warn(`  Warning: ${result.reason}`)
        console.log('  Skipped.\n')
      }
    } else {
      markDismissed(suggestion.testId, root)
      console.log('  Dismissed.\n')
    }
  }

  rl.close()
  console.log('qa-sentinel heal: done')
}
