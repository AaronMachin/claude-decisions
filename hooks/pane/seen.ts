import type { Decision, ThreadEntry } from '../store'

/**
 * When the person last opened each decision, by id. Kept in the mod's own store, so it lasts between sessions,
 * and apart from the decision files, so reading one never moves its `updatedAt` (decision 232).
 */
export type Seen = Record<string, string>

const SEEN_KEY = 'seen'

export async function readSeen($: any): Promise<Seen> {
  try {
    const value = await $.store.get(SEEN_KEY)

    return value !== null && typeof value === 'object' ? (value as Seen) : {}
  } catch {
    return {}
  }
}

/** Records that the person opened (or left) a decision now, or at `at`. */
export async function markSeen($: any, id: string, at: string = new Date().toISOString()): Promise<void> {
  const seen = await readSeen($)
  try {
    await $.store.set(SEEN_KEY, { ...seen, [id]: at })
  } catch {
    // Without a store the dots just stay; nothing else depends on it.
  }
}

const REPLIERS = new Set<ThreadEntry['who']>(['claude', 'fork', 'quick'])

/** Replies from Claude (any mode) after `seenAt`, or after the decision was made when it was never opened. ↻ lines are not replies. */
export function unreadReplies(d: Decision, seenAt: string | undefined): ThreadEntry[] {
  const since = seenAt ?? d.createdAt

  return d.thread.filter(e => REPLIERS.has(e.who) && e.revision === undefined && e.at > since)
}

export function hasUnread(d: Decision, seen: Seen): boolean {
  return unreadReplies(d, seen[d.id]).length > 0
}

/** The decision whose unread reply is the latest, for the line above the prompt. */
export function newestUnread(all: Decision[], seen: Seen): Decision | undefined {
  let best: { d: Decision; at: string } | undefined
  for (const d of all) {
    const last = unreadReplies(d, seen[d.id]).at(-1)
    if (last && (best === undefined || last.at > best.at)) {
      best = { d, at: last.at }
    }
  }

  return best?.d
}

/** "just now", "2m ago", "3h ago", then the clock time ("10 Nov 09:05") from a day on. */
export function ago(at: string, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(at).getTime()) / 60_000)
  if (Number.isNaN(minutes)) {
    return ''
  }
  if (minutes < 1) {
    return 'just now'
  }
  if (minutes < 60) {
    return `${minutes}m ago`
  }
  if (minutes < 24 * 60) {
    return `${Math.floor(minutes / 60)}h ago`
  }

  const t = new Date(at)

  return `${t.getDate()} ${MONTHS[t.getMonth()]} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

let frozen: string[] | undefined

/** While the pane has the keys the list keeps this order (decision 209). Held in memory: a reload just re-sorts. */
export function freezeOrder(ids: string[]): void {
  frozen = ids
}

export function thawOrder(): void {
  frozen = undefined
}

export function frozenOrder(): string[] | undefined {
  return frozen
}

let visit: { id: string; seenAt: string | undefined } | undefined

/**
 * Opening a decision marks it seen at once, so the decision screen keeps the time from before this visit:
 * the reply that brought the person here still counts as new while they read it. Held in memory: a reload counts from the open.
 */
export function noteVisit(id: string, seenAt: string | undefined): void {
  visit = { id, seenAt }
}

/** When the person had last seen this decision before the visit they are on, else the stored time. */
export function visitSeenAt(id: string, seen: Seen): string | undefined {
  return visit?.id === id ? visit.seenAt : seen[id]
}
