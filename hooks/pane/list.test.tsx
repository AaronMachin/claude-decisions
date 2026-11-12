import { expect, test } from 'claude-code/testing'

import type { PaneView } from '../../types'
import type { Decision } from '../store'
import { REVIEW_47 } from './review-47'
import { movePage, pageSize } from './sections'
import { ago, when } from './seen'
import { HEADER_RIGHT_GAP } from './look'
import { INITIAL_VIEW, ringMark } from './decision'
import { ListView, ReviewView, allClear, counts, rowSecondLine, tabChipText, visibleTabs, nextTab, openReview, rowMeta, rowText, secondLine, sectionsFor, statusText, tabsFor, toggleTick, truncate } from './list'

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
  expect(statusText([make(), make(), make({ state: 'ready' })])).toBe('2 open · 1 not sent')
  expect(statusText([make({ state: 'parked' })])).toBe('nothing needs you · 1 parked')
  expect(statusText([make({ state: 'ready' })])).toBe('nothing needs you · 1 not sent')
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
  expect(rowText(answered, 96)).toMatch(/✓ 2 Vitest · not sent yet$/)
  expect(rowText(answered, 96).length).toBe(94)
  expect(rowText(answered, 49)).toMatch(/✓ 2 Vitest {2}not sent$/)
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
    ListView($$, { ui: $$.ui.resolve(e), tabs, view: { ...INITIAL_VIEW, tab: 'g:Config file plan' }, width: 49, readyCount: 1, unreadable: 0, onSend: () => {}, onHide: () => {} }),
  )
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const keys = (await ui.findAll({ type: 'Button' })).map(b => b.props.key)
    expect(keys).toEqual(['tab:g:Config file plan', 'tab:g:Sharing links', 'row:d1', 'row:d2', 'row:d3', 't', 's', 'h'])
    expect((await ui.find({ key: 'row:d1' }))?.props.autoFocus).toBe(true)
    expect((await ui.find({ key: 'row:d2' }))?.props.autoFocus).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: '◆ Needs you · 2' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '✓ Answered · 1' })).toBeDefined()
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
  expect((await ui.find({ key: 'tick:d1' }))?.text).toMatch(/^ {2}\[x\] d1/)
  await ui.press({ key: 'confirm', plugin: 'test' })
  expect(confirmed).toEqual([['d1', 'd2']])
  await ui.unmount()

  view = { ...view, ticked: [] }
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ key: 'tick:d1' }))?.text).toMatch(/^ {2}\[ \] d1/)
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
  expect(await ui.find({ type: 'Text', text: '◆ Needs you · 2' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: "▸ Claude's call · 9" })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '▸ Already decided · 3' })).toBeDefined()
  await ui.unmount()
})

test('when nothing anywhere needs the person, the list says so instead of "Needs you 0", and the first heading takes the ring', async ($, on) => {
  counter = 0
  const ui = await drawList($, on, [make({ section: 'claudes-call' })])
  expect(await ui.find({ type: 'Text', text: '✓ Nothing needs you' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Needs you · 0/ })).toBeUndefined()
  expect((await ui.find({ key: 'section:claudes-call' }))?.props.autoFocus).toBe(true)
  await ui.unmount()
})

test('an open section shows one page of rows with n, and o appears on the next page', async ($, on) => {
  const all = bigReview()
  let ui = await drawList($, on, all, { ...INITIAL_VIEW, openSection: 'claudes-call' }, 19)
  let keys = await keysOf(ui)
  expect(keys.filter((k: string) => k.startsWith('row:'))).toEqual(['row:d1', 'row:d2', 'row:d3', 'row:d4'])
  expect(keys).toContain('n')
  expect(keys).not.toContain('o')
  expect(await ui.find({ type: 'Text', text: "▾ Claude's call · 9" })).toBeDefined()
  await ui.unmount()
})

test('the next page has o and, at the end, no n', async ($, on) => {
  const all = bigReview()
  const ui = await drawList($, on, all, { ...INITIAL_VIEW, openSection: 'claudes-call', sectionPage: 4 }, 19)
  const keys = await keysOf(ui)
  expect(keys.filter((k: string) => k.startsWith('row:'))).toEqual(['row:d1', 'row:d2', 'row:d11'])
  expect(keys).toContain('o')
  expect(keys).not.toContain('n')
  await ui.unmount()
})

