// @ts-nocheck - a Node script, run with tsx; the mod's type check has no Node types.
/**
 * Replays sessions (each a JSON file of the person's prompts) against the mod, headless,
 * and prints one line of counts per session. It never prints prompt or reply text, so
 * the output is safe to log for private sessions. Run from anywhere:
 *
 *   npx -y tsx <repo>/tests/replay/run.ts [--sessions <folder>] [--text <folder>] [--flagged]
 *
 * `--text` writes each reply to a file in that folder and `--flagged` prints the
 * sentences the detector flagged: use both on made-up sessions only.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { isQuestionsInChat, whyQuestionsInChat } from '../../hooks/integrate'
import { HEADER, countQuestions, formatRow, formatTotals, summarise } from './count'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../..')
const args = process.argv.slice(2)
const option = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const sessionsDir = resolve(option('--sessions') ?? join(here, 'sessions'))
const textDir = option('--text')
const showFlagged = args.includes('--flagged')
const storeRoot = join(homedir(), '.claude', 'decisions')

function storeFolders() {
  try {
    return readdirSync(storeRoot)
  } catch {
    return []
  }
}

function claude(prompt, cwd, resume) {
  const argv = ['-p', prompt, '--plugin-dir', repo, '--model', 'sonnet', '--output-format', 'json', '--allowedTools', 'mcp__decisions__*']
  if (resume) {
    argv.push('--resume', resume)
  }
  const out = execFileSync('claude', argv, { cwd, encoding: 'utf8', timeout: 300000, maxBuffer: 64 * 1024 * 1024 })

  return JSON.parse(out)
}

const rows = []
for (const file of readdirSync(sessionsDir).filter(f => f.endsWith('.json')).sort()) {
  const session = JSON.parse(readFileSync(join(sessionsDir, file), 'utf8'))
  const cwd = mkdtempSync(join(tmpdir(), 'replay-'))
  execFileSync('sh', [join(repo, 'evals', 'pantry-setup.sh')], { cwd, stdio: 'ignore' })
  const before = new Set(storeFolders())
  const turns = []
  let id
  for (const [index, prompt] of session.prompts.entries()) {
    const result = claude(prompt, cwd, id)
    id = result.session_id
    const text = String(result.result ?? '')
    turns.push({ chat: countQuestions(text), flaggedBy: whyQuestionsInChat(text) })
    if (textDir) {
      mkdirSync(textDir, { recursive: true })
      writeFileSync(join(textDir, `${session.name}-${index + 1}.txt`), text)
    }
    if (showFlagged && isQuestionsInChat(text)) {
      console.error(`[${session.name} turn ${index + 1}, rule ${whyQuestionsInChat(text)}] ${text.split(/(?<=[.!?])\s+/).filter(s => s.includes('?')).join(' / ')}`)
    }
  }
  const added = storeFolders()
    .filter(f => !before.has(f))
    .reduce((n, f) => n + readdirSync(join(storeRoot, f)).filter(name => /^d\d+\.json$/.test(name)).length, 0)
  rows.push(summarise(session.name, turns, added))
}
console.log(HEADER)
rows.forEach(r => console.log(formatRow(r)))
console.log(formatTotals(rows))
