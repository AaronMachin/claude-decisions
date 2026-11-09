import { expect, test } from 'claude-code/testing'

import { readAll, readOne, write } from '../store'
import type { Decision, StoreCtx } from '../store'
import { addDecision } from '../tool'
import { INITIAL_VIEW } from './decision'
import { BatchView, FIXED_OPTIONS, batchPage, batchRowText, batchRows, confirmMarks, fixedOptionsFor, liveMarks, markRest, markRow, nextUnanswered } from './kinds'

function fakeStore(): StoreCtx {
  const files = new Map<string, string>()

  return {
    env: { get: async () => '/home/test' },
    session: { cwd: async () => '/work/pantry', id: async () => 'session-1' },
    process: { run: async () => ({ exitCode: 0, stdout: '/work/pantry/.git\n' }) },
    fs: {
      read: async (path: string) => {
        const text = files.get(path)
        if (text === undefined) {
          throw new Error('ENOENT')
        }
        return text
      },
      write: async (path: string, text: string) => void files.set(path, text),
      exists: async (path: string) => files.has(path),
      list: async (dir: string) => {
        const found = [...files.keys()].filter(p => p.startsWith(dir + '/')).map(p => ({ name: p.slice(dir.length + 1) }))
        if (found.length === 0) {
          throw new Error('ENOENT')
        }
        return found
      },
    },
  }
}

const TITLES = [
  'Settings are YAML',
  'Tests run on Node 20',
  'Run only from the project root',
  'Windows paths are out of scope',
  'No setting needs a restart',
  'Config is read once at start',
]

async function seedAssumptions(store: StoreCtx): Promise<Decision[]> {
  for (const title of TITLES) {
    await addDecision(store, { group: 'Config file plan', kind: 'assumption', title, scenario: 's', recommendation: { option: 1, reason: 'r' } })
  }

  return (await readAll(store)).decisions
}

test('the fixed options are right and in the order the keys say', () => {
  expect(fixedOptionsFor('finding', false)!.map(o => o.label)).toEqual(['Agree', 'Already decided', 'Disagree', 'Not sure'])
  expect(fixedOptionsFor('go-ahead', true)).toBe(FIXED_OPTIONS.task)
  expect(fixedOptionsFor('choice', false)).toBeUndefined()
  expect(fixedOptionsFor('question', false)).toBeUndefined()
})

test('1 and 2 mark the ringed row and save nothing; an answered row or an unknown row is skipped', async () => {
  const rows = await seedAssumptions(fakeStore())
  const answered = { ...rows[0]!, state: 'ready' as const, answer: { option: 1, answeredAt: 't' } }
  const all = [answered, ...rows.slice(1)]
  expect(markRow({}, all, 'd4', 2)).toEqual({ d4: 2 })
  expect(markRow({ d4: 2 }, all, 'd4', 1)).toEqual({ d4: 1 })
  expect(markRow({}, all, 'd1', 2)).toEqual({})
  expect(markRow({}, all, undefined, 2)).toEqual({})
  expect(markRow({}, all, 'd99', 2)).toEqual({})
})

test('r marks only unanswered, unmarked rows, and a wrong mark survives it', async () => {
  const rows = await seedAssumptions(fakeStore())
  const all = [{ ...rows[0]!, state: 'ready' as const, answer: { option: 2, answeredAt: 't' } }, ...rows.slice(1)]
  const marked = markRest({ d4: 2 }, all)
  expect(marked).toEqual({ d4: 2, d2: 1, d3: 1, d5: 1, d6: 1 })
  expect(marked.d1).toBeUndefined()
  expect(Object.keys(liveMarks({ ...marked, d1: 1 }, all)).sort()).toEqual(['d2', 'd3', 'd4', 'd5', 'd6'])
})

test('Confirm saves every mark as an ordinary answer and says how many were right and wrong', async () => {
  const store = fakeStore()
  const rows = await seedAssumptions(store)
  const marks = markRest({ d4: 2 }, rows)
  const result = await confirmMarks(store, rows, marks)
  expect(result).toMatchObject({ right: 5, wrong: 1, notice: 'Answered 6 assumptions: 5 right, 1 wrong.' })
  const after = (await readAll(store)).decisions
  expect(after.every(d => d.state === 'ready')).toBe(true)
  expect(after.find(d => d.id === 'd4')!.answer?.option).toBe(2)
  expect(after.find(d => d.id === 'd1')!.answer?.option).toBe(1)
})

test('confirming leaves unmarked rows open, and reopens a dependent of a changed answer', async () => {
  const store = fakeStore()
  const rows = await seedAssumptions(store)
  await write(store, { ...rows[0]!, state: 'ready', answer: { option: 1, answeredAt: 't' } })
  await write(store, { ...rows[1]!, dependsOn: ['d1'], state: 'ready', answer: { option: 1, answeredAt: 't' } })
  const fresh = (await readAll(store)).decisions
  const result = await confirmMarks(store, fresh.filter(d => d.id === 'd1' || d.id === 'd3'), { d3: 1 })
  expect(result.notice).toBe('Answered 1 assumption: 1 right, 0 wrong.')
  expect((await readOne(store, 'd3'))!.state).toBe('ready')
  expect((await readOne(store, 'd4'))!.state).toBe('open')
  expect((await readOne(store, 'd2'))!.state).toBe('ready')
})

