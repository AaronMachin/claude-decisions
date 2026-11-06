import { expect, test } from 'claude-code/testing'

import type { Decision } from '../store'
import { REVIEW_47 } from './review-47'
import { movePage, pageSize } from './sections'
import { INITIAL_VIEW } from './decision'
import { ListView, ReviewView, counts, visibleTabs, nextTab, openReview, rowMeta, rowText, secondLine, sectionsFor, statusText, tabsFor, toggleTick, truncate } from './list'

let counter = 0

function make(over: Partial<Decision> = {}): Decision {
  counter += 1

  return {
    version: 1,
    id: `d${counter}`,
    number: counter,
    group: 'Config file plan',
    section: 'needs-you',
    kind: 'choice',
    title: `Decision ${counter}`,
    scenario: 's',
    options: [
      { id: 1, label: 'Project root' },
      { id: 2, label: 'Vitest' },
    ],
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

test('tabs follow first appearance, then Other, then Parked; a parked decision leaves its group', () => {
  counter = 0
  const all = [
    make({ group: 'Sharing links' }),
    make({ group: undefined }),
    make({ group: 'Config file plan' }),
    make({ group: 'Sharing links', state: 'parked', parkedReason: 'later' }),
    make({ group: 'Config file plan', state: 'withdrawn' }),
    make({ group: 'Sharing links' }),
  ]
  const tabs = tabsFor(all)
  expect(tabs.map(t => t.key)).toEqual(['g:Sharing links', 'g:Config file plan', 'other', 'parked'])
  expect(tabs[0]!.decisions.map(d => d.number)).toEqual([1, 6])
  expect(tabs[3]!.decisions.map(d => d.number)).toEqual([4])
  expect(tabs[1]!.decisions).toHaveLength(1)
})

test('sections split needs-you from answered', () => {
  counter = 0
  const tab = { key: 'k', label: 'k', decisions: [make(), make({ state: 'live' }), make({ state: 'ready' }), make({ state: 'sent' })] }
  const s = sectionsFor(tab)
  expect(s.needsYou).toHaveLength(2)
  expect(s.answered.map(d => d.state)).toEqual(['ready', 'sent'])
})

test('the status line counts open and ready, and clears when nothing is left', () => {
  counter = 0
  expect(statusText([])).toBeUndefined()
  expect(statusText([make({ state: 'sent' })])).toBeUndefined()
  expect(statusText([make(), make(), make({ state: 'ready' })])).toBe('Decisions: 2 open · 1 ready')
  expect(statusText([make({ state: 'parked' })])).toBe('Decisions: 0 open · 1 parked')
  expect(counts([make(), make({ state: 'live' })]).open).toBe(2)
})

test('t moves to the next tab and wraps', () => {
  const tabs = [
    { key: 'a', label: 'a', decisions: [] },
    { key: 'b', label: 'b', decisions: [] },
  ]
  expect(nextTab(tabs, 'a')).toBe('b')
  expect(nextTab(tabs, 'b')).toBe('a')
  expect(nextTab(tabs, undefined)).toBe('a')
  expect(nextTab([], 'a')).toBeUndefined()
})

test('rows fit the width, with the state at the right edge on a wide pane', () => {
  counter = 0
  const long = make({ title: 'What happens when a shared recipe link expires after a week' })
  expect(rowText(long, 49).length).toBeLessThanOrEqual(47)
  expect(rowText(long, 49)).toMatch(/…$/)
  const answered = make({ state: 'ready', answer: { option: 2, answeredAt: 't' }, title: 'Which test runner' })
  expect(rowText(answered, 96)).toMatch(/✓ 2 Vitest · ready to send$/)
  expect(rowText(answered, 96).length).toBe(94)
  expect(rowText(answered, 49)).toMatch(/✓ 2 Vitest {2}ready$/)
  expect(truncate('abcdef', 4)).toBe('abc…')
})

test('ticking toggles, and review opens with every ready decision ticked', () => {
  expect(toggleTick(['d1', 'd2'], 'd1')).toEqual(['d2'])
  expect(toggleTick(['d2'], 'd1')).toEqual(['d2', 'd1'])
  const view = openReview({ ...INITIAL_VIEW, notice: 'old' }, ['d1', 'd3'])
  expect(view.screen).toBe('review')
  expect(view.ticked).toEqual(['d1', 'd3'])
  expect(view.notice).toBeUndefined()
})

const PANE = {
  plugin: 'decisions',
  component: 'Pane',
  requestId: 'other',
  props: { title: 'Decisions', isFocused: true, bodyColumns: 49, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

test('the list draws tabs and rows; the first row is on the ring so enter alone opens it', async ($, on) => {
  counter = 0
  const all = [make(), make(), make({ state: 'ready', answer: { option: 2, answeredAt: 't' } }), make({ group: 'Sharing links' })]
  const tabs = tabsFor(all)
  on('ui.render', ($$, e) =>
    ListView($$, { ui: $$.ui.resolve(e), tabs, view: INITIAL_VIEW, width: 49, readyCount: 1, unreadable: 0, onSend: () => {}, onHide: () => {} }),
  )
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const keys = (await ui.findAll({ type: 'Button' })).map(b => b.props.key)
    expect(keys).toEqual(['tab:g:Config file plan', 'tab:g:Sharing links', 'row:d1', 'row:d2', 'row:d3', 't', 's', 'h'])
    expect((await ui.find({ key: 'row:d1' }))?.props.autoFocus).toBe(true)
    expect((await ui.find({ key: 'row:d2' }))?.props.autoFocus).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'Needs you (2)' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Answered (1)' })).toBeDefined()
    await ui.unmount()
  }
})

test('the list has no send key when nothing is ready, and says so when there is nothing at all', async ($, on) => {
  counter = 0
  const tabs = tabsFor([make()])
  let current: ReturnType<typeof tabsFor> = tabs
  on('ui.render', ($$, e) =>
    ListView($$, { ui: $$.ui.resolve(e), tabs: current, view: INITIAL_VIEW, width: 49, readyCount: 0, unreadable: 1, onSend: () => {}, onHide: () => {} }),
  )
  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ key: 's' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /1 decision file couldn't be read/ })).toBeDefined()
  await ui.unmount()
  current = []
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /No decisions yet/ })).toBeDefined()
  await ui.unmount()
})

