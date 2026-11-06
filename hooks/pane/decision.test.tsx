import { expect, test } from 'claude-code/testing'

import { markAnswered, recordQuestion } from '../discuss'
import { addDecision } from '../tool'
import { create, readAll, readOne, write } from '../store'
import type { Decision, StoreCtx } from '../store'
import {
  INITIAL_VIEW,
  back,
  chooseAndReopen,
  DecisionView,
  chooseOption,
  dependencyLines,
  reopenedLine,
  stateLine,
  highlightFor,
  highlightRecommendation,
  parkDecision,
  pressDigit,
  unparkDecision,
} from './decision'
import type { Typing } from './decision'

function fakeStore(): StoreCtx {
  const files = new Map<string, string>()

  return {
    env: { get: async () => '/home/test' },
    session: { cwd: async () => '/work/pantry' },
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

function options(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, label: `Option ${i + 1}`, changes: `changes ${i + 1}` }))
}

async function make(store: StoreCtx, count = 3, recommendation: Decision['recommendation'] | null = { option: 2, reason: 'because' }) {
  return create(store, {
    group: 'Config file plan',
    kind: 'choice',
    title: 'Where the config file lives',
    scenario: 'You run the tool from packages/api.',
    options: options(count),
    recommendation: recommendation ?? undefined,
    sources: [],
    dependsOn: [],
  })
}

function focusRecorder() {
  const asked: string[] = []

  return {
    asked,
    $: {
      ui: {
        focus: async (args: { requestId: string; key: string }) => {
          asked.push(`${args.requestId}/${args.key}`)
          return {}
        },
      },
    },
  }
}

const fresh = (): Typing => ({ typed: undefined, option: undefined })

test('a digit highlights its option, and 0 is 10', () => {
  expect(highlightFor('3', 1000, undefined, 5).option).toBe(3)
  expect(highlightFor('0', 1000, undefined, 10).option).toBe(10)
})

test('a second digit within the gap extends the number, after it does not', () => {
  const one = highlightFor('1', 1000, undefined, 12)
  expect(one.option).toBe(1)
  expect(highlightFor('0', 1400, one.typed, 12).option).toBe(10)
  expect(highlightFor('1', 1400, one.typed, 12).option).toBe(11)
  expect(highlightFor('2', 1400, one.typed, 12).option).toBe(12)
  expect(highlightFor('0', 2001, one.typed, 12).option).toBe(10)
  expect(highlightFor('1', 2001, one.typed, 12).option).toBe(1)
  expect(highlightFor('2', 2001, one.typed, 12).option).toBe(2)
})

test('a joined number needs the option to exist', () => {
  const one = highlightFor('1', 1000, undefined, 5)
  expect(highlightFor('2', 1100, one.typed, 5).option).toBe(2)
  expect(highlightFor('0', 1100, one.typed, 5).option).toBeUndefined()
})

test('a digit for an option that does not exist is ignored', async () => {
  const { $, asked } = focusRecorder()
  expect(await pressDigit($, '5', 1000, 3, fresh())).toBeUndefined()
  expect(asked).toEqual([])
})

test('digits 1 then 0 ask the engine to focus opt:1 then opt:10', async () => {
  const { $, asked } = focusRecorder()
  const state = fresh()
  expect(await pressDigit($, '1', 1000, 10, state)).toBe(1)
  expect(await pressDigit($, '0', 1200, 10, state)).toBe(10)
  expect(asked).toEqual(['decisions/opt:1', 'decisions/opt:10'])
})

test('two digits typed before the first focus call answers still read as 10', async () => {
  const asked: string[] = []
  const $ = {
    ui: {
      focus: async (args: { key: string }) => {
        asked.push(args.key)
        await Promise.resolve()
        return {}
      },
    },
  }
  const state = fresh()
  await Promise.all([pressDigit($, '1', 1000, 10, state), pressDigit($, '0', 1010, 10, state)])
  expect(asked).toEqual(['opt:1', 'opt:10'])
  expect(state.option).toBe(10)
})

test('number then choose answers: the decision is ready with the option', async () => {
  const store = fakeStore()
  const d = await make(store)
  const next = await chooseOption(store, d, 2)
  expect(next?.state).toBe('ready')
  expect((await readOne(store, d.id))?.answer?.option).toBe(2)
  const again = await chooseOption(store, next!, 3)
  expect(again?.answer?.option).toBe(3)
})

