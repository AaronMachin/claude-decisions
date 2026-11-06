import { expect, test } from 'claude-code/testing'

import type { Decision } from '../store'
import { INITIAL_VIEW } from './decision'
import { counts, sectionsFor, statusText, tabsFor } from './list'
import { assumptionsIn, firstKey, foldAll, foldedRows, movePage, pageOf, pageSize, toggleSection } from './sections'

let counter = 0

function make(over: Partial<Decision> = {}): Decision {
  counter += 1

  return {
    version: 1,
    id: `d${counter}`,
    number: counter,
    group: 'Search review',
    section: 'needs-you',
    kind: 'finding',
    title: `Search ranking: finding ${counter}`,
    scenario: 's',
    options: [{ id: 1, label: 'Agree' }, { id: 2, label: 'Already decided' }],
    sources: [],
    dependsOn: [],
    state: 'open',
    thread: [],
    revisions: [],
    createdAt: 't',
    updatedAt: 't',
    ...over,
  }
}

function review(): Decision[] {
  counter = 0

  return [
    ...Array.from({ length: 3 }, () => make()),
    ...Array.from({ length: 5 }, () => make({ section: 'claudes-call' })),
    ...Array.from({ length: 2 }, () => make({ section: 'already-decided' })),
    make({ section: 'claudes-call', state: 'ready', answer: { option: 1, answeredAt: 't' } }),
    make({ state: 'sent', answer: { option: 1, answeredAt: 't' } }),
  ]
}

test('the groups hold the right decisions, and an answered one leaves its section', () => {
  const tab = tabsFor(review())[0]!
  const g = sectionsFor(tab)
  expect([g.needsYou.length, g.claudesCall.length, g.alreadyDecided.length, g.answered.length]).toEqual([3, 5, 2, 2])
  const after = tabsFor(review().map(d => (d.id === 'd4' ? { ...d, state: 'ready' as const, answer: { option: 1, answeredAt: 't' } } : d)))[0]!
  expect(sectionsFor(after).claudesCall).toHaveLength(4)
  expect(sectionsFor(after).answered).toHaveLength(3)
})

test('the status line and counts count only what needs the person', () => {
  const all = review()
  expect(counts(all)).toEqual({ open: 3, ready: 1, parked: 0 })
  expect(statusText(all)).toBe('Decisions: 3 open · 1 ready')
})

test('a task has its own tab before Parked and is not in its group tab', () => {
  counter = 0
  const all = [make(), make({ kind: 'go-ahead', isTask: true }), make({ state: 'parked', parkedReason: 'later' })]
  expect(tabsFor(all).map(t => t.label)).toEqual(['Search review', 'For you to do', 'Parked'])
  expect(tabsFor(all)[0]!.decisions).toHaveLength(1)
  expect(tabsFor([make()]).map(t => t.label)).toEqual(['Search review'])
})

test('opening one section folds the other, the same one again folds it, and a tab change folds both', () => {
  const opened = toggleSection({ ...INITIAL_VIEW, sectionPage: 2 }, 'claudes-call')
  expect(opened.openSection).toBe('claudes-call')
  expect(opened.sectionPage).toBe(0)
  expect(toggleSection(opened, 'already-decided').openSection).toBe('already-decided')
  expect(toggleSection(opened, 'claudes-call').openSection).toBeUndefined()
  expect(foldAll(opened).openSection).toBeUndefined()
})

test('Needs you is never folded: it is a group, with no fold state, and stays when it is empty', () => {
  counter = 0
  const tab = tabsFor([make({ section: 'claudes-call' })])[0]!
  expect(sectionsFor(tab).needsYou).toEqual([])
  expect(foldedRows(tab, 'claudes-call')).toHaveLength(1)
  expect(foldAll({ ...INITIAL_VIEW, openSection: 'claudes-call' })).not.toHaveProperty('needsYou')
})

test('paging: the size has a floor, pages clamp, and n and o move toward the end and the start', () => {
  expect(pageSize(30, 12)).toBe(18)
  expect(pageSize(10, 12)).toBe(4)
  const rows = Array.from({ length: 10 }, () => make())
  const first = pageOf(rows, 0, 4)
  expect(first.rows).toHaveLength(4)
  expect([first.hasEarlier, first.hasNext, first.remaining]).toEqual([false, true, 6])
  const last = pageOf(rows, 9, 4)
  expect([last.page, last.rows.length, last.hasNext, last.hasEarlier]).toEqual([2, 2, false, true])
  let view = INITIAL_VIEW
  view = movePage(view, 1, 10, 4)
  view = movePage(view, 1, 10, 4)
  view = movePage(view, 1, 10, 4)
  expect(view.sectionPage).toBe(2)
  expect(movePage(movePage(view, -1, 10, 4), -1, 10, 4).sectionPage).toBe(0)
  expect(movePage(INITIAL_VIEW, -1, 10, 4).sectionPage).toBe(0)
})

test('the ring starts on the first waiting decision, then a folded heading, then an answered row', () => {
  counter = 0
  expect(firstKey(tabsFor([make(), make({ section: 'claudes-call' })])[0])).toBe('row:d1')
  counter = 0
  expect(firstKey(tabsFor([make({ section: 'claudes-call' })])[0])).toBe('section:claudes-call')
  counter = 0
  expect(firstKey(tabsFor([make({ state: 'ready', answer: { option: 1, answeredAt: 't' } })])[0])).toBe('row:d1')
  expect(firstKey(undefined)).toBeUndefined()
})

test('assumptions in Needs you are the batch', () => {
  counter = 0
  const all = [make({ kind: 'assumption' }), make({ kind: 'assumption', section: 'claudes-call' }), make({ kind: 'assumption', state: 'ready', answer: { option: 1, answeredAt: 't' } }), make()]
  expect(assumptionsIn(tabsFor(all)[0]!).map(d => d.id)).toEqual(['d1'])
})