test('review: ready rows start ticked, Confirm is last with hotkey c, and confirming with nothing ticked sends nothing', async ($, on) => {
  counter = 0
  const ready = [
    make({ state: 'ready', answer: { option: 1, answeredAt: 't' } }),
    make({ state: 'ready', answer: { option: 2, answeredAt: 't' } }),
  ]
  const confirmed: string[][] = []
  let view = openReview(INITIAL_VIEW, ['d1', 'd2'])
  on('ui.render', ($$, e) => ReviewView($$, { ui: $$.ui.resolve(e), ready, view, width: 49, onConfirm: ids => void confirmed.push(ids), onLeave: () => {} }))

  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const buttons = await ui.findAll({ type: 'Button' })
  expect(buttons.map(b => b.props.key)).toEqual(['tick:d1', 'tick:d2', 'b', 'confirm'])
  expect(buttons[3]!.props.hotkey).toBe('c')
  expect(await ui.find({ type: 'Text', text: /Enter ticks or unticks a row, c sends/ })).toBeDefined()
  expect((await ui.find({ key: 'tick:d1' }))?.text).toMatch(/^\[x\] d1/)
  await ui.press({ key: 'confirm', plugin: 'test' })
  expect(confirmed).toEqual([['d1', 'd2']])
  await ui.unmount()

  view = { ...view, ticked: [] }
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ key: 'tick:d1' }))?.text).toMatch(/^\[ \] d1/)
  await ui.press({ key: 'confirm', plugin: 'test' })
  expect(confirmed).toHaveLength(1)
  await ui.unmount()
})

test('tabs that do not fit scroll so the open one is in view, with markers at the cut ends', () => {
  const tab = (n: number) => ({ key: `t${n}`, label: `Group number ${n}`, decisions: [] })
  const tabs = [1, 2, 3, 4, 5, 6].map(tab)
  expect(visibleTabs(tabs.slice(0, 2), 't1', 49)).toEqual({ shown: tabs.slice(0, 2), hasLeft: false, hasRight: false })
  const middle = visibleTabs(tabs, 't3', 49)
  expect(middle.shown.map(t => t.key)).toContain('t3')
  expect(middle.hasLeft).toBe(true)
  expect(middle.hasRight).toBe(true)
  expect(visibleTabs(tabs, 't1', 49).hasLeft).toBe(false)
  expect(visibleTabs(tabs, 't6', 49).hasRight).toBe(false)
})