test('parked and reopened rows carry a dim second line, with the group in the Parked tab', () => {
  counter = 0
  const parked = make({ state: 'parked', parkedReason: 'waiting on the product owner', group: 'Search review' })
  expect(secondLine(parked, true)).toBe('Search review · waiting on the product owner')
  expect(secondLine(parked, false)).toBe('parked: waiting on the product owner')
  const dated = { ...parked, parkedAt: '2026-11-06T09:30:00', updatedAt: '2026-11-09T09:30:00' }
  expect(secondLine(dated, true)).toBe('Search review · waiting on the product owner · parked 6 Nov')
  expect(secondLine(dated, false)).toBe('parked: waiting on the product owner · parked 6 Nov')
  const reopened = make({ reopenedBy: { id: 'd3', at: 't' } })
  expect(secondLine(reopened, false)).toBe('reopened because d3 changed')
  expect(secondLine({ ...reopened, state: 'ready' }, false)).toBeUndefined()
  expect(secondLine(make(), false)).toBeUndefined()
})

test('the Parked tab has no Needs you heading and the second line is drawn', async ($, on) => {
  counter = 0
  const ui = await drawList($, on, [make({ state: 'parked', parkedReason: 'later' })], { ...INITIAL_VIEW, tab: 'parked' })
  expect(await ui.find({ type: 'Text', text: /Needs you/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'Parked · 1' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Config file plan · later/ })).toBeDefined()
  await ui.unmount()
})

