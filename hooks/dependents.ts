import { readAll, write } from './store'
import type { Answer, Decision, StoreCtx } from './store'

export type Reopened = { reopened: string[]; sent: string[] }

/**
 * A decision's answer changed from `previous`. Every `ready` decision that depends
 * on it goes back to `open` in "Needs you" with its answer cleared and `reopenedBy` saying why.
 * Open, live and parked ones are left alone, and so are sent ones (Claude has
 * already acted on them), which are only named. One level deep: a cleared answer
 * decided nothing for its own dependents.
 */
export async function reopenDependents($: StoreCtx, changed: Decision, previous: Answer | undefined): Promise<Reopened> {
  const result: Reopened = { reopened: [], sent: [] }
  const at = new Date().toISOString()
  const { decisions } = await readAll($)

  for (const d of decisions) {
    if (!d.dependsOn.includes(changed.id)) {
      continue
    }
    if (d.state === 'sent') {
      result.sent.push(d.id)
    } else if (d.state === 'ready') {
      const { answer: was, ...rest } = d
      await write($, { ...rest, state: 'open', section: 'needs-you', reopenedBy: { id: changed.id, at, ...(was ? { was } : {}) } })
      result.reopened.push(d.id)
    }
  }

  return result
}

function list(ids: string[]): string {
  return ids.length <= 2 ? ids.join(' and ') : `${ids.slice(0, -1).join(', ')} and ${ids[ids.length - 1]}`
}

/** The notice for the list after an answer changed, or undefined when nothing depended on it. */
export function reopenNotice(changedId: string, r: Reopened): string | undefined {
  const parts = [
    r.reopened.length > 0 ? `Reopened ${list(r.reopened)}.` : '',
    r.sent.length > 0 ? `${list(r.sent)} ${r.sent.length === 1 ? 'was' : 'were'} already sent.` : '',
  ].filter(Boolean)

  return parts.length === 0 ? undefined : `${changedId} changed. ${parts.join(' ')}`
}
