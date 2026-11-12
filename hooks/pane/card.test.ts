import { expect, test } from 'claude-code/testing'

import type { SessionRecord } from '../session'
import { cardLines } from './card'

function record(over: Partial<SessionRecord> = {}): SessionRecord {
  return {
    version: 1,
    session: 's1',
    title: 'Pantry importer',
    plan: [],
    links: [],
    updatedAt: '2026-11-12T10:00:00.000Z',
    updatedBy: 'claude',
    ...over,
  }
}

const PLAN: SessionRecord['plan'] = [
  { text: 'Inbox', status: 'done' },
  { text: 'The look', status: 'done' },
  { text: 'Small model', status: 'done' },
  { text: 'After install', status: 'active', steps: [
    { text: 'Switch the setting', status: 'done' },
    { text: 'Left and right arrows', status: 'todo', waitsOn: ['d52'] },
  ] },
  { text: 'CI fix', status: 'todo' },
]

test('the card shows the summary, now, plan progress and links, in that order', () => {
  const lines = cardLines(record({
    summary: 'Built the importer.',
    now: { text: 'Marking answers' },
    plan: PLAN,
    links: [
      { url: 'https://github.com/o/r/pull/1', label: '#1 Workstream 8', kind: 'pr', state: 'merged', addedBy: 'claude' },
      { url: 'https://github.com/o/r/pull/2', label: '#2 Workstreams 9 and 10', kind: 'pr', state: 'open', addedBy: 'mod' },
      { url: 'https://claude.ai/x', label: 'Looks', kind: 'artifact', addedBy: 'mod' },
      { url: 'https://claude.ai/y', label: 'Ideas', kind: 'artifact', addedBy: 'mod' },
    ],
  }), 80)
  expect(lines.map(l => l.text)).toEqual([
    '  Built the importer.',
    '  ▶ now: Marking answers',
    '  Plan 3 of 5 done · next: Left and right arrows (waits on d52)',
    '  #1 merged · #2 open · 2 pages',
  ])
  expect(lines[0]?.dim).toBe(true)
})

test('a long summary and now line wrap in full rather than being cut', () => {
  const summary = 'one two three four five six seven eight nine ten eleven twelve'
  const lines = cardLines(record({ summary, now: { text: summary } }), 24)
  expect(lines.every(l => l.text.length <= 24)).toBe(true)
  expect(lines.every(l => !l.text.includes('…'))).toBe(true)
  const words = lines.map(l => l.text.trim()).join(' ')
  expect(words).toContain('eleven twelve')
  expect(lines.filter(l => l.text.includes('▶ now:')).length).toBe(1)
})

test('next is the first unfinished step of the active item, else the active item, else the first to do', () => {
  expect(cardLines(record({ plan: [{ text: 'A', status: 'done' }, { text: 'B', status: 'active' }, { text: 'C', status: 'todo' }] }), 80)[0]?.text)
    .toBe('  Plan 1 of 3 done · next: B')
  expect(cardLines(record({ plan: [{ text: 'A', status: 'done' }, { text: 'C', status: 'todo' }] }), 80)[0]?.text)
    .toBe('  Plan 1 of 2 done · next: C')
  expect(cardLines(record({ plan: [{ text: 'A', status: 'done' }] }), 80)[0]?.text).toBe('  Plan 1 of 1 done')
})

test('no summary, plan or links: the card adds nothing', () => {
  expect(cardLines(record(), 80)).toEqual([])
})

test('a PR whose label has no number takes it from the URL, one page is singular, plain links count', () => {
  const lines = cardLines(record({ links: [
    { url: 'https://github.com/o/r/pull/9', label: 'Fix', kind: 'pr', addedBy: 'claude' },
    { url: 'https://claude.ai/x', label: 'Looks', kind: 'artifact', addedBy: 'mod' },
    { url: 'https://example.com', label: 'Docs', kind: 'link', addedBy: 'claude' },
  ] }), 80)
  expect(lines.map(l => l.text)).toEqual(['  #9 · 1 page · 1 link'])
})

test('compact keeps only the now line', () => {
  const lines = cardLines(record({ summary: 'S', now: { text: 'N' }, plan: PLAN }), 80, true)
  expect(lines.map(l => l.text)).toEqual(['  ▶ now: N'])
})