test('a sent decision, or an option that is not there, cannot be chosen', async () => {
  const store = fakeStore()
  const d = await make(store)
  expect(await chooseOption(store, d, 9)).toBeUndefined()
  await write(store, { ...d, state: 'sent' })
  expect(await chooseOption(store, { ...d, state: 'sent' }, 1)).toBeUndefined()
  expect((await readOne(store, d.id))?.answer).toBeUndefined()
})

test('a highlights the recommendation, and does nothing without one', async () => {
  const store = fakeStore()
  const withOne = await make(store)
  const without = await make(store, 3, null)
  const { $, asked } = focusRecorder()
  expect(await highlightRecommendation($, withOne, fresh())).toBe(2)
  expect(asked).toEqual(['decisions/opt:2'])
  expect(await highlightRecommendation($, without, fresh())).toBeUndefined()
  expect(asked).toHaveLength(1)
})

test('b clears a highlight first, then goes back to the list', async () => {
  const { $, asked } = focusRecorder()
  const inDecision = { ...INITIAL_VIEW, screen: 'decision' as const, decisionId: 'd1', highlight: 2 }
  const cleared = await back($, inDecision, fresh())
  expect(cleared.highlight).toBeUndefined()
  expect(cleared.screen).toBe('decision')
  expect(asked).toEqual(['decisions/discuss'])
  const gone = await back($, cleared, fresh())
  expect(gone.screen).toBe('list')
  expect(gone.decisionId).toBeUndefined()
})

test('parking needs a reason, and unparking returns it to open', async () => {
  const store = fakeStore()
  const d = await make(store)
  expect(await parkDecision(store, d, '   ')).toBe(false)
  expect((await readOne(store, d.id))?.state).toBe('open')
  expect(await parkDecision(store, d, 'waiting on the design review')).toBe(true)
  const parked = (await readOne(store, d.id))!
  expect(parked.state).toBe('parked')
  expect(parked.parkedReason).toBe('waiting on the design review')
  await unparkDecision(store, parked)
  const open = (await readOne(store, d.id))!
  expect(open.state).toBe('open')
  expect(open.parkedReason).toBeUndefined()
})

test('a choice, a park and an unpark made from a stale copy keep a reply that landed since', async () => {
  const store = fakeStore()
  const stale = await make(store)
  const entry = { who: 'claude' as const, text: 'a reply', at: 'later' }
  await write(store, { ...stale, thread: [entry] })

  await chooseOption(store, stale, 1)
  let now = await readOne(store, stale.id)
  expect(now?.state).toBe('ready')
  expect(now?.thread).toEqual([entry])

  await parkDecision(store, stale, 'later')
  await write(store, { ...(await readOne(store, stale.id))!, thread: [entry, { ...entry, text: 'second' }] })
  await unparkDecision(store, stale)
  now = await readOne(store, stale.id)
  expect(now?.state).toBe('open')
  expect(now?.thread.length).toBe(2)
})

test('changing a ready answer reopens its ready dependents and says so; the same answer does not', async () => {
  const store = fakeStore()
  const base = { version: 1, section: 'needs-you', kind: 'choice', scenario: 's', options: [{ id: 1, label: 'A' }, { id: 2, label: 'B' }], sources: [], thread: [], revisions: [], createdAt: 't', updatedAt: 't' } as unknown as Decision
  await write(store, { ...base, id: 'd1', number: 1, title: 'First', dependsOn: [], state: 'ready', answer: { option: 1, answeredAt: 't' } })
  await write(store, { ...base, id: 'd2', number: 2, title: 'Second', dependsOn: ['d1'], state: 'ready', answer: { option: 2, answeredAt: 't' } })
  await write(store, { ...base, id: 'd3', number: 3, title: 'Third', dependsOn: ['d1'], state: 'sent', answer: { option: 2, answeredAt: 't' } })
  const d1 = (await readOne(store, 'd1'))!
  expect((await chooseAndReopen(store, d1, 1))?.notice).toBeUndefined()
  expect((await readOne(store, 'd2'))!.state).toBe('ready')
  const result = await chooseAndReopen(store, d1, 2)
  expect(result?.notice).toBe('d1 changed. Reopened d2. d3 was already sent.')
  expect((await readOne(store, 'd2'))!.state).toBe('open')
  expect((await readOne(store, 'd2'))!.reopenedBy?.id).toBe('d1')
})

