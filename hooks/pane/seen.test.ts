import { expect, test } from 'claude-code/testing'

import type { Decision, ThreadEntry } from '../store'
import { hasUnread, markSeen, newestUnread, readSeen, unreadReplies } from './seen'

function decision(id: string, thread: ThreadEntry[], createdAt = '2026-11-12T09:00:00.000Z'): Decision {
  return {
    version: 1,
    id,
    number: Number(id.slice(1)),
    section: 'needs-you',
    kind: 'choice',
    title: `Decision ${id}`,
    scenario: 's',
    options: [{ id: 1, label: 'A' }],
    sources: [],
    dependsOn: [],
    state: 'open',
    thread,
    revisions: [],
    createdAt,
    updatedAt: createdAt,
    session: 'session-1',
  }
}

const at = (minute: number) => `2026-11-12T10:${String(minute).padStart(2, '0')}:00.000Z`

test('a reply after the last open is unread, one before it is not', () => {
  const d = decision('d1', [
    { who: 'person', text: 'why?', at: at(1) },
    { who: 'claude', text: 'because', at: at(2) },
    { who: 'claude', text: 'and also', at: at(5) },
  ])
  expect(unreadReplies(d, at(3)).map(e => e.text)).toEqual(['and also'])
  expect(hasUnread(d, { d1: at(3) })).toBe(true)
  expect(hasUnread(d, { d1: at(6) })).toBe(false)
})

test('fork and quick replies count; the person and ↻ lines never do', () => {
  const d = decision('d1', [
    { who: 'person', text: 'mine', at: at(4) },
    { who: 'claude', text: '↻ Added option 2', at: at(4), revision: 0 },
    { who: 'fork', text: 'from the fork', at: at(4) },
    { who: 'quick', text: 'quick one', at: at(4) },
  ])
  expect(unreadReplies(d, at(3)).map(e => e.text)).toEqual(['from the fork', 'quick one'])
})

test('a decision never opened counts from when it was made', () => {
  const d = decision('d1', [{ who: 'fork', text: 'answered before you looked', at: at(2) }], at(1))
  expect(hasUnread(d, {})).toBe(true)
  expect(unreadReplies(d, undefined)).toHaveLength(1)
})

test('newestUnread picks the decision with the latest unread reply', () => {
  const d1 = decision('d1', [{ who: 'claude', text: 'early', at: at(2) }])
  const d2 = decision('d2', [{ who: 'claude', text: 'late', at: at(8) }])
  const d3 = decision('d3', [{ who: 'claude', text: 'already read', at: at(9) }])
  expect(newestUnread([d1, d2, d3], { d3: at(10) })?.id).toBe('d2')
  expect(newestUnread([d3], { d3: at(10) })).toBeUndefined()
})

test('markSeen keeps the time in the mod\'s own store, which lasts between sessions, and touches no decision file', async () => {
  const kept = new Map<string, unknown>()
  const writes: string[] = []
  const $ = {
    store: {
      get: async (key: string) => kept.get(key),
      set: async (key: string, value: unknown) => void kept.set(key, JSON.parse(JSON.stringify(value))),
    },
    fs: { write: async (path: string) => void writes.push(path) },
  }
  expect(await readSeen($)).toEqual({})
  await markSeen($, 'd1', at(7))
  await markSeen($, 'd2', at(8))
  expect(await readSeen($)).toEqual({ d1: at(7), d2: at(8) })
  expect([...kept.keys()]).toEqual(['seen'])
  expect(writes).toEqual([])
})
