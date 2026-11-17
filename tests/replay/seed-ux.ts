// @ts-nocheck - a Node script, run with tsx; the mod's type check has no Node types.
/**
 * Fills the decisions store of the repository the script is run from with what the
 * first-time-user testers try the tasks on: three choices (decision 3 has a
 * recommendation, decision 2 has twelve options), six assumptions, a Pantry review
 * (the 47 findings plus 20 more needing the person, with an "Image uploads" group),
 * one parked decision and one answered decision with a discussion, then a "Recipe printing"
 * group: one decision with a reply not yet read, one answered with a condition, one
 * answered with Something else and one with a quick answer from the small model. The first
 * decision has a problem line the small model wrote, and the session has a record for the
 * list's session card and the Session page.
 *
 *   cd "$(mktemp -d)" && git init -q && npx -y tsx <repo>/tests/replay/seed-ux.ts
 */
import { SEEDED, seedUx } from './ux-fixture'
import { store } from '../../hooks/pane/seed-review'

async function main() {
  await seedUx(store)
  console.log(`Seeded ${SEEDED.length} decisions.`)
}

if (process.argv[1]?.endsWith('seed-ux.ts')) {
  main()
}