test('a first answer reopens nothing', async () => {
  const store = fakeStore()
  const base = { version: 1, section: 'needs-you', kind: 'choice', scenario: 's', options: [{ id: 1, label: 'A' }, { id: 2, label: 'B' }], sources: [], thread: [], revisions: [], createdAt: 't', updatedAt: 't' } as unknown as Decision
  await write(store, { ...base, id: 'd1', number: 1, title: 'First', dependsOn: [], state: 'open' })
  await write(store, { ...base, id: 'd2', number: 2, title: 'Second', dependsOn: ['d1'], state: 'ready', answer: { option: 2, answeredAt: 't' } })
  expect((await chooseAndReopen(store, (await readOne(store, 'd1'))!, 1))?.notice).toBeUndefined()
  expect((await readOne(store, 'd2'))!.state).toBe('ready')
})

const KIND_CASES = [
  { name: 'go-ahead', input: { kind: 'go-ahead', title: 'Push the branch', scenario: 's', recommendation: { option: 1, reason: 'r' } }, count: 2 },
  { name: 'assumption', input: { kind: 'assumption', title: 'Settings are YAML', scenario: 's', recommendation: { option: 1, reason: 'r' } }, count: 2 },
  { name: 'finding', input: { kind: 'finding', title: 'Search ranking: exact matches sort low', scenario: 's', recommendation: { option: 1, reason: 'r' } }, count: 4 },
]

for (const c of KIND_CASES) {
  test(`${c.name}: each number highlights its option and choosing it answers`, async () => {
    const store = fakeStore()
    for (let option = 1; option <= c.count; option++) {
      await addDecision(store, c.input)
      const d = (await readAll(store)).decisions.at(-1)!
      expect(d.options).toHaveLength(c.count)
      const typed: Typing = { typed: undefined, option: undefined }
      const focused: string[] = []
      const $ = { ui: { focus: async (a: { key: string }) => void focused.push(a.key) } }
      expect(await pressDigit($, String(option), 0, d.options.length, typed)).toBe(option)
      expect(focused).toEqual([`opt:${option}`])
      const next = await chooseOption(store, d, option)
      expect(next?.state).toBe('ready')
      expect(next?.answer?.option).toBe(option)
    }
  })
}

test('a digit past a kind\'s options does nothing', async () => {
  const store = fakeStore()
  await addDecision(store, KIND_CASES[0]!.input)
  const d = (await readAll(store)).decisions[0]!
  expect(await pressDigit({ ui: { focus: async () => undefined } }, '3', 0, d.options.length, { typed: undefined, option: undefined })).toBeUndefined()
})

test('a question is answered by typing in the discussion, then d and enter', async () => {
  const store = fakeStore()
  await addDecision(store, { kind: 'question', title: 'Which staging account', scenario: 's' })
  const d = (await readAll(store)).decisions[0]!
  expect(await chooseOption(store, d, 1)).toBeUndefined()
  await recordQuestion(store, d.id, 'the one ending in 41')
  expect(await markAnswered(store, d.id)).toBe(true)
  const done = (await readOne(store, d.id))!
  expect(done.state).toBe('ready')
  expect(done.answer?.option).toBeUndefined()
  expect(done.thread[0]!.text).toBe('the one ending in 41')
})

test('the state line names the kind, but not for a choice', () => {
  const base = { state: 'open', kind: 'choice' } as unknown as Decision
  expect(stateLine(base)).toBe('open')
  expect(stateLine({ ...base, kind: 'finding' })).toBe('finding, open')
  expect(stateLine({ ...base, kind: 'go-ahead', isTask: true })).toBe('to do, open')
})

test('a reopened decision says why and what was answered, only while it is open or live', () => {
  const d = {
    state: 'open',
    options: [{ id: 1, label: 'One' }, { id: 2, label: 'Per package' }],
    reopenedBy: { id: 'd3', at: 't', was: { option: 2, answeredAt: 't' } },
  } as unknown as Decision
  expect(reopenedLine(d)).toBe('Reopened because d3 changed. You had answered 2 Per package.')
  expect(reopenedLine({ ...d, state: 'ready' })).toBeUndefined()
  expect(reopenedLine({ ...d, state: 'open', reopenedBy: undefined })).toBeUndefined()
})

test('blocks and depends-on lines say what the dependency was answered', () => {
  const dep = { id: 'd2', title: 'Where the config file lives', state: 'ready', options: [{ id: 1, label: 'Project root' }], answer: { option: 1, answeredAt: 't' } } as unknown as Decision
  const waiting = { ...dep, id: 'd4', title: 'Cache place', state: 'open', answer: undefined } as unknown as Decision
  const d = { id: 'd5', blocks: 'the plan', dependsOn: ['d2', 'd4', 'd9'] } as unknown as Decision
  expect(dependencyLines(d, [dep, waiting])).toEqual([
    'Blocks: the plan',
    'Depends on: d2, Where the config file lives (answered 1 Project root)',
    'Depends on: d4, Cache place (not answered yet)',
  ])
})