test('two or more open assumptions add a batch row at the top of Needs you', async ($, on) => {
  counter = 0
  const ui = await drawList($, on, [make({ kind: 'assumption' }), make({ kind: 'assumption' }), make({ kind: 'finding' })])
  const keys = await keysOf(ui)
  expect(keys.slice(0, 2)).toEqual(['batch', 'row:d1'])
  expect((await ui.find({ key: 'batch' }))?.text).toBe('  Check 2 assumptions together (enter)')
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
    ListView($$, { ui: $$.ui.resolve(e), tabs, view, width: 49, rows: 23, readyCount: 0, unreadable: 0, onSend: () => {}, onHide: () => {} }),
  )
  const seen = new Set<string>()
  for (let step = 0; step < 10; step++) {
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    const keys = await keysOf(ui)
    const rows = keys.filter((k: string) => k.startsWith('row:'))
    expect(rows.length).toBeLessThanOrEqual(23 - 12)
    expect(keys).toContain('t')
    expect(keys).toContain('h')
    rows.forEach((k: string) => seen.add(k))
    await ui.unmount()
    if (!keys.includes('n')) {
      break
    }
    view = { ...view, sectionPage: view.sectionPage + 1 }
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

test('ringMark marks only the ringed key, and only while the pane has the keys', () => {
  expect(ringMark('row:d1', 'row:d1', true)).toBe('›')
  expect(ringMark('row:d1', 'row:d1', false)).toBe(' ')
  expect(ringMark('row:d1', 'row:d2', true)).toBe(' ')
  expect(ringMark('row:d1', undefined, true)).toBe(' ')
})

test('a list row drops its meta before cutting the title', () => {
  const ready = make({ title: 'What a recipe card shows when shared', state: 'ready', answer: { option: 1, answeredAt: 't' } })
  const row = rowText(ready, 49)
  expect(row).toContain('What a recipe card shows when shared')
  expect(row).not.toContain('ready')
})

test('a list row keeps its meta when the title fits beside it', () => {
  const short = make({ title: 'Units' })
  expect(rowText(short, 80)).toContain('2 options · open')
})

/** Rows a drawn tree takes on the terminal: a column stacks its children, a row is as tall as its tallest, a border adds two. */
function lineCount(node: any): number {
  if (node === null || node === undefined || node === '' || typeof node === 'boolean') {
    return 0
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return 1
  }
  if (Array.isArray(node)) {
    return node.reduce((n: number, child: any) => n + lineCount(child), 0)
  }
  if (node.type !== 'Box') {
    return 1
  }
  const children: any[] = (node.children ?? []).flat()
  const inner =
    node.props?.flexDirection === 'column'
      ? children.reduce((n: number, child: any) => n + lineCount(child), 0)
      : Math.max(0, ...children.map((child: any) => lineCount(child)))

  return inner + (node.props?.borderStyle ? 2 : 0)
}

async function drawFocused($: any, on: any, all: Decision[], view: PaneView, rows: number, width = 90) {
  const tabs = tabsFor(all)
  on('ui.render', ($$: any, e: any) =>
    ListView($$, { ui: $$.ui.resolve(e), tabs, view, width, rows, isFocused: true, readyCount: 0, unreadable: 0, onSend: () => {}, onHide: () => {} }),
  )

  return $.ui.mount({ ...PANE, surface: 'terminal' })
}

test('tabs are chips, the open one on a claude background', async ($, on) => {
  counter = 0
  const ui = await drawList($, on, [make(), make({ group: 'Sharing links' })], { ...INITIAL_VIEW, tab: 'g:Config file plan' })
  const open = (await ui.find({ key: 'tab:g:Config file plan' }))!
  const other = (await ui.find({ key: 'tab:g:Sharing links' }))!
  expect(JSON.stringify(open)).toContain('"backgroundColor":"claude"')
  expect(JSON.stringify(other)).not.toContain('"backgroundColor":"claude"')
  expect(open.text).toMatch(/^ Config file plan 1 /)
  await ui.unmount()
})

test('section headings are bold with a dim count; folded ones are dim with ▸', async ($, on) => {
  const ui = await drawList($, on, bigReview())
  const heading = (await ui.find({ type: 'Text', text: '◆ Needs you · 2' }))!
  expect(JSON.stringify(heading)).toMatch(/"bold":true.*"Needs you"/)
  expect(JSON.stringify(heading)).toMatch(/"dimColor":true.*" · 2"/)
  expect((await ui.find({ type: 'Text', text: "▸ Claude's call · 9" }))?.props.dimColor).toBe(true)
  await ui.unmount()
})

test('rules sit between the header and tabs, the tabs and sections, and the sections and keys', async ($, on) => {
  counter = 0
  const ui = await drawList($, on, [make()])
  const rules = (await ui.findAll({ type: 'Text' })).filter((t: any) => /^─+$/.test(t.text))
  expect(rules).toHaveLength(3)
  await ui.unmount()
})

test('the ringed row keeps its bar and gets the selection background on a tall pane, with no card', async ($, on) => {
  counter = 0
  const ui = await drawFocused($, on, [make(), make()], { ...INITIAL_VIEW, ring: 'row:d2' }, 30)
  expect((await ui.find({ key: 'box:d2' }))?.props.borderStyle).toBeUndefined()
  expect(JSON.stringify(await ui.find({ key: 'row:d2' }))).toContain('"backgroundColor":"subtle"')
  expect(JSON.stringify(await ui.find({ key: 'row:d1' }))).not.toContain('"backgroundColor"')
  expect((await barOf(ui, 'd2'))?.props.color).toBe('suggestion')
  await ui.unmount()
})

test('the ringed row is tinted with › and no border on a 9-row pane', async ($, on) => {
  counter = 0
  const ui = await drawFocused($, on, [make(), make()], { ...INITIAL_VIEW, ring: 'row:d2' }, 9)
  expect((await ui.find({ key: 'box:d2' }))?.props.borderStyle).toBeUndefined()
  expect((await ui.find({ key: 'row:d2' }))?.text).toMatch(/^› d2/)
  expect(JSON.stringify(await ui.find({ key: 'row:d2' }))).toContain('"backgroundColor":"subtle"')
  await ui.unmount()
})

test('30 findings on a 9-row pane fit, with the key row in', async ($, on) => {
  counter = 0
  const thirty = Array.from({ length: 30 }, () => make({ kind: 'finding' }))
  const ui = await drawFocused($, on, thirty, { ...INITIAL_VIEW, ring: 'row:d1' }, 9)
  // The pane's own header takes one more row above the list.
  expect(lineCount(await ui.drawn())).toBeLessThanOrEqual(8)
  expect(await ui.find({ key: 't' })).toBeDefined()
  expect(await ui.find({ key: 'n' })).toBeDefined()
  await ui.unmount()
})

test('compact Send screen puts its key hints under the heading and pages the ticks with o', async ($, on) => {
  counter = 0
  const ready = Array.from({ length: 9 }, () => make({ state: 'ready', answer: { option: 1, answeredAt: 't' } }))
  let view = openReview({ ...INITIAL_VIEW }, ready.map(d => d.id))
  on('ui.render', ($$, e) => ReviewView($$, { ui: $$.ui.resolve(e), ready, view, width: 90, rows: 9, isFocused: true, onConfirm: () => {}, onLeave: () => {} }))
  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const keys = (await ui.findAll({ type: 'Button' })).map(b => String(b.props.key))
  expect(keys.slice(0, 3)).toEqual(['o', 'b', 'confirm'])
  expect((await ui.find({ key: 'confirm' }))?.props.hotkey).toBe('c')
  expect(keys.filter(k => k.startsWith('tick:'))).toHaveLength(6)
  expect(lineCount(await ui.drawn())).toBeLessThanOrEqual(8)
  await ui.unmount()
  view = { ...view, compactPage: 1 }
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.findAll({ type: 'Button' })).map(b => String(b.props.key)).filter(k => k.startsWith('tick:'))).toEqual(['tick:d7', 'tick:d8', 'tick:d9'])
  await ui.unmount()
})

