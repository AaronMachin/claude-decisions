// @ts-nocheck - a Node script, run with tsx; the mod's type check has no Node types.
/** Prints the decisions folder of the repository it is run from, so `run.sh` can remove what it seeded. */
import { storeDir } from '../../hooks/store'
import { store } from '../../hooks/pane/seed-review'

storeDir(store).then(dir => console.log(dir))
