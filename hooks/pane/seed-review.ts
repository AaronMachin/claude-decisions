// @ts-nocheck - a Node script, run with tsx; the mod's type check has no Node types.
/**
 * Adds the 47-finding fixture to the decisions store of the repository the script
 * is run from, through the tool's own `addDecision`, so each finding is checked the
 * way a real call would be. Run it from a scratch git repository, never a real one:
 *
 *   cd "$(mktemp -d)" && git init -q && npx -y tsx <repo>/hooks/pane/seed-review.ts
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { StoreCtx } from '../store'
import { addDecision } from '../tool'
import { REVIEW_47 } from './review-47'

export const store: StoreCtx = {
  env: { get: async () => process.env.HOME },
  session: { cwd: async () => process.cwd() },
  process: {
    run: async argv => {
      try {
        return { exitCode: 0, stdout: execFileSync(argv[0]!, argv.slice(1), { encoding: 'utf8' }) }
      } catch {
        return { exitCode: 1, stdout: '' }
      }
    },
  },
  fs: {
    read: path => readFile(path, 'utf8'),
    write: async (path, text) => {
      mkdirSync(dirname(path), { recursive: true })
      await writeFile(path, text)
    },
    exists: path => stat(path).then(() => true, () => false),
    list: async dir => (await readdir(dir)).map(name => ({ name })),
  },
}

async function main() {
  for (const finding of REVIEW_47) {
    const answer = await addDecision(store, finding)
    if ('deny' in answer) {
      throw new Error(answer.deny)
    }
  }
  console.log(`Added ${REVIEW_47.length} findings.`)
}

if (process.argv[1]?.endsWith('seed-review.ts')) {
  main()
}