test('nothing needs you, with answers ready: the line warns they are not sent yet', async ($, on) => {
  counter = 0
  const all = [make({ state: 'ready' })]
  const tabs = tabsFor(all)
  on('ui.render', ($$: any, e: any) => ListView($$, { ui: $$.ui.resolve(e), tabs, view: INITIAL_VIEW, width: 49, rows: 40, readyCount: 1, unreadable: 0, onSend: () => {}, onHide: () => {} }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: '1 answer not sent yet · s sends them' }))?.props.color).toBe('warning')
  await ui.unmount()
})

test('a tab with nothing waiting still shows "Needs you  0" while another tab has something', async ($, on) => {
  counter = 0
  const ui = await drawList($, on, [make({ group: 'A', state: 'sent' }), make({ group: 'B' })], { ...INITIAL_VIEW, tab: 'g:A' } as PaneView)
  expect(await ui.find({ type: 'Text', text: '✓ Nothing needs you' })).toBeUndefined()
  await ui.unmount()
})

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString()

test('an unread row comes first and starts ●, with Claude\'s reply under it on a tall pane', async ($, on) => {
  counter = 0
  const quiet = make({ createdAt: minutesAgo(60) })
  const replied = make({ createdAt: minutesAgo(60), thread: [{ who: 'claude', text: 'Yes, c works on findings.\nSecond line.', at: minutesAgo(2) }] })
  const tabs = tabsFor([quiet, replied], {})
  on('ui.render', ($$: any, e: any) => ListView($$, { ui: $$.ui.resolve(e), tabs, view: INITIAL_VIEW, width: 60, rows: 40, readyCount: 0, unreadable: 0, seen: {}, onSend: () => {}, onHide: () => {} }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const rows = (await ui.findAll({ type: 'Button' })).map(b => b.props.key).filter(k => String(k).startsWith('row:'))
  expect(rows).toEqual(['row:d2', 'row:d1'])
  expect(await ui.find({ type: 'Text', text: '● ' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /claude · 2m ago: Yes, c works on findings\.$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /choice · asked/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Second line/ })).toBeUndefined()
  await ui.unmount()
})

test('once opened after the reply, the row is read: no ● and back in its place', () => {
  counter = 0
  const quiet = make({ createdAt: minutesAgo(60) })
  const replied = make({ createdAt: minutesAgo(60), thread: [{ who: 'claude', text: 'Yes', at: minutesAgo(2) }] })
  const tab = tabsFor([quiet, replied], { d2: minutesAgo(1) })[0]!
  expect(sectionsFor(tab, { d2: minutesAgo(1) }).needsYou.map(d => d.id)).toEqual(['d1', 'd2'])
  expect(tab.hasUnread).toBe(false)
})

test('a compact pane keeps one line per row, with the ●', async ($, on) => {
  counter = 0
  const replied = make({ createdAt: minutesAgo(60), thread: [{ who: 'claude', text: 'Yes', at: minutesAgo(2) }] })
  const tabs = tabsFor([replied], {})
  on('ui.render', ($$: any, e: any) => ListView($$, { ui: $$.ui.resolve(e), tabs, view: INITIAL_VIEW, width: 60, rows: 9, readyCount: 0, unreadable: 0, seen: {}, onSend: () => {}, onHide: () => {} }))
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, scroll: { offset: 0, bodyRows: 9 } }, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '● ' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /claude · / })).toBeUndefined()
  await ui.unmount()
})