test('the ring moves to the next unanswered row, wrapping, and stops when none is left', async () => {
  const rows = await seedAssumptions(fakeStore())
  expect(nextUnanswered(rows, 'd2')?.id).toBe('d3')
  expect(nextUnanswered(rows, 'd6')?.id).toBe('d1')
  expect(nextUnanswered(rows, undefined)?.id).toBe('d1')
  expect(nextUnanswered([rows[0]!], 'd1')).toBeUndefined()
  expect(nextUnanswered([{ ...rows[0]!, state: 'ready' }], 'd1')).toBeUndefined()
})

test('a batch row keeps its mark at the edge of 49 columns, and an answered row shows its answer', async () => {
  const rows = await seedAssumptions(fakeStore())
  const long = { ...rows[2]!, title: 'Windows paths are out of scope for the very first release of this' }
  expect(batchRowText(long, 2, 49).length).toBeLessThanOrEqual(47)
  expect(batchRowText(long, 2, 49)).toMatch(/…\s+wrong\?$/)
  expect(batchRowText(rows[0]!, 1, 49)).toMatch(/right\?$/)
  expect(batchRowText(rows[0]!, undefined, 49)).toBe('d1  Settings are YAML')
  expect(batchRowText({ ...rows[0]!, state: 'ready', answer: { option: 2, answeredAt: 't' } }, undefined, 49)).toMatch(/✓ wrong$/)
})

test('the batch lists the open assumptions that need the person and the ready ones', async () => {
  const rows = await seedAssumptions(fakeStore())
  const mixed = [
    ...rows.slice(0, 2),
    { ...rows[2]!, section: 'claudes-call' as const },
    { ...rows[3]!, state: 'ready' as const },
    { ...rows[4]!, state: 'parked' as const },
    { ...rows[5]!, kind: 'finding' as const },
  ]
  expect(batchRows(mixed).map(d => d.id)).toEqual(['d1', 'd2', 'd4'])
})

const PANE = {
  plugin: 'decisions',
  component: 'Pane',
  requestId: 'other',
  props: { title: 'Decisions', isFocused: true, bodyColumns: 49, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

test('the batch screen draws every row, the digit keys, r and b, and Confirm only with marks', async ($, on) => {
  const rows = await seedAssumptions(fakeStore())
  let view = INITIAL_VIEW
  on('ui.render', ($$, e) => BatchView($$, { ui: $$.ui.resolve(e), rows, view, width: 49, onChanged: () => {}, onLeave: () => {} }))
  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  let keys = (await ui.findAll({ type: 'Button' })).map(b => b.props.key)
  expect(keys).toEqual(['batch:d1', 'batch:d2', 'batch:d3', 'batch:d4', 'batch:d5', 'batch:d6', '1', '2', 'r', 'b'])
  expect((await ui.find({ key: 'batch:d1' }))?.props.autoFocus).toBe(true)
  await ui.unmount()
  view = { ...INITIAL_VIEW, marks: { d4: 2, d2: 1 } }
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  keys = (await ui.findAll({ type: 'Button' })).map(b => b.props.key)
  expect(keys).toContain('confirm')
  expect((await ui.find({ key: 'confirm' }))?.text).toBe('Confirm 2')
  expect((await ui.find({ key: 'batch:d4' }))?.text).toMatch(/wrong\?$/)
  await ui.unmount()
})

test('compact batch screen puts 1, 2, r and b under its heading and pages the rows with o', async ($, on) => {
  const store = fakeStore()
  await seedAssumptions(store)
  const all = await seedAssumptions(store)
  expect(all).toHaveLength(12)
  let view = INITIAL_VIEW
  on('ui.render', ($$, e) => BatchView($$, { ui: $$.ui.resolve(e), rows: all, view, width: 90, paneRows: 9, isFocused: true, onChanged: () => {}, onLeave: () => {} }))
  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const keys = (await ui.findAll({ type: 'Button' })).map(b => String(b.props.key))
  expect(keys.slice(0, 5)).toEqual(['1', '2', 'r', 'o', 'b'])
  expect(keys.filter(k => k.startsWith('batch:'))).toEqual(['batch:d1', 'batch:d2', 'batch:d3', 'batch:d4'])
  await ui.unmount()
  view = { ...INITIAL_VIEW, batchRow: 'd5' }
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.findAll({ type: 'Button' })).map(b => String(b.props.key)).filter(k => k.startsWith('batch:'))[0]).toBe('batch:d5')
  await ui.unmount()
})

test('the batch page follows the ringed row, else the page o moved to', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: `d${i + 1}` }) as Decision)
  expect(batchPage(rows, 'd7', 5, 0)).toBe(1)
  expect(batchPage(rows, undefined, 5, 2)).toBe(2)
  expect(batchPage(rows, undefined, 5, 9)).toBe(2)
})