/** The keys of the Buttons that aren't tabs. */
async function keysOf(ui: any): Promise<string[]> {
  return (await ui.findAll({ type: 'Button' })).map((b: any) => b.props.key).filter((k: string) => !k.startsWith('tab:'))
}

async function drawList($: any, on: any, all: Decision[], view = INITIAL_VIEW, rows = 40, width = 49) {
  const tabs = tabsFor(all)
  on('ui.render', ($$: any, e: any) => ListView($$, { ui: $$.ui.resolve(e), tabs, view, width, rows, readyCount: 0, unreadable: 0, onSend: () => {}, onHide: () => {} }))

  return $.ui.mount({ ...PANE, surface: 'terminal' })
}

function bigReview(): Decision[] {
  counter = 0

  return [
    ...Array.from({ length: 2 }, () => make({ kind: 'finding' })),
    ...Array.from({ length: 9 }, () => make({ kind: 'finding', section: 'claudes-call' })),
    ...Array.from({ length: 3 }, () => make({ kind: 'finding', section: 'already-decided' })),
  ]
}

test('folded sections show a heading with a count and no rows; Needs you stays open', async ($, on) => {
  const ui = await drawList($, on, bigReview())
  const keys = await keysOf(ui)
  expect(keys).toEqual(['row:d1', 'row:d2', 'section:claudes-call', 'section:already-decided', 't', 'h'])
  expect(await ui.find({ type: 'Text', text: 'Needs you (2)' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: "▸ Claude's call (9)" })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '▸ Already decided (3)' })).toBeDefined()
  await ui.unmount()
})

test('Needs you shows with a count of 0, and the first heading takes the ring when nothing waits', async ($, on) => {
  counter = 0
  const ui = await drawList($, on, [make({ section: 'claudes-call' })])
  expect(await ui.find({ type: 'Text', text: 'Needs you (0)' })).toBeDefined()
  expect((await ui.find({ key: 'section:claudes-call' }))?.props.autoFocus).toBe(true)
  await ui.unmount()
})

test('an open section shows one page of rows with n, and o appears on the next page', async ($, on) => {
  const all = bigReview()
  let ui = await drawList($, on, all, { ...INITIAL_VIEW, openSection: 'claudes-call' }, 16)
  let keys = await keysOf(ui)
  expect(keys.filter((k: string) => k.startsWith('row:'))).toEqual(['row:d1', 'row:d2', 'row:d3', 'row:d4', 'row:d5', 'row:d6', 'row:d7'])
  expect(keys).toContain('n')
  expect(keys).not.toContain('o')
  expect(await ui.find({ type: 'Text', text: "▾ Claude's call (9)" })).toBeDefined()
  await ui.unmount()
})

test('the next page has o and, at the end, no n', async ($, on) => {
  const all = bigReview()
  const ui = await drawList($, on, all, { ...INITIAL_VIEW, openSection: 'claudes-call', sectionPage: 1 }, 16)
  const keys = await keysOf(ui)
  expect(keys.filter((k: string) => k.startsWith('row:'))).toEqual(['row:d1', 'row:d2', 'row:d8', 'row:d9', 'row:d10', 'row:d11'])
  expect(keys).toContain('o')
  expect(keys).not.toContain('n')
  await ui.unmount()
})

test('parked and reopened rows carry a dim second line, with the group in the Parked tab', () => {
  counter = 0
  const parked = make({ state: 'parked', parkedReason: 'waiting on the product owner', group: 'Search review' })
  expect(secondLine(parked, true)).toBe('Search review · waiting on the product owner')
  expect(secondLine(parked, false)).toBe('parked: waiting on the product owner')
  const reopened = make({ reopenedBy: { id: 'd3', at: 't' } })
  expect(secondLine(reopened, false)).toBe('reopened because d3 changed')
  expect(secondLine({ ...reopened, state: 'ready' }, false)).toBeUndefined()
  expect(secondLine(make(), false)).toBeUndefined()
})