test('a tab holding an unread reply ends with ●', () => {
  counter = 0
  const tabs = tabsFor([make({ group: 'A', createdAt: minutesAgo(9) }), make({ group: 'B', createdAt: minutesAgo(9), thread: [{ who: 'fork', text: 'done', at: minutesAgo(1) }] })], {})
  expect(tabs.map(t => tabChipText(t))).toEqual([' A 1 ', ' B 1 ● '])
})

test('a frozen order keeps a row with a new reply where it was, and gives it its ●; thawed, it moves first', () => {
  counter = 0
  const a = make({ createdAt: minutesAgo(60) })
  const b = make({ createdAt: minutesAgo(60), thread: [{ who: 'claude', text: 'new', at: minutesAgo(1) }] })
  const tab = tabsFor([a, b], {})[0]!
  expect(sectionsFor(tab, {}, ['d1', 'd2']).needsYou.map(d => d.id)).toEqual(['d1', 'd2'])
  expect(tab.hasUnread).toBe(true)
  expect(sectionsFor(tab, {}).needsYou.map(d => d.id)).toEqual(['d2', 'd1'])
})

test('ago reads as minutes and hours, then falls back to the clock time', () => {
  const now = new Date('2026-11-12T12:00:00')
  expect(ago(new Date('2026-11-12T11:59:40').toISOString(), now)).toBe('just now')
  expect(ago(new Date('2026-11-12T11:58:00').toISOString(), now)).toBe('2m ago')
  expect(ago(new Date('2026-11-12T09:00:00').toISOString(), now)).toBe('3h ago')
  expect(ago(new Date('2026-11-10T09:05:00').toISOString(), now)).toBe('10 Nov 09:05')
})

test('review for one decision ticks only it and keeps which one, with the ring on send', () => {
  const view = openReview({ ...INITIAL_VIEW, screen: 'decision', decisionId: 'd3' }, ['d1', 'd3'], 'd3')
  expect(view.ticked).toEqual(['d3'])
  expect(view.decisionId).toBe('d3')
  expect(view.ring).toBe('confirm')
  expect(openReview({ ...INITIAL_VIEW, decisionId: 'd3' }, ['d1', 'd3']).decisionId).toBeUndefined()
})

test('the list meta says Something else for a typed answer, and discussed only for the old settled answers', () => {
  const typed = make({ state: 'ready', answer: { text: 'a QR code', answeredAt: 't' } })
  expect(rowMeta(typed, 90)).toMatch(/^✓ Something else/)
  const settled = make({ state: 'ready', answer: { text: 'settled in the discussion, see below', answeredAt: 't' } })
  expect(rowMeta(settled, 90)).toMatch(/^✓ discussed/)
})

const at = (h: number, m: number) => {
  const t = new Date()
  t.setHours(h, m, 0, 0)
  return t.toISOString()
}

const LONG_TITLE = 'Activity API docs: still says the app events are six and appear on the site log'