const PANE = {
  plugin: 'decisions',
  component: 'Pane',
  requestId: 'other',
  props: { title: 'Decisions', isFocused: true, bodyColumns: 49, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

async function drawDecision($: any, on: any, d: Decision) {
  on('ui.render', ($$: any, e: any) =>
    DecisionView($$, { ui: $$.ui.resolve(e), d, view: INITIAL_VIEW, width: 49, readyCount: 0, onChanged: () => {}, onLeave: () => {}, onSend: () => {}, onHide: () => {} }),
  )

  return $.ui.mount({ ...PANE, surface: 'terminal' })
}

test('a finding shows four options and a digit row to 4; a question shows the hint and no digits', async ($, on) => {
  const store = fakeStore()
  await addDecision(store, KIND_CASES[2]!.input)
  await addDecision(store, { kind: 'question', title: 'Which account', scenario: 's' })
  const [finding, question] = (await readAll(store)).decisions
  const ui = await drawDecision($, on, finding!)
  const keys = (await ui.findAll({ type: 'Button' })).map((b: any) => b.props.key)
  expect(keys.filter((k: string) => k.startsWith('opt:'))).toEqual(['opt:1', 'opt:2', 'opt:3', 'opt:4'])
  expect(keys.filter((k: string) => k.startsWith('digit:'))).toEqual(['digit:1', 'digit:2', 'digit:3', 'digit:4'])
  expect(await ui.find({ type: 'Text', text: 'finding, open' })).toBeDefined()
  await ui.unmount()
})

test('a question shows the hint and no digit row', async ($, on) => {
  const store = fakeStore()
  await addDecision(store, { kind: 'question', title: 'Which account', scenario: 's' })
  const ui = await drawDecision($, on, (await readAll(store)).decisions[0]!)
  const keys = (await ui.findAll({ type: 'Button' })).map((b: any) => b.props.key)
  expect(keys.some((k: string) => k.startsWith('digit:') || k.startsWith('opt:') || k === 'a')).toBe(false)
  expect(await ui.find({ type: 'Text', text: 'Type your answer in the discussion, then d and enter.' })).toBeDefined()
  await ui.unmount()
})

test('a task shows Done and Cannot do it', async ($, on) => {
  const store = fakeStore()
  await addDecision(store, { kind: 'go-ahead', isTask: true, title: 'Sign in to staging', scenario: 'Run the login command.' })
  const ui = await drawDecision($, on, (await readAll(store)).decisions[0]!)
  expect((await ui.find({ key: 'opt:1' }))?.text).toMatch(/1 {2}Done/)
  expect((await ui.find({ key: 'opt:2' }))?.text).toMatch(/2 {2}Can't do it/)
  expect(await ui.find({ key: 'a' })).toBeUndefined()
  await ui.unmount()
})

test('any kind parks with a reason and shows it back', async () => {
  const store = fakeStore()
  await addDecision(store, KIND_CASES[2]!.input)
  const d = (await readAll(store)).decisions[0]!
  expect(await parkDecision(store, d, '  ')).toBe(false)
  expect(await parkDecision(store, d, 'waiting on the product owner')).toBe(true)
  const parked = (await readOne(store, d.id))!
  expect([parked.state, parked.parkedReason]).toEqual(['parked', 'waiting on the product owner'])
  expect(parked.parkedAt).toBeDefined()
  await unparkDecision(store, parked)
  expect((await readOne(store, d.id))!.state).toBe('open')
  expect((await readOne(store, d.id))!.parkedAt).toBeUndefined()
})

test('unparking leaves the decision in the section it had', async () => {
  const store = fakeStore()
  await addDecision(store, { ...KIND_CASES[2]!.input, section: 'claudes-call' })
  const d = (await readAll(store)).decisions[0]!
  await parkDecision(store, d, 'later')
  await unparkDecision(store, (await readOne(store, d.id))!)
  expect((await readOne(store, d.id))!.section).toBe('claudes-call')
})

test('the option screen says a number then enter confirms, and mentions a only when there is a recommendation', async ($, on) => {
  const store = fakeStore()
  await addDecision(store, KIND_CASES[2]!.input)
  const d = (await readAll(store)).decisions[0]!
  const ui = await drawDecision($, on, d)
  expect(await ui.find({ type: 'Text', text: d.recommendation ? 'Type a number or a, then enter to confirm.' : 'Type a number, then enter to confirm.' })).toBeDefined()
  await ui.unmount()
})
