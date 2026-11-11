import { atom, read, update } from 'claude-code'

import type { Decision, ThreadEntry } from '../store'

/** When the person last opened each decision, by id. Kept apart from the decision files so reading one never moves its `updatedAt` (decision 232). */
export type Seen = Record<string, string>

const seenAtom = atom({ plugin: 'decisions', key: 'seen' } as const, {} as Seen, { shape: 'seen-1' })

export function readSeen($: any): Promise<Seen> {
  return read($, seenAtom)
}

/** Records that the person opened a decision now (or at `at`). */
export function markSeen($: any, id: string, at: string = new Date().toISOString()): Promise<unknown> {
  return update($, seenAtom, (seen: Seen) => ({ ...seen, [id]: at }))
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
