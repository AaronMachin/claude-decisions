// @ts-nocheck - a Node script, run with tsx; the mod's type check has no Node types.
/**
 * Fills the decisions store of the repository the script is run from with what the
 * first-time-user testers try the tasks on: three choices (decision 3 has a
 * recommendation, decision 2 has twelve options), six assumptions, a Pantry review
 * (the 47 findings plus 20 more needing the person, with an "Image uploads" group),
 * one parked decision and one answered decision with a discussion, then a "Recipe printing"
 * group: one decision with a reply not yet read, one answered with a condition and one
 * answered with Something else.
 *
 *   cd "$(mktemp -d)" && git init -q && npx -y tsx <repo>/tests/replay/seed-ux.ts
 */
import { addDecision } from '../../hooks/tool'
import { readOne, write } from '../../hooks/store'
import { INBOX, SEEDED, inboxState } from './ux-fixture'
import { store } from '../../hooks/pane/seed-review'

async function add(input) {
  const answer = await addDecision(store, input)
  if ('deny' in answer) {
    throw new Error(answer.deny)
  }
}

async function main() {
  for (const input of SEEDED) {
    await add(input)
  }
  const total = SEEDED.length - INBOX.length - 2
  const parked = await readOne(store, `d${total + 1}`)
  await write(store, { ...parked, state: 'parked', parkedReason: 'waiting on the product owner' })
  const answered = await readOne(store, `d${total + 2}`)
  const at = new Date().toISOString()
  await write(store, {
    ...answered, state: 'sent', answer: { option: 2, answeredAt: at }, sentAt: at,
    thread: [
      { who: 'person', text: 'Why weekly and not daily?', at },
      { who: 'claude', text: 'Daily doubles the storage and nobody edits recipes that often.', at },
    ],
  })
  // A minute on, so the reply is after the decision was made and counts as unread.
  const later = new Date(Date.now() + 60_000).toISOString()
  for (const [index, entry] of INBOX.entries()) {
    const id = `d${total + 3 + index}`
    await write(store, inboxState(await readOne(store, id), entry, later))
  }
  console.log(`Seeded ${SEEDED.length} decisions.`)
}

if (process.argv[1]?.endsWith('seed-ux.ts')) {
  main()
}
