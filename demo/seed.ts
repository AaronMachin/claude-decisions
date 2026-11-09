// @ts-nocheck - a Node script, run with tsx; the mod's type check has no Node types.
/**
 * Fills the decisions store of the repository the script is run from with the demo's
 * decisions (`DEMO`), through the tool's own `addDecision`, then parks one finding.
 * Run by `demo/make-pantry.sh --seed`; run it by hand only from a scratch git repository.
 * The decisions are stamped with the session id in DECISIONS_SESSION (a new one when it is
 * unset, printed), since the pane shows only the session that added them.
 */
import { readOne, write } from '../hooks/store'
import { addDecision } from '../hooks/tool'
import { store } from '../hooks/pane/seed-review'
import { DEMO, PARKED_TITLE } from './seed-data'

async function main() {
  if (!process.env.DECISIONS_SESSION) {
    process.env.DECISIONS_SESSION = crypto.randomUUID()
    console.log(`Session id: ${process.env.DECISIONS_SESSION} (start Claude with --session-id and this id)`)
  }
  for (const [index, input] of DEMO.entries()) {
    const answer = await addDecision(store, input)
    if ('deny' in answer) {
      throw new Error(answer.deny)
    }
    if (input.title === PARKED_TITLE) {
      const id = `d${index + 1}`
      const decision = await readOne(store, id)
      await write(store, { ...decision, state: 'parked', parkedReason: 'waiting on the photo storage choice', parkedAt: new Date().toISOString() })
    }
  }
  console.log(`Seeded ${DEMO.length} decisions.`)
}

if (process.argv[1]?.endsWith('seed.ts')) {
  main()
}
