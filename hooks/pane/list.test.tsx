import { expect, test } from 'claude-code/testing'

import type { Decision } from '../store'
import { INITIAL_VIEW } from './decision'
import { ListView, ReviewView, counts, nextTab, openReview, rowText, sectionsFor, statusText, tabsFor, toggleTick, truncate } from './list'

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
  expect(tabs[0].decisions.map(d => d.number)).toEqual([1, 6])
  expect(tabs[3].decisions.map(d => d.number)).toEqual([4])
  expect(tabs[1].decisions).toHaveLength(1)
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
  on('ui.render', ($$, e) => ReviewView($$, { ui: $$.ui.resolve(e), ready, view, width: 49, onConfirm: ids => void confirmed.push(ids) }))

  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const buttons = await ui.findAll({ type: 'Button' })
  expect(buttons.map(b => b.props.key)).toEqual(['tick:d1', 'tick:d2', 'b', 'confirm'])
  expect(buttons[3].props.hotkey).toBe('c')
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