test('a long title on a tall pane wraps onto a second line', async ($, on) => {
  counter = 0
  const ui = await drawList($, on, [make({ title: LONG_TITLE })], INITIAL_VIEW, 30, 49)
  const all = (await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join(' ')
  expect(all).toContain('appear on the site log')
  expect(all).not.toContain('…')
  await ui.unmount()
})

test('a long title on a compact pane is cut with …', async ($, on) => {
  counter = 0
  const ui = await drawList($, on, [make({ title: LONG_TITLE })], INITIAL_VIEW, 9, 49)
  expect((await ui.find({ key: 'row:d1' }))?.text).toMatch(/…$/)
  await ui.unmount()
})

/** The bar drawn first on a row's line (Texts keep no key in the tree, so it is found through its Box). */
async function barOf(ui: any, id: string): Promise<any> {
  const line = (await ui.find({ key: `line:${id}` })) ?? (await ui.find({ key: `box:${id}` }))
  return line?.children?.flat()[0]
}

test('a row starts with the bar in its colour, the id is bold, and a tall pane adds the dim line', async ($, on) => {
  counter = 0
  const ui = await drawList($, on, [make({ createdAt: minutesAgo(4) }), make({ kind: 'finding' }), make({ state: 'ready', answer: { option: 1, answeredAt: 't' } })], INITIAL_VIEW, 30)
  expect(JSON.stringify(await barOf(ui, 'd1'))).toContain('▌')
  expect((await barOf(ui, 'd1'))?.props.color).toBe('suggestion')
  expect((await barOf(ui, 'd2'))?.props.color).toBe('claude')
  expect((await barOf(ui, 'd3'))?.props.color).toBe('success')
  expect((await ui.findAll({ type: 'Text' })).find((t: any) => t.text === 'd1')?.props.bold).toBe(true)
  expect((await ui.find({ key: 'under:d1' }))?.text).toMatch(/^▌ {2}choice · asked 4m ago$/)
  await ui.unmount()
})

test('a compact row has its bar and no second line', async ($, on) => {
  counter = 0
  const ui = await drawList($, on, [make()], INITIAL_VIEW, 9)
  expect(JSON.stringify(await barOf(ui, 'd1'))).toContain('▌')
  expect(await ui.find({ key: 'under:d1' })).toBeUndefined()
  await ui.unmount()
})

test('the dim line: kind and age, the answer in the person\'s words, the unread reply, or the sent time', () => {
  counter = 0
  const now = new Date()
  const asked = new Date(now.getTime() - 4 * 60_000).toISOString()
  expect(rowSecondLine(make({ createdAt: asked }), {}, now)).toEqual({ text: 'choice · asked 4m ago' })
  const options = [{ id: 1, label: 'Red' }]
  const conditioned = make({ createdAt: asked, options, state: 'ready', answer: { option: 1, condition: 'in stock', answeredAt: 't' } })
  expect(rowSecondLine(conditioned, {}, now).text).toBe('choice · asked 4m ago · 1 Red · only if in stock')
  expect(rowSecondLine(make({ createdAt: asked, kind: 'question', state: 'ready', answer: { text: 'blue', answeredAt: 't' } }), {}, now).text).toBe('question · asked 4m ago · Something else: blue')
  expect(rowSecondLine(make({ options, state: 'sent', sentAt: at(12, 4), answer: { option: 1, answeredAt: 't' } }), {}, now).text).toBe('↗ sent 12:04 · 1 Red')
  const replied = make({ createdAt: asked, thread: [{ who: 'claude', text: 'Yes', at: new Date(now.getTime() - 60_000).toISOString() }] })
  expect(rowSecondLine(replied, {}, now)).toEqual({ text: 'claude · 1m ago: Yes', colour: 'claude' })
})

test('with nothing waiting: the last send, its rows, and where new decisions land', async ($, on) => {
  counter = 0
  const sent = (sentAt: string) => make({ state: 'sent', sentAt, answer: { option: 1, answeredAt: 't' } })
  const all = [sent(at(11, 0)), sent(at(11, 30)), sent(at(12, 4)), sent(at(12, 4))]
  expect(allClear(all).map(d => d.id)).toEqual(['d3', 'd4', 'd2'])
  const ui = await drawList($, on, all, INITIAL_VIEW, 40)
  expect(await ui.find({ type: 'Text', text: '✓ Nothing needs you' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: `Last sent ${when(at(12, 4))} · 2 answers` })).toBeDefined()
  const rows = (await keysOf(ui)).filter((k: string) => k.startsWith('row:'))
  expect(rows.slice(0, 3)).toEqual(['row:d3', 'row:d4', 'row:d2'])
  expect(new Set(rows).size).toBe(rows.length)
  expect((await ui.find({ type: 'Text', text: 'New decisions land here.' }))?.props.dimColor).toBe(true)
  await ui.unmount()
})

test('at 49x9 with long titles the key line is in the tree and the list fits', async ($, on) => {
  counter = 0
  const long = Array.from({ length: 6 }, () => make({ title: 'A title long enough to need two lines at forty-nine columns wide' }))
  const ui = await drawFocused($, on, long, { ...INITIAL_VIEW, ring: 'row:d1' }, 9, 49)
  expect(lineCount(await ui.drawn())).toBeLessThanOrEqual(8)
  expect(await ui.find({ key: 't' })).toBeDefined()
  expect(await ui.find({ key: 'h' })).toBeDefined()
  await ui.unmount()
})

test('a tall list with long titles keeps its key line within the rows', async ($, on) => {
  counter = 0
  const long = Array.from({ length: 12 }, () => make({ title: 'A title long enough to need two lines at forty-nine columns wide' }))
  const ui = await drawFocused($, on, long, { ...INITIAL_VIEW, ring: 'row:d1' }, 20, 49)
  expect(lineCount(await ui.drawn())).toBeLessThanOrEqual(19)
  expect(await ui.find({ key: 't' })).toBeDefined()
  await ui.unmount()
})
