import { expect, test } from 'claude-code/testing'

import type { Decision } from '../store'
import { INITIAL_VIEW } from './decision'
import { readAll } from '../store'
import { addDecision } from '../tool'
import { REVIEW_47 as fixture } from './review-47'
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
  expect(statusText(all)).toBe('3 open · 1 ready')
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

test('the 47-finding fixture passes the tool and seeds as 12 needing the person, 24 and 11 folded', async () => {
  const files = new Map<string, string>()
  const store = {
    env: { get: async () => '/home/test' },
    session: { cwd: async () => '/work/pantry' },
    process: { run: async () => ({ exitCode: 0, stdout: '/work/pantry/.git\n' }) },
    fs: {
      read: async (p: string) => {
        if (!files.has(p)) {
          throw new Error('ENOENT')
        }
        return files.get(p)!
      },
      write: async (p: string, t: string) => void files.set(p, t),
      exists: async (p: string) => files.has(p),
      list: async (dir: string) => {
        const found = [...files.keys()].filter(p => p.startsWith(dir + '/')).map(p => ({ name: p.slice(dir.length + 1) }))
        if (found.length === 0) {
          throw new Error('ENOENT')
        }
        return found
      },
    },
  }
  expect(fixture).toHaveLength(47)
  for (const finding of fixture) {
    expect(await addDecision(store, finding)).toHaveProperty('result')
  }
  const { decisions } = await readAll(store)
  expect(decisions).toHaveLength(47)
  expect(decisions.every(d => /^[A-Z][A-Za-z ]+: /.test(d.title))).toBe(true)
  const tabs = tabsFor(decisions)
  expect(tabs.map(t => t.label)).toEqual(['Search review', 'Image uploads'])
  const total = (pick: (g: ReturnType<typeof sectionsFor>) => Decision[]) => tabs.reduce((n, t) => n + pick(sectionsFor(t)).length, 0)
  expect([total(g => g.needsYou), total(g => g.claudesCall), total(g => g.alreadyDecided)]).toEqual([12, 24, 11])
  // answering six of those needing the person leaves 6 / 24 / 11 / 6
  const answered = decisions.filter(d => d.section === 'needs-you').slice(0, 6).map(d => ({ ...d, state: 'ready' as const, answer: { option: 1, answeredAt: 't' } }))
  const after = decisions.map(d => answered.find(a => a.id === d.id) ?? d)
  const t2 = tabsFor(after)
  const total2 = (pick: (g: ReturnType<typeof sectionsFor>) => Decision[]) => t2.reduce((n, t) => n + pick(sectionsFor(t)).length, 0)
  expect([total2(g => g.needsYou), total2(g => g.claudesCall), total2(g => g.alreadyDecided), total2(g => g.answered)]).toEqual([6, 24, 11, 6])
})

test('a stale page number after the section shrinks is clamped before n or o moves it', () => {
  expect(movePage({ ...INITIAL_VIEW, sectionPage: 5 }, -1, 10, 4).sectionPage).toBe(1)
  expect(movePage({ ...INITIAL_VIEW, sectionPage: 5 }, 1, 10, 4).sectionPage).toBe(2)
})
