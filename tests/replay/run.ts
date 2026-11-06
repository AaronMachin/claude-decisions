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
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { isQuestionsInChat, whyQuestionsInChat } from '../../hooks/integrate'
import { repoKey } from '../../hooks/store'
import { HEADER, countQuestions, formatRow, formatTotals, summarise } from './count'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../..')
const args = process.argv.slice(2)
const option = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const sessionsDir = resolve(option('--sessions') ?? join(here, 'sessions'))
const textDir = option('--text')
const only = option('--only')
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
  const argv = ['-p', prompt, '--plugin-dir', repo, '--model', 'sonnet', '--output-format', 'json', '--max-turns', '12', '--permission-mode', 'dontAsk', '--allowedTools', 'mcp__decisions__*', 'Read', 'Glob', 'Grep', 'Bash(git:*)']
  if (resume) {
    argv.push('--resume', resume)
  }
  const out = execFileSync('claude', argv, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 150000, maxBuffer: 64 * 1024 * 1024 })

  return JSON.parse(out)
}

async function main() {
const rows = []
for (const file of readdirSync(sessionsDir).filter(f => f.endsWith('.json') && (only === undefined || f === `${only}.json`)).sort()) {
  const session = JSON.parse(readFileSync(join(sessionsDir, file), 'utf8'))
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'replay-')))
  execFileSync('sh', [join(repo, 'evals', 'pantry-setup.sh')], { cwd, stdio: 'ignore' })
  const turns = []
  let id
  for (const [index, prompt] of session.prompts.entries()) {
    let result
    try {
      try {
        result = claude(prompt, cwd, id)
      } catch {
        result = claude(prompt, cwd, id)
      }
    } catch (error) {
      console.error(`[${session.name} turn ${index + 1} failed: status ${error.status}, signal ${error.signal}, stdout ${String(error.stdout ?? '').length} chars]`)
      turns.push({ chat: 0, flaggedBy: undefined, failed: true })
      continue
    }
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
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd, encoding: 'utf8' }).trim()
  const folder = join(storeRoot, await repoKey(common))
  const added = storeFolders().includes(await repoKey(common)) ? readdirSync(folder).filter(name => /^d\d+\.json$/.test(name)).length : 0
  rows.push(summarise(session.name, turns, added))
}
console.log(HEADER)
rows.forEach(r => console.log(formatRow(r)))
console.log(formatTotals(rows))
}

main()