test('the Parked tab has no Needs you heading and the second line is drawn', async ($, on) => {
  counter = 0
  const ui = await drawList($, on, [make({ state: 'parked', parkedReason: 'later' })], { ...INITIAL_VIEW, tab: 'parked' })
  expect(await ui.find({ type: 'Text', text: /Needs you/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'Parked (1)' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Config file plan · later/ })).toBeDefined()
  await ui.unmount()
})

test('two or more open assumptions add a batch row at the top of Needs you', async ($, on) => {
  counter = 0
  const ui = await drawList($, on, [make({ kind: 'assumption' }), make({ kind: 'assumption' }), make({ kind: 'finding' })])
  const keys = await keysOf(ui)
  expect(keys.slice(0, 2)).toEqual(['batch', 'row:d1'])
  expect((await ui.find({ key: 'batch' }))?.text).toBe('Check 2 assumptions together')
  await ui.unmount()
})

test('one open assumption has no batch row', async ($, on) => {
  counter = 0
  const one = await drawList($, on, [make({ kind: 'assumption' })])
  expect(await one.find({ key: 'batch' })).toBeUndefined()
  await one.unmount()
})

test('a wide row says question, and blocking when the decision blocks work', () => {
  counter = 0
  expect(rowMeta(make({ kind: 'question', options: [] }), 96)).toBe('question · open')
  expect(rowMeta(make({ blocks: 'the plan' }), 96)).toBe('2 options · open · blocking')
  expect(rowMeta(make({ state: 'parked' }), 49)).toBe('')
})

test('with the 47-finding review in a short pane the answered rows give way, so the key row stays in', async ($, on) => {
  const all = REVIEW_47.map((f: any, i: number) => make({ ...(f as object), id: `d${i + 1}`, number: i + 1, group: 'Search review', options: [{ id: 1, label: 'Agree' }] } as Partial<Decision>))
  const answered = all.map((d: Decision, i: number) => (i < 12 && d.section === 'needs-you' ? { ...d, state: 'ready' as const, answer: { option: 1, answeredAt: 't' } } : d))
  const ui = await drawList($, on, answered, { ...INITIAL_VIEW, openSection: 'claudes-call' }, 24)
  const buttons = (await ui.findAll({ type: 'Button' })).map((b: any) => b.props.key as string)
  const rowCount = buttons.filter((k: string) => k.startsWith('row:')).length
  expect(rowCount).toBeLessThanOrEqual(24 - 8)
  expect(buttons).toContain('t')
  expect(buttons).toContain('h')
  await ui.unmount()
})

test('30 findings for the person in a short pane are paged, the key row stays in, and n reaches the last one', async ($, on) => {
  counter = 0
  const thirty = Array.from({ length: 30 }, () => make({ kind: 'finding' }))
  const tabs = tabsFor(thirty)
  let view = INITIAL_VIEW
  on('ui.render', ($$: any, e: any) =>
    ListView($$, { ui: $$.ui.resolve(e), tabs, view, width: 49, rows: 20, readyCount: 0, unreadable: 0, onSend: () => {}, onHide: () => {} }),
  )
  const seen = new Set<string>()
  for (let step = 0; step < 10; step++) {
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    const keys = await keysOf(ui)
    const rows = keys.filter((k: string) => k.startsWith('row:'))
    expect(rows.length).toBeLessThanOrEqual(20 - 9)
    expect(keys).toContain('t')
    expect(keys).toContain('h')
    rows.forEach((k: string) => seen.add(k))
    await ui.unmount()
    if (!keys.includes('n')) {
      break
    }
    view = movePage(view, 1, 30, pageSize(20, 13))
  }
  expect(seen.size).toBe(30)
  expect(seen.has('row:d30')).toBe(true)
})

test('an open folded section leaves a paged Needs you on its first page, with a line saying how to see the rest', async ($, on) => {
  counter = 0
  const all = [...Array.from({ length: 30 }, () => make({ kind: 'finding' })), make({ kind: 'finding', section: 'claudes-call' })]
  const ui = await drawList($, on, all, { ...INITIAL_VIEW, openSection: 'claudes-call' }, 20)
  const keys = await keysOf(ui)
  expect(keys).toContain('t')
  expect(keys).not.toContain('n')
  expect(await ui.find({ type: 'Text', text: /more need you/ })).toBeDefined()
  await ui.unmount()
})
