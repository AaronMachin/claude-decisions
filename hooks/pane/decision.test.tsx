import { expect, mock, test } from 'claude-code/testing'

import { configure } from '../discuss'
import { SESSION_TOOL } from '../session'
import { ADD_TOOL, UPDATE_TOOL, addDecision } from '../tool'
import { create, readAll, readOne, write } from '../store'
import type { Decision, StoreCtx } from '../store'
import {
  INITIAL_VIEW,
  back,
  answerWithCondition,
  answerWithText,
  chooseAndReopen,
  DecisionView,
  ASK_PLACEHOLDER,
  somethingElseNumber,
  chooseOption,
  dependencyLines,
  reopenedLine,
  stateLine,
  highlightFor,
  highlightRecommendation,
  parkDecision,
  pressDigit,
  pressOption,
  cancelHeldDigit,
  setView,
  unparkDecision,
} from './decision'
import type { Typing } from './decision'

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

/**
 * Answering the last waiting decision opens the Send screen (row 270). The tests that mount through this are about
 * what follows on the list or the decision, so the mount holds the answers there with b, as the person would.
 */
async function mountHolding<M extends (props: any) => Promise<any>>($: { ui: { mount: M } }, props: Parameters<M>[0]): Promise<Awaited<ReturnType<M>>> {
  const ui = await $.ui.mount(props)
  const hold = async () => {
    if (await ui.find({ type: 'Text', text: 'That was the last one.' })) {
      await ui.press({ key: 'b' })
    }
  }
  const press = async (args: any) => {
    // One list (row 265): a group with nothing waiting is folded, so a row in it is reached by unfolding its heading.
    if (/^row:/.test(String(args.key)) && !(await ui.find({ key: args.key }))) {
      for (const heading of (await ui.findAll({ type: 'Button' })).filter((b: any) => /^group:/.test(String(b.props.key)))) {
        if (!(await ui.find({ key: args.key }))) {
          await ui.press({ key: heading.props.key })
        }
      }
    }
    const result = await ui.press(args)
    if (args.key !== 'b' && args.key !== 'confirm') {
      await hold()
    }
    return result
  }
  const input = async (args: any) => {
    const result = await ui.input(args)
    await hold()
    return result
  }

  // The kit's handle is frozen, so the wrapper is a view over it with press and input replaced.
  return new Proxy({}, { get: (_target, key) => (key === 'press' ? press : key === 'input' ? input : typeof ui[key] === 'function' ? ui[key].bind(ui) : ui[key]) }) as Awaited<ReturnType<M>>
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

test('b goes back to the list at once, highlight or not, and closes an answer box', async () => {
  const { $, asked } = focusRecorder()
  const inDecision = { ...INITIAL_VIEW, screen: 'decision' as const, decisionId: 'd1', highlight: 2, answerBox: { kind: 'condition' as const, option: 2 } }
  const gone = await back($, inDecision, fresh())
  expect(gone.screen).toBe('list')
  expect(gone.decisionId).toBeUndefined()
  expect(gone.highlight).toBeUndefined()
  expect(gone.answerBox).toBeUndefined()
  expect(asked).toEqual([])
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
  const base = { version: 1, section: 'needs-you', kind: 'choice', scenario: 's', options: [{ id: 1, label: 'A' }, { id: 2, label: 'B' }], sources: [], thread: [], revisions: [], createdAt: 't', updatedAt: 't', session: 'session-1' } as unknown as Decision
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

test('answerWithText saves { text } and makes the decision ready', async () => {
  const store = fakeStore()
  const d = await make(store)
  const result = await answerWithText(store, d, '  yes, after CI is green  ')
  const saved = (await readOne(store, d.id))!
  expect(result?.decision.state).toBe('ready')
  expect(saved.state).toBe('ready')
  expect(saved.answer?.text).toBe('yes, after CI is green')
  expect(saved.answer?.option).toBeUndefined()
  expect(saved.answer?.answeredAt).toBeTruthy()
})

test('answerWithCondition saves { option, condition }', async () => {
  const store = fakeStore()
  const d = await make(store)
  await answerWithCondition(store, d, 2, ' as PR comments ')
  const saved = (await readOne(store, d.id))!
  expect(saved.state).toBe('ready')
  expect(saved.answer?.option).toBe(2)
  expect(saved.answer?.condition).toBe('as PR comments')
})

test('a typed answer replaces a chosen option, no option left', async () => {
  const store = fakeStore()
  const d = await make(store)
  const chosen = await chooseOption(store, d, 1)
  await answerWithText(store, chosen!, 'neither')
  const saved = (await readOne(store, d.id))!
  expect(saved.answer?.option).toBeUndefined()
  expect(saved.answer?.text).toBe('neither')
})

test('a condition on an already chosen option keeps the option', async () => {
  const store = fakeStore()
  const d = await make(store)
  const chosen = await chooseOption(store, d, 3)
  await answerWithCondition(store, chosen!, 3, 'only on staging')
  const saved = (await readOne(store, d.id))!
  expect(saved.answer?.option).toBe(3)
  expect(saved.answer?.condition).toBe('only on staging')
  expect(saved.answer?.text).toBeUndefined()
})

test('a typed answer or a condition changing a ready answer reopens a dependent once', async () => {
  const store = fakeStore()
  const base = { version: 1, section: 'needs-you', kind: 'choice', scenario: 's', options: [{ id: 1, label: 'A' }, { id: 2, label: 'B' }], sources: [], thread: [], revisions: [], createdAt: 't', updatedAt: 't', session: 'session-1' } as unknown as Decision
  await write(store, { ...base, id: 'd1', number: 1, title: 'First', dependsOn: [], state: 'ready', answer: { option: 1, answeredAt: 't' } })
  await write(store, { ...base, id: 'd2', number: 2, title: 'Second', dependsOn: ['d1'], state: 'ready', answer: { option: 2, answeredAt: 't' } })
  const result = await answerWithCondition(store, (await readOne(store, 'd1'))!, 1, 'later')
  expect(result?.notice).toBe('d1 changed. Reopened d2.')
  expect((await readOne(store, 'd2'))!.state).toBe('open')
  await write(store, { ...(await readOne(store, 'd2'))!, state: 'ready', answer: { option: 2, answeredAt: 't' } })
  const again = await answerWithCondition(store, (await readOne(store, 'd1'))!, 1, 'later')
  expect(again?.notice).toBeUndefined()
  expect((await readOne(store, 'd2'))!.state).toBe('ready')
  const typed = await answerWithText(store, (await readOne(store, 'd1'))!, 'something different')
  expect(typed?.notice).toBe('d1 changed. Reopened d2.')
})

test('an empty typed answer or condition is refused, and so is a sent decision', async () => {
  const store = fakeStore()
  const d = await make(store)
  expect(await answerWithText(store, d, '   ')).toBeUndefined()
  expect(await answerWithCondition(store, d, 1, '')).toBeUndefined()
  expect(await answerWithCondition(store, d, 9, 'no such option')).toBeUndefined()
  expect((await readOne(store, d.id))?.answer).toBeUndefined()
  await write(store, { ...d, state: 'sent' })
  expect(await answerWithText(store, { ...d, state: 'sent' }, 'too late')).toBeUndefined()
})

test('Something else is numbered after the last option', async () => {
  const store = fakeStore()
  expect(somethingElseNumber(await make(store, 3))).toBe(4)
  expect(somethingElseNumber(await make(store, 12))).toBe(13)
})

test('a first answer reopens nothing', async () => {
  const store = fakeStore()
  const base = { version: 1, section: 'needs-you', kind: 'choice', scenario: 's', options: [{ id: 1, label: 'A' }, { id: 2, label: 'B' }], sources: [], thread: [], revisions: [], createdAt: 't', updatedAt: 't', session: 'session-1' } as unknown as Decision
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

test('a question is answered by typing in Something else, with no option and no turn', async () => {
  const store = fakeStore()
  await addDecision(store, { kind: 'question', title: 'Which staging account', scenario: 's' })
  const d = (await readAll(store)).decisions[0]!
  expect(await chooseOption(store, d, 1)).toBeUndefined()
  expect(somethingElseNumber(d)).toBe(1)
  await answerWithText(store, d, 'the one ending in 41')
  const done = (await readOne(store, d.id))!
  expect(done.state).toBe('ready')
  expect(done.answer?.option).toBeUndefined()
  expect(done.answer?.text).toBe('the one ending in 41')
  expect(done.thread).toEqual([])
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
    '⚑ Blocks the plan',
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

  return mountHolding($, { ...PANE, surface: 'terminal' })
}

test('a finding shows four options and Something else, each with its own number key, and no digit row', async ($, on) => {
  const store = fakeStore()
  await addDecision(store, KIND_CASES[2]!.input)
  await addDecision(store, { kind: 'question', title: 'Which account', scenario: 's' })
  const [finding, question] = (await readAll(store)).decisions
  const ui = await drawDecision($, on, finding!)
  const keys = (await ui.findAll({ type: 'Button' })).map((b: any) => b.props.key)
  expect(keys.filter((k: string) => k.startsWith('opt:'))).toEqual(['opt:1', 'opt:2', 'opt:3', 'opt:4', 'opt:5'])
  expect((await ui.findAll({ type: 'Button' })).filter((b: any) => /^opt:/.test(b.props.key)).map((b: any) => b.props.hotkey)).toEqual(['1', '2', '3', '4', '5'])
  expect((await ui.find({ key: 'opt:5' }))?.text).toMatch(/Something else/)
  expect(keys.some((k: string) => k.startsWith('digit:'))).toBe(false)
  expect((await ui.findAll({ type: 'Text' })).some((t: any) => t.text === ' FINDING ')).toBe(true)
  await ui.unmount()
})

test('a question shows only Something else, no a and no digit row', async ($, on) => {
  const store = fakeStore()
  await addDecision(store, { kind: 'question', title: 'Which account', scenario: 's' })
  const ui = await drawDecision($, on, (await readAll(store)).decisions[0]!)
  const keys = (await ui.findAll({ type: 'Button' })).map((b: any) => b.props.key)
  expect(keys.filter((k: string) => k.startsWith('opt:'))).toEqual(['opt:1'])
  expect(keys.some((k: string) => k.startsWith('digit:') || k === 'a')).toBe(false)
  expect(await ui.find({ type: 'Text', text: /^Type your answer in the discussion/ })).toBeUndefined()
  await ui.unmount()
})

test('a task shows Done and Cannot do it', async ($, on) => {
  const store = fakeStore()
  await addDecision(store, { kind: 'go-ahead', isTask: true, title: 'Sign in to staging', scenario: 'Run the login command.' })
  const ui = await drawDecision($, on, (await readAll(store)).decisions[0]!)
  expect((await ui.find({ key: 'opt:1' }))?.text).toMatch(/^Done/)
  expect((await ui.find({ key: 'opt:2' }))?.text).toMatch(/^Can't do it/)
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

for (const hasRecommendation of [true, false]) {
  test(`the key hints offer a only when there is a recommendation (${hasRecommendation ? 'one' : 'none'})`, async ($, on) => {
    const store = fakeStore()
    await addDecision(store, hasRecommendation ? KIND_CASES[2]!.input : { ...KIND_CASES[2]!.input, recommendation: undefined })
    const ui = await drawDecision($, on, (await readAll(store)).decisions[0]!)
    expect(!!(await ui.find({ key: 'a' }))).toBe(hasRecommendation)
    await ui.unmount()
  })
}

// The decision screen through the whole mod (decisions 205 to 207, 216, 217, 219, 220, 225 to 229).

type On = (event: string, hook: (...args: any[]) => any) => unknown

type Engine = { files: Map<string, string>; submitted: string[]; statuses: (string | undefined)[] }

/** Answers everything the mod asks of the engine, from memory. */
function engine(on: On): Engine {
  const seen: Engine = { files: new Map(), submitted: [], statuses: [] }
  on('env.get', () => ({ value: '/home/test' }))
  on('session.cwd', () => ({ value: '/work/pantry' }))
  on('session.id', () => ({ value: 'session-1' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '/work/pantry/.git\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('fs.read', (_: any, e: any) => ({ value: seen.files.get(e.path) ?? '' }))
  on('fs.write', (_: any, e: any) => {
    seen.files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.exists', (_: any, e: any) => ({ value: seen.files.has(e.path) }))
  on('fs.list', (_: any, e: any) => ({
    value: [...seen.files.keys()].filter(p => p.startsWith(e.path + '/')).map(p => ({ name: p.slice(e.path.length + 1), kind: 'file', size: 0, mtimeMs: 0, isLink: false })),
  }))
  on('ui.status', (_: any, e: any) => {
    seen.statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.focus', () => ({ value: {} }))
  on('tool.register', () => ({ value: {} }))
  on('command.register', (_: any, e: any) => ({ value: { command: e.name } }))
  on('prompt.submit', (_: any, e: any) => {
    seen.submitted.push(e.text)
    return { text: e.text }
  })
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('turn.start', (_: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  mock.store(on as any)

  return seen
}

const CHOICE = {
  group: 'Code review',
  kind: 'choice',
  title: 'Where the review comments go',
  scenario: 'The review found three problems in the recipe importer and they need to land somewhere the team reads.',
  options: [
    { label: 'In the chat', changes: 'the comments stay in this session and nobody else sees them unless you copy them out by hand afterwards' },
    { label: 'As PR comments', changes: 'each finding becomes a comment on the line it is about, so the author sees it beside the code it concerns' },
  ],
  recommendation: { option: 2, reason: 'The author reads PR comments already, and each one sits next to the code it is about.' },
}

const SCREEN = {
  plugin: 'decisions',
  component: 'Pane',
  requestId: 'decisions',
  props: { title: 'Decisions', isFocused: true, bodyColumns: 49, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const rowsOf = (rows: number) => ({ ...SCREEN, props: { ...SCREEN.props, scroll: { offset: 0, bodyRows: rows } }, surface: 'terminal' as const })

async function begin($: any, on: On, input: Record<string, unknown> = CHOICE): Promise<Engine> {
  const seen = engine(on)
  await $.session.start({ cwd: '/work/pantry', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: ADD_TOOL, ...input })

  return seen
}

/** Rewrites a stored decision, as a reply landing or a hand edit would. */
function edit(seen: Engine, id: string, change: (d: any) => any): void {
  const path = [...seen.files.keys()].find(p => p.endsWith(`/${id}.json`))!
  seen.files.set(path, JSON.stringify(change(JSON.parse(seen.files.get(path)!))))
}

/** The engine reporting the ring on `key`, which the kit doesn't do for a mod's own focus calls. */
async function ring($: any, key: string): Promise<void> {
  await $.ui.focus({ component: 'Pane', requestId: 'decisions', plugin: 'decisions', element: key, origin: { kind: 'plugin' } })
}

const texts = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => t.text as string)

test('opening puts the ring on the recommendation, on the chosen option once answered, and on 1 without either; opening marks it seen', async ($, on) => {
  const seen = await begin($, on)
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  expect((await ui.find({ key: 'opt:2' }))?.props.autoFocus).toBe(true)
  expect(await ui.find({ key: 'card:2' })).toBeDefined()
  expect(await ui.find({ key: 'discuss' })).toBeUndefined()
  await ui.press({ key: 'opt:1' })
  await ring($, 'opt:1')
  await ui.press({ key: 'opt:1' })
  await ui.press({ key: 'row:d1' })
  expect((await ui.find({ key: 'opt:1' }))?.props.autoFocus).toBe(true)
  expect((await ui.find({ key: 'opt:2' }))?.props.autoFocus).toBeFalsy()
  await ui.press({ key: 'b' })
  edit(seen, 'd1', d => ({ ...d, state: 'open', answer: undefined, recommendation: undefined }))
  await ui.press({ key: 'row:d1' })
  expect((await ui.find({ key: 'opt:1' }))?.props.autoFocus).toBe(true)
  await ui.unmount()
})

test('b goes straight back to the list, even with an option highlighted', async ($, on) => {
  await begin($, on)
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  await ui.press({ key: 'b' })
  expect(await ui.find({ key: 'row:d1' })).toBeDefined()
  await ui.unmount()
})

test("every option's changes and the Why line show in full on a tall pane; m hides them but the highlighted one's", async ($, on) => {
  await begin($, on)
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  const all = (await texts(ui)).join(' ')
  expect(all).toContain('by hand afterwards')
  expect(all).toContain('the code it concerns')
  expect(all).toContain('sits next to the code it is about.')
  expect(await ui.find({ type: 'Text', text: /^Why: The author/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^Why: The author/ }))?.props.color).toBe('success')
  expect((await ui.find({ key: 'm' }))?.text).toMatch(/hide detail/)
  await ui.press({ key: 'm' })
  const hidden = (await texts(ui)).join(' ')
  expect(hidden).not.toContain('by hand afterwards')
  expect(hidden).toContain('each finding becomes a comment')
  expect((await ui.find({ key: 'm' }))?.text).toMatch(/show detail/)
  await ui.unmount()
})

test('full detail that would not fit the pane is still drawn whole, and the pane scrolls (row 262)', async ($, on) => {
  await begin($, on, { ...CHOICE, scenario: 'A long scenario sentence. '.repeat(30) })
  const ui = await mountHolding($, rowsOf(16))
  await ui.press({ key: 'row:d1' })
  expect((await texts(ui)).join(' ')).toContain('by hand afterwards')
  expect(await ui.find({ key: 'card:2' })).toBeDefined()
  await ui.unmount()
})

test('the last option is Something else; enter on it opens "Your answer ", and a typed answer saves without a turn', async ($, on) => {
  const seen = await begin($, on)
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  expect((await ui.find({ key: 'opt:3' }))?.text).toMatch(/Something else/)
  expect((await ui.find({ key: 'opt:3' }))?.props.hotkey).toBe('3')
  expect((await texts(ui)).join(' ')).toContain("Type your own answer. It's saved without asking Claude and goes with your next send.")
  await ui.press({ key: 'opt:3' })
  await ring($, 'opt:3')
  await ui.press({ key: 'opt:3' })
  expect((await ui.find({ key: 'answer' }))?.props.label).toBe('Your answer ')
  expect((await texts(ui)).join(' ')).toContain("enter saves it, Claude isn't asked · empty enter cancels")
  await ui.input({ key: 'answer', text: 'after CI is green', kind: 'change' })
  await ui.input({ key: 'answer', text: 'after CI is green' })
  expect(await ui.find({ key: 'group:g:Code review' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Saved d1 · Something else: after CI is green · s sends it' })).toBeDefined()
  expect(seen.submitted).toEqual([])
  const stored = JSON.parse([...seen.files.entries()].find(([k]) => k.endsWith('/d1.json'))![1])
  expect([stored.state, stored.answer.text, stored.answer.option]).toEqual(['ready', 'after CI is green', undefined])
  expect(JSON.parse(JSON.stringify(stored.options)).length).toBe(2)
  await ui.press({ key: 'row:d1' })
  expect((await ui.find({ key: 'opt:3' }))?.props.autoFocus).toBe(true)
  expect((await ui.find({ key: 'line:3' }))?.text).toMatch(/✓ your answer/)
  expect(await ui.find({ type: 'Text', text: '⤷ after CI is green' })).toBeDefined()
  await ui.unmount()
})

test('an empty enter in the answer box closes it and saves nothing', async ($, on) => {
  const seen = await begin($, on)
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  await ui.press({ key: 'opt:3' })
  await ring($, 'opt:3')
  await ui.press({ key: 'opt:3' })
  await ui.input({ key: 'answer', text: '' })
  expect(await ui.find({ key: 'answer' })).toBeUndefined()
  expect(await ui.find({ key: 'opt:3' })).toBeDefined()
  expect(JSON.parse([...seen.files.entries()].find(([k]) => k.endsWith('/d1.json'))![1]).answer).toBeUndefined()
  await ui.unmount()
})

test('c on a highlighted option opens "Only if " and saves the option with its condition; c on Something else does nothing', async ($, on) => {
  const seen = await begin($, on)
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  await ui.press({ key: 'opt:3' })
  await ring($, 'opt:3')
  await ui.press({ key: 'c' }).catch(() => undefined)
  expect(await ui.find({ key: 'answer' })).toBeUndefined()
  await ui.press({ key: 'opt:2' })
  await ring($, 'opt:2')
  await ui.press({ key: 'c' })
  expect((await ui.find({ key: 'answer' }))?.props.label).toBe('Only if ')
  await ui.input({ key: 'answer', text: 'after CI is green' })
  expect(await ui.find({ type: 'Text', text: 'Saved d1 · 2 As PR comments, if after CI is green · s sends it' })).toBeDefined()
  const stored = JSON.parse([...seen.files.entries()].find(([k]) => k.endsWith('/d1.json'))![1])
  expect([stored.answer.option, stored.answer.condition]).toEqual([2, 'after CI is green'])
  await ui.press({ key: 'row:d1' })
  expect((await ui.find({ key: 'line:2' }))?.text).toMatch(/★ recommended {2}✓ your answer/)
  expect(await ui.find({ type: 'Text', text: '⤷ only if after CI is green' })).toBeDefined()
  await ui.unmount()
})

test('the answer box open when the pane is hidden comes back with its draft on the same option', async ($, on) => {
  await begin($, on)
  let ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  await ui.press({ key: 'c' })
  await ui.input({ key: 'answer', text: 'only on stag', kind: 'change' })
  await ui.unmount()
  ui = await mountHolding($, rowsOf(40))
  expect((await ui.find({ key: 'answer' }))?.props.label).toBe('Only if ')
  expect((await ui.find({ key: 'answer' }))?.text).toContain('only on stag')
  expect(await ui.find({ key: 'card:2' })).toBeDefined()
  await ui.unmount()
})

const TWELVE_PLACES = {
  ...CHOICE,
  title: 'Which of twelve storage places',
  options: Array.from({ length: 12 }, (_, i) => ({ label: `Place ${i + 1}`, changes: `what place ${i + 1} costs` })),
  recommendation: { option: 1, reason: 'It is the one already in use.' },
}

test('12 options on a 9-row pane: every option is drawn, 1 then 3 reaches Something else, and 1 alone does not answer at once', async ($, on) => {
  const seen = await begin($, on, TWELVE_PLACES)
  const ui = await mountHolding($, rowsOf(9))
  await ui.press({ key: 'row:d1' })
  expect(await ui.find({ key: 'opt:13' })).toBeDefined()
  await ui.press({ key: 'opt:1' })
  expect(await ui.find({ key: 'opt:1' })).toBeDefined()
  await ui.press({ key: 'opt:3' })
  expect(await ui.find({ key: 'card:13' })).toBeDefined()
  expect((await ui.find({ key: 'opt:13' }))?.text).toMatch(/^13: Something else/)
  expect(JSON.parse([...seen.files.entries()].find(([k]) => k.endsWith('/d1.json'))![1]).answer).toBeUndefined()
  await ui.unmount()
})

test('a question has only Something else, and no line about typing in the discussion', async ($, on) => {
  await begin($, on, { group: 'Code review', kind: 'question', title: 'Which staging account', scenario: 'Two accounts exist.' })
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  const options = (await ui.findAll({ type: 'Button' })).filter((b: any) => /^opt:/.test(String(b.props.key)))
  expect(options.map((b: any) => b.props.key)).toEqual(['opt:1'])
  expect(options[0]?.text).toMatch(/Something else/)
  expect(await ui.find({ type: 'Text', text: /Type your answer in the discussion/ })).toBeUndefined()
  await ui.unmount()
})

const at = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()

test('an empty pane offers another session with decisions waiting, and enter brings them here (row 291)', async ($, on) => {
  const seen = await begin($, on)
  edit(seen, 'd1', d => ({ ...d, session: 'old-id' }))
  const ui = await mountHolding($, rowsOf(40))
  const all = await texts(ui)
  expect(all).toContain('Carry on from another session in this repository:')
  expect(all.some((t: string) => /^↩ Code review · 1 waiting · just now$/.test(t))).toBe(true)
  await ui.press({ key: 'adopt:old-id' })
  for (let i = 0; i < 40; i++) {
    await Promise.resolve()
  }
  const path = [...seen.files.keys()].find(p => p.endsWith('/d1.json'))!
  expect(JSON.parse(seen.files.get(path)!).movedFrom).toBe('old-id')
  await ui.unmount()
  const again = await mountHolding($, rowsOf(40))
  expect(await again.find({ key: 'row:d1' })).toBeTruthy()
  await again.unmount()
})

test('the session card shows the summary, now, plan progress and links under its title (row 288)', async ($, on) => {
  await begin($, on)
  await $.tool.call({
    tool: SESSION_TOOL,
    title: 'Pantry importer review',
    summary: 'Reviewing the recipe importer.',
    now: { text: 'Choosing where comments go' },
    plan: [{ text: 'Read it', status: 'done' }, { text: 'Comment', status: 'active', waitsOn: ['d1'] }],
    links: [{ url: 'https://github.com/o/r/pull/4', label: '#4 Importer', state: 'open' }],
  })
  const ui = await mountHolding($, rowsOf(40))
  const all = await texts(ui)
  expect(all).toContain('  Reviewing the recipe importer.')
  expect(all).toContain('  ▶ now: Choosing where comments go')
  expect(all).toContain('  Plan 1 of 2 done · next: Comment (waits on d1)')
  expect(all).toContain('  #4 open')
  await ui.unmount()
})

test('a question with no reply yet is drawn under the heading, newest last, after the reply before it', async ($, on) => {
  const seen = await begin($, on)
  edit(seen, 'd1', d => ({
    ...d,
    thread: [
      { who: 'person', text: 'Would PR comments spam the author?', at: at(500_000) },
      { who: 'claude', text: 'No, one comment per finding.', at: at(400_000) },
      { who: 'person', text: 'could we just save it against the session id?', at: at(60_000) },
    ],
  }))
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  const all = await texts(ui)
  expect((await ui.find({ key: 'talk:reply' }))?.text).toMatch(/^claude · \d+m {2}No, one comment/)
  expect((await ui.find({ key: 'talk:asked' }))?.text).toMatch(/^you · 1m {2}could we just save it against the/)
  expect(all).toContain('1 earlier message · o: whole thread')
  await ui.unmount()
})

test('a first question with no reply yet is drawn, not just counted', async ($, on) => {
  const seen = await begin($, on)
  edit(seen, 'd1', d => ({ ...d, thread: [{ who: 'person', text: 'why not just reload it?', at: at(60_000) }] }))
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  const all = await texts(ui)
  expect((await ui.find({ key: 'talk:asked' }))?.text).toMatch(/^you · 1m {2}why not just reload it\?/)
  expect(all.some((t: string) => /o: whole thread/.test(t))).toBe(false)
  await ui.unmount()
})

test('the conversation sits under the options: counts, the unread reply, and the earlier messages', async ($, on) => {
  const seen = await begin($, on)
  edit(seen, 'd1', d => ({
    ...d,
    // Never opened, so what came after it was made is unread: the last reply only.
    createdAt: at(300_000),
    thread: [
      { who: 'person', text: 'Would PR comments spam the author?', at: at(500_000) },
      { who: 'claude', text: 'No, one comment per finding.', at: at(400_000) },
      { who: 'claude', text: 'Also, the importer has an owner who reads every PR.', at: at(120_000) },
    ],
  }))
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  const all = await texts(ui)
  expect(all).toContain('Talk it through with Claude')
  expect(all.join('|')).toContain(' · 3 messages')
  expect(all.join('|')).toContain(' · ● 1 new')
  expect((await ui.find({ key: 'talk:reply' }))?.text).toMatch(/^claude · 2m {2}Also, the importer/)
  expect(all.join(' ')).toContain('the importer has an owner who reads every PR.')
  expect(all).toContain('2 earlier messages · o: whole thread')
  expect(all).toContain('Ask Claude about this decision… ')
  // Opening it counted as reading it: back on the list the row has no ●.
  await ui.press({ key: 'b' })
  expect((await ui.find({ key: 'row:d1' }))?.text).not.toMatch(/●/)
  await ui.unmount()
})

test('with no thread the conversation says what asking does; while a question waits it says Claude is replying', async ($, on) => {
  const seen = await begin($, on)
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  expect((await texts(ui)).join(' ')).toContain('Ask why an option exists, what it would cost, or for another option. Claude replies here and can change the decision.')
  await ui.input({ key: 'ask-inline', text: 'Does the author read them?', kind: 'change' })
  await ui.input({ key: 'ask-inline', text: 'Does the author read them?' })
  for (let i = 0; i < 30; i++) {
    await Promise.resolve()
  }
  expect(seen.submitted).toEqual(['On decision 1 · Where the review comments go: Does the author read them?'])
  expect(await ui.find({ type: 'Text', text: '✻ Claude is replying…' })).toBeDefined()
  expect((await ui.find({ key: 'ask-inline' }))?.text ?? '').not.toContain('Does the author')
  await ui.unmount()
})

test('t puts the ring in the ask box on a tall pane and opens the thread on a compact one', async ($, on) => {
  await begin($, on)
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  expect((await ui.find({ key: 't' }))?.props.hotkey).toBe('t')
  await ui.press({ key: 't' })
  expect(await ui.find({ key: 'ask-inline' })).toBeDefined()
  await ui.unmount()
  const short = await mountHolding($, rowsOf(9))
  expect(await short.find({ key: 'ask-inline' })).toBeUndefined()
  await short.press({ key: 't' })
  expect(await short.find({ type: 'Text', text: /^Replies from:/ })).toBeDefined()
  await short.unmount()
})

test('o opens the whole thread, which has no d or m key and still has f', async ($, on) => {
  await begin($, on)
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  expect(await ui.find({ key: 'discuss' })).toBeUndefined()
  await ui.press({ key: 'o' })
  expect(await ui.find({ type: 'Text', text: /^Replies from:/ })).toBeDefined()
  const keys = (await ui.findAll({ type: 'Button' })).map((b: any) => b.props.key)
  expect(keys).not.toContain('d')
  expect(keys).not.toContain('m')
  expect(keys).not.toContain('mark')
  await $.turn.start({ text: 'read eight files', turnId: 'busy' })
  await ui.press({ key: 'ask' })
  await ui.input({ key: 'ask-input', text: 'Which is cheaper?' })
  for (let i = 0; i < 30; i++) {
    await Promise.resolve()
  }
  expect((await ui.find({ key: 'f' }))?.props.hotkey).toBe('f')
  await ui.unmount()
})

test('the crumb names the id, the group and how many in it are answered; blocks shows as holds up', async ($, on) => {
  await begin($, on, { ...CHOICE, blocks: 'merging the branch' })
  await $.tool.call({ tool: ADD_TOOL, ...CHOICE, title: 'Second one' })
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d2' })
  // The ring starts on the recommendation, so one press answers it.
  await ui.press({ key: 'opt:2' })
  await ui.press({ key: 'row:d1' })
  expect((await ui.find({ key: 'crumb' }))?.text.replace(/[▌\s]+/g, ' ')).toContain('d1 · Code review · asked just now · ●○ 1 of 2 answered')
  expect((await ui.find({ key: 'holds:blocks' }))?.text).toMatch(/holds up merging the branch/)
  expect((await ui.find({ key: 'line:2' }))?.text).toMatch(/★ recommended/)
  await ui.unmount()
})

test('an option from a discussion in the last two minutes is marked ↻ new, and not after', async ($, on) => {
  const seen = await begin($, on)
  await $.tool.call({ tool: UPDATE_TOOL, id: 'd1', summary: 'Added option 3, Both', addOptions: [{ label: 'Both' }] })
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  expect((await ui.find({ key: 'line:3' }))?.text).toMatch(/↻ new/)
  expect((await ui.find({ key: 'line:1' }))?.text).not.toMatch(/↻ new/)
  expect((await ui.find({ key: 'opt:4' }))?.text).toMatch(/Something else/)
  await ui.press({ key: 'b' })
  edit(seen, 'd1', d => ({ ...d, thread: d.thread.map((e: any) => ({ ...e, at: at(180_000) })) }))
  await ui.press({ key: 'row:d1' })
  expect((await ui.find({ key: 'line:3' }))?.text).not.toMatch(/↻ new/)
  await ui.unmount()
})

// Send this one (decision 221).

/** Answers d1 with option 2 and d2 with option 1, then reopens d1. */
async function twoReady($: any, on: On, rows = 40): Promise<{ seen: Engine; ui: any }> {
  const seen = await begin($, on)
  await $.tool.call({ tool: ADD_TOOL, ...CHOICE, title: 'Second one', recommendation: { option: 1, reason: 'r' } })
  const ui = await mountHolding($, rowsOf(rows))
  await ui.press({ key: 'row:d1' })
  await ui.press({ key: 'opt:2' })
  await ui.press({ key: 'row:d2' })
  await ui.press({ key: 'opt:1' })
  await ui.press({ key: 'row:d1' })

  return { seen, ui }
}

test('s on an answered decision previews exactly what Claude gets for it, and says what stays behind', async ($, on) => {
  const { ui } = await twoReady($, on)
  expect((await ui.find({ key: 's' }))?.text).toMatch(/send this/)
  await ui.press({ key: 's' })
  const all = await texts(ui)
  expect(all).toContain('Send this decision to Claude')
  expect(all).toContain('Exactly what Claude gets:')
  // Wrapped at the pane's 49 columns.
  expect(all.join(' ')).toContain('Decision d1 · Where the review comments go (Code review)')
  expect(all).toContain('Chosen: 2. As PR comments')
  expect(all).toContain('Condition: none')
  expect(all).toContain("1 other answer stays ready and isn't sent.")
  expect(await ui.find({ key: 'tick:d2' })).toBeUndefined()
  await ui.unmount()
})

test('enter on the preview sends only that decision; the other stays ready', async ($, on) => {
  const { seen, ui } = await twoReady($, on)
  await ui.press({ key: 's' })
  await ui.press({ key: 'confirm' })
  for (let i = 0; i < 20; i++) {
    await Promise.resolve()
  }
  expect(seen.submitted).toHaveLength(1)
  expect(seen.submitted[0]).toContain('Decision d1')
  expect(seen.submitted[0]).not.toContain('Decision d2')
  const d2 = JSON.parse([...seen.files.entries()].find(([k]) => k.endsWith('/d2.json'))![1])
  expect(d2.state).toBe('ready')
  await ui.unmount()
})

test('b on the preview goes back to the decision, not the list, and nothing is sent', async ($, on) => {
  const { seen, ui } = await twoReady($, on)
  await ui.press({ key: 's' })
  await ui.press({ key: 'b' })
  expect(await ui.find({ key: 'opt:2' })).toBeDefined()
  expect(await ui.find({ key: 'row:d1' })).toBeUndefined()
  expect(seen.submitted).toEqual([])
  await ui.unmount()
})

test('the preview of a lone answer has no line about others, shows a condition, and fits a 9-row pane', async ($, on) => {
  await begin($, on, { ...CHOICE, scenario: 's' })
  const ui = await mountHolding($, rowsOf(9))
  await ui.press({ key: 'row:d1' })
  await ui.press({ key: 'c' })
  await ui.input({ key: 'answer', text: 'after CI is green' })
  await ui.press({ key: 'row:d1' })
  await ui.press({ key: 's' })
  const all = await texts(ui)
  expect(all.some((t: string) => /^Send this decision/.test(t))).toBe(true)
  expect(all.join('|')).not.toMatch(/stays? ready/)
  expect(lineTotal(await ui.drawn())).toBeLessThanOrEqual(9)
  await ui.unmount()
  const tall = await mountHolding($, rowsOf(40))
  expect(await texts(tall)).toContain('Condition: after CI is green')
  await tall.unmount()
})

test('s on an unanswered decision still opens the Send screen for everything ready', async ($, on) => {
  const seen = await begin($, on)
  await $.tool.call({ tool: ADD_TOOL, ...CHOICE, title: 'Second one' })
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  await ui.press({ key: 'opt:2' })
  await ui.press({ key: 'row:d2' })
  expect((await ui.find({ key: 's' }))?.text).toMatch(/send 1/)
  await ui.press({ key: 's' })
  expect(await ui.find({ key: 'tick:d1' })).toBeDefined()
  expect(seen.submitted).toEqual([])
  await ui.unmount()
})

/** Rows a drawn tree takes: a column stacks its children, a row is as tall as its tallest, a border adds two. */
function lineTotal(node: any): number {
  if (node === null || node === undefined || node === '' || typeof node === 'boolean') {
    return 0
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return 1
  }
  if (Array.isArray(node)) {
    return node.reduce((n: number, child: any) => n + lineTotal(child), 0)
  }
  if (node.type !== 'Box') {
    return 1
  }
  const children: any[] = (node.children ?? []).flat()
  const inner = node.props?.flexDirection === 'column' ? children.reduce((n: number, c: any) => n + lineTotal(c), 0) : Math.max(0, ...children.map((c: any) => lineTotal(c)))

  return inner + (node.props?.borderStyle ? 2 : 0)
}

// Every kind gets Something else (decisions 207, 230).

for (const [kind, count] of [['go-ahead', 2], ['assumption', 2], ['finding', 4]] as const) {
  test(`a ${kind} ends with ${count + 1}: Something else`, async ($, on) => {
    await begin($, on, { group: 'Code review', kind, title: 'Search ranking: exact matches sort low', scenario: 's', recommendation: { option: 1, reason: 'r' } })
    const ui = await mountHolding($, rowsOf(40))
    await ui.press({ key: 'row:d1' })
    const last = await ui.find({ key: `opt:${count + 1}` })
    expect(last?.text).toMatch(/Something else/)
    expect(last?.props.hotkey).toBe(String(count + 1))
    expect(await ui.find({ key: `opt:${count + 2}` })).toBeUndefined()
    await ui.unmount()
  })
}

test('on the assumptions batch 3 does nothing, and enter on a row opens it with Something else as 3', async ($, on) => {
  await begin($, on, { group: 'Code review', kind: 'assumption', title: 'Codes are 8 characters', scenario: 's' })
  await $.tool.call({ tool: ADD_TOOL, group: 'Code review', kind: 'assumption', title: 'Links never expire', scenario: 's' })
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'batch' })
  const hotkeys = (await ui.findAll({ type: 'Button' })).map((b: any) => b.props.hotkey).filter(Boolean)
  expect(hotkeys).toEqual(expect.arrayContaining(['1', '2']))
  expect(hotkeys).not.toContain('3')
  await ui.press({ key: 'batch:d1' })
  expect((await ui.find({ key: 'opt:3' }))?.text).toMatch(/Something else/)
  expect((await ui.find({ key: 'opt:1' }))?.props.autoFocus).toBe(true)
  await ui.unmount()
})


// Fixes from the branch review.

test('the one-decision preview draws send first, with the focus on it and no c key', async ($, on) => {
  const { ui } = await twoReady($, on)
  await ui.press({ key: 's' })
  const buttons = (await ui.findAll({ type: 'Button' })).map((b: any) => b.props.key)
  expect(buttons[0]).toBe('confirm')
  expect((await ui.find({ key: 'confirm' }))?.props.autoFocus).toBe(true)
  expect((await ui.find({ key: 'confirm' }))?.props.hotkey).toBeUndefined()
  expect((await ui.find({ key: 'b' }))?.props.hotkey).toBe('b')
  await ui.unmount()
})

test('compact at 49 columns: a 12-option decision keeps enter, c and Something else labelled, in 2 lines', async ($, on) => {
  await begin($, on, TWELVE_PLACES)
  const ui = await mountHolding($, { ...SCREEN, props: { ...SCREEN.props, bodyColumns: 49, scroll: { offset: 0, bodyRows: 9 } }, surface: 'terminal' as const })
  await ui.press({ key: 'row:d1' })
  const hints = (await ui.findAll({ type: 'Box' })).find((b: any) => b.props.key === 'hints')
  expect(hints).toBeDefined()
  const line = JSON.stringify(await ui.drawn())
  expect(line).toContain('choose 1')
  expect(line).toContain('condition')
  expect(line).toMatch(/something else/i)
  const rows = (await ui.findAll({ type: 'Box' })).filter((b: any) => /^hints:\d+$/.test(String(b.props.key)))
  expect(rows.length).toBeLessThanOrEqual(2)
  await ui.unmount()
})

test('a reply read on the decision screen is not new once the person leaves it', async ($, on) => {
  const seen = await begin($, on)
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  tick()
  edit(seen, 'd1', d => ({ ...d, thread: [{ who: 'claude', text: 'A reply while you were here.', at: new Date().toISOString() }] }))
  tick()
  await ui.press({ key: 'b' })
  expect((await ui.find({ key: 'row:d1' }))?.text).not.toMatch(/●/)
  await ui.unmount()
})

test('replacing a typed answer with an option reopens a dependent, and so does dropping a condition', async () => {
  const store = fakeStore()
  const base = { version: 1, section: 'needs-you', kind: 'choice', scenario: 's', options: [{ id: 1, label: 'A' }, { id: 2, label: 'B' }], sources: [], thread: [], revisions: [], createdAt: 't', updatedAt: 't', session: 'session-1' } as unknown as Decision
  await write(store, { ...base, id: 'd1', number: 1, title: 'First', dependsOn: [], state: 'ready', answer: { text: 'neither', answeredAt: 't' } })
  await write(store, { ...base, id: 'd2', number: 2, title: 'Second', dependsOn: ['d1'], state: 'ready', answer: { option: 2, answeredAt: 't' } })
  expect((await chooseAndReopen(store, (await readOne(store, 'd1'))!, 1))?.notice).toBe('d1 changed. Reopened d2.')
  await write(store, { ...(await readOne(store, 'd2'))!, state: 'ready', answer: { option: 2, answeredAt: 't' } })
  await write(store, { ...(await readOne(store, 'd1'))!, answer: { option: 1, condition: 'later', answeredAt: 't' } })
  expect((await chooseAndReopen(store, (await readOne(store, 'd1'))!, 1))?.notice).toBe('d1 changed. Reopened d2.')
  await write(store, { ...(await readOne(store, 'd2'))!, state: 'ready', answer: { option: 2, answeredAt: 't' } })
  expect((await chooseAndReopen(store, (await readOne(store, 'd1'))!, 1))?.notice).toBeUndefined()
  expect((await readOne(store, 'd2'))!.state).toBe('ready')
})

test('a held 1 is cancelled by any other key, so its timer never answers option 1', async () => {
  const values = new Map<string, { value: unknown; version: number }>()
  let fire: (() => void) | undefined
  const $ = {
    state: {
      get: async (ref: { key: string }) => values.get(ref.key) ?? { value: undefined, version: 0 },
      set: async (ref: { key: string }, value: unknown) => {
        const version = (values.get(ref.key)?.version ?? 0) + 1
        values.set(ref.key, { value, version })
        return { isSet: true, version }
      },
    },
    clock: { after: (_ms: number, fn: () => void) => void (fire = fn) },
    ui: { focus: async () => ({}) },
  }
  await setView($, v => ({ ...v, ring: 'opt:1' }))
  const d = { id: 'd1', options: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, label: `P${i + 1}` })) } as unknown as Decision
  const chosen: number[] = []
  await pressOption($, d, 1, async option => void chosen.push(option), 4)
  expect(fire).toBeDefined()
  cancelHeldDigit()
  fire!()
  expect(chosen).toEqual([])
  await pressOption($, d, 1, async option => void chosen.push(option), 4)
  fire!()
  expect(chosen).toEqual([1])
})

/** Lets a few milliseconds pass, so two times taken either side differ. */
function tick(): void {
  const until = Date.now() + 3
  while (Date.now() < until) {
    // waiting
  }
}

// Workstream 9: the decision screen in direction B (rows 251, 252, 258, 259, 262).

const allTexts = async (ui: any) => (await texts(ui)).join('\n')
const keysInOrder = async (ui: any) => (await ui.findAll({ type: 'Button' })).map((b: any) => String(b.props.key))
const minutesBefore = (n: number) => new Date(Date.now() - n * 60_000).toISOString()

test('a 120-character title is drawn whole across lines, with keys on at the right of the crumb line', async ($, on) => {
  const title = 'Activity API docs: still says the app events are six and appear on the site log, when there are now eight of them'
  expect(title.length).toBeGreaterThan(110)
  await begin($, on, { ...CHOICE, title })
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  const header = await ui.find({ key: 'header' })
  expect(header?.text.replace(/[▌\s]+/g, ' ')).toContain(title.split(' ').slice(-6).join(' '))
  expect(header?.text).not.toContain('…')
  expect((await ui.find({ key: 'crumb' }))?.text).toMatch(/keys on$/)
  expect((await ui.find({ key: 'crumb' }))?.text).not.toContain('…')
  await ui.unmount()
})

test('the header has the kind as an inverse label in its colour, and the crumb says how long ago it was asked', async ($, on) => {
  await begin($, on)
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  const label = (await ui.findAll({ type: 'Text' })).find((t: any) => t.text === ' CHOICE ')
  expect(label?.props.backgroundColor).toBe('suggestion')
  expect(label?.props.color).toBe('inverseText')
  expect((await ui.find({ key: 'crumb' }))?.text).toMatch(/^▌ d1 · Code review · asked just now/)
  expect((await ui.find({ key: 'crumb' }))?.text).not.toMatch(/answered/)
  await ui.unmount()
})

test('the crumb counts answers with dots for up to 5 in the group, and without them above that', async ($, on) => {
  await begin($, on)
  await $.tool.call({ tool: ADD_TOOL, ...CHOICE, title: 'Second one' })
  let ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  expect((await ui.find({ key: 'crumb' }))?.text.replace(/[▌\s]+/g, ' ')).toMatch(/· ○○ 0 of 2 answered/)
  await ui.press({ key: 'b' })
  await ui.unmount()
  for (let i = 0; i < 6; i++) {
    await $.tool.call({ tool: ADD_TOOL, ...CHOICE, title: `More ${i}` })
  }
  ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  expect((await ui.find({ key: 'crumb' }))?.text.replace(/[▌\s]+/g, ' ')).toMatch(/· 0 of 8 answered/)
  expect((await ui.find({ key: 'crumb' }))?.text).not.toMatch(/○/)
  await ui.unmount()
})

test('what a decision waits on and holds up sits under the header, and is no longer in the m lines', async ($, on) => {
  await begin($, on, { ...CHOICE, blocks: 'merging the branch' })
  await $.tool.call({ tool: ADD_TOOL, ...CHOICE, title: 'Second one', dependsOn: ['d1'] })
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  expect((await ui.find({ key: 'holds:d2' }))?.text).toMatch(/holds up d2 Second one ◆/)
  expect((await ui.find({ key: 'holds:blocks' }))?.text).toMatch(/holds up merging the branch/)
  expect(await allTexts(ui)).not.toMatch(/⚑ Blocks|Depends on:/)
  await ui.press({ key: 'b' })
  await ui.press({ key: 'row:d2' })
  expect((await ui.find({ key: 'waits:d1' }))?.text).toMatch(/waits on d1 Where the review comments go ◆/)
  await ui.unmount()
})

test('the ringed option has the selection background and no card border; Something else lines up with the options', async ($, on) => {
  await begin($, on)
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  expect((await ui.find({ key: 'card:2' }))?.props.borderStyle).toBeUndefined()
  expect(JSON.stringify(await ui.find({ key: 'line:2' }))).toContain('"backgroundColor":"subtle"')
  expect(JSON.stringify(await ui.find({ key: 'line:1' }))).not.toContain('"backgroundColor"')
  const one = (await ui.find({ key: 'line:1' }))!.text
  const other = (await ui.find({ key: 'line:3' }))!.text
  expect(one.indexOf('In the chat')).toBe(other.indexOf('Something else'))
  await ui.unmount()
})

test('the ask box has a border, and its placeholder is dim text before the field, not under the cursor', async ($, on) => {
  await begin($, on)
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  expect((await ui.find({ key: 'ask-box' }))?.props.borderStyle).toBe('round')
  expect((await ui.find({ key: 'ask-inline' }))?.props.placeholder).toBeUndefined()
  expect((await ui.findAll({ type: 'Text' })).find((t: any) => t.text === 'Ask Claude about this decision… ')?.props.dimColor).toBe(true)
  await ui.unmount()
})

test('the conversation reads as a chat: speaker and age, then the text on the same line', async ($, on) => {
  const seen = await begin($, on)
  edit(seen, 'd1', d => ({ ...d, thread: [{ who: 'person', text: 'would c work on findings too?', at: minutesBefore(2) }, { who: 'claude', text: 'Yes. c works on any highlighted option.', at: minutesBefore(0) }] }))
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  const reply = await ui.find({ key: 'talk:reply' })
  expect(reply?.text).toMatch(/^claude · now {2}Yes\. c works/)
  expect(JSON.stringify(reply)).toContain('"color":"claude"')
  await ui.unmount()
})

test('sources are links: a path to its file with the line in the label, a URL as it is', async ($, on) => {
  await begin($, on, { ...CHOICE, sources: [{ label: 'Park box', path: 'hooks/pane/decision.tsx:681' }, { label: 'The PR', path: 'https://github.com/o/pantry/pull/12' }] })
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  const links = (await ui.findAll({ type: 'Link' })).map((l: any) => l.props.href)
  expect(links).toEqual(expect.arrayContaining(['file:///work/pantry/hooks/pane/decision.tsx', 'https://github.com/o/pantry/pull/12']))
  expect(await allTexts(ui)).toContain('hooks/pane/decision.tsx:681')
  await ui.unmount()
})

test('backticks in a scenario draw as code, and a URL in it as a short link', async ($, on) => {
  await begin($, on, { ...CHOICE, scenario: 'The test calls `request()`, see https://github.com/o/pantry/pull/12 for the change.' })
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  expect((await ui.findAll({ type: 'Text' })).find((t: any) => t.text === 'request()')?.props.color).toBe('suggestion')
  expect(await allTexts(ui)).not.toContain('`request()`')
  expect((await ui.find({ type: 'Link' }))?.props.href).toBe('https://github.com/o/pantry/pull/12')
  await ui.unmount()
})

test('12 options at 49x9: every option is drawn with its key, the key line comes before them, and ↑↓ is offered', async ($, on) => {
  await begin($, on, TWELVE_PLACES)
  const ui = await mountHolding($, { ...SCREEN, props: { ...SCREEN.props, bodyColumns: 49, scroll: { offset: 0, bodyRows: 9 } }, surface: 'terminal' as const })
  await ui.press({ key: 'row:d1' })
  const keys = await keysInOrder(ui)
  for (let n = 1; n <= 13; n++) {
    expect(keys).toContain(`opt:${n}`)
  }
  expect(keys.indexOf('b')).toBeLessThan(keys.indexOf('opt:1'))
  expect(await allTexts(ui)).toMatch(/↑↓: more options/)
  expect(keys).not.toContain('digit:9')
  await ui.unmount()
})

test('a decision twice the pane tall draws every line, with nothing cut, and the key line near the top', async ($, on) => {
  const scenario = Array.from({ length: 30 }, (_, i) => `Sentence ${i + 1} of the scenario.`).join(' ')
  await begin($, on, { ...CHOICE, scenario })
  const ui = await mountHolding($, rowsOf(20))
  await ui.press({ key: 'row:d1' })
  const all = (await allTexts(ui)).replace(ASK_PLACEHOLDER, '')
  expect(all).toContain('Sentence 30 of the scenario.')
  expect(all).toContain('by hand afterwards')
  expect(all).toContain('the code it concerns')
  expect(all).not.toContain('…')
  const keys = await keysInOrder(ui)
  expect(keys.indexOf('b')).toBeLessThan(keys.indexOf('opt:1'))
  await ui.unmount()
})

test("the newest reply is drawn whole, even 12 lines of it on a 20-row pane", async ($, on) => {
  const seen = await begin($, on)
  const reply = Array.from({ length: 12 }, (_, i) => `Line ${i + 1} of the reply.`).join('\n')
  edit(seen, 'd1', d => ({ ...d, thread: [{ who: 'person', text: 'why?', at: minutesBefore(3) }, { who: 'claude', text: reply, at: minutesBefore(1) }] }))
  const ui = await mountHolding($, rowsOf(20))
  await ui.press({ key: 'row:d1' })
  const all = (await allTexts(ui)).replace(ASK_PLACEHOLDER, '')
  expect(all).toContain('Line 12 of the reply.')
  expect(all).not.toContain('…')
  await ui.unmount()
})

test('a tall pane with the detail shown puts a blank line between options; m hides it with the detail', async ($, on) => {
  await begin($, on)
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  expect(await ui.find({ key: 'gap:2' })).toBeDefined()
  expect(await ui.find({ key: 'gap:1' })).toBeUndefined()
  await ui.press({ key: 'm' })
  expect(await ui.find({ key: 'gap:2' })).toBeUndefined()
  await ui.unmount()
})

test('an open condition box is a bordered box indented under its option, with its line dim inside', async ($, on) => {
  await begin($, on)
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  await ui.press({ key: 'c' })
  const box = await ui.find({ key: 'answer-box' })
  expect(box?.props.borderStyle).toBe('round')
  expect(box?.props.marginLeft).toBe(5)
  expect(JSON.stringify(box)).toContain('"answer"')
  expect(JSON.stringify(box)).toContain("enter saves it, Claude isn't asked")
  await ui.unmount()
})

const WITH_WHY = {
  ...CHOICE,
  options: [
    { label: 'In the chat', changes: 'the comments stay here', why: 'nothing to set up', whyNot: 'nobody else sees them' },
    { label: 'As PR comments', changes: 'each finding sits on its line' },
  ],
}

test('why and why not draw under an option in full detail, in success and warning, through the inline renderer', async ($, on) => {
  await begin($, on, { ...WITH_WHY, options: [{ ...WITH_WHY.options[0]!, why: 'nothing to `set up`' }, WITH_WHY.options[1]!] })
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  const spans = (await ui.findAll({ type: 'Text' })) as any[]
  const plus = spans.find(t => /^\+ nothing to set up$/.test(t.text))
  const minus = spans.find(t => /^− nobody else sees them$/.test(t.text))
  expect(plus?.props.color).toBe('success')
  expect(minus?.props.color).toBe('warning')
  expect(spans.find(t => t.text === 'set up')?.props.color).toBe('suggestion')
  await ui.unmount()
})

test('an option without why or why not draws neither', async ($, on) => {
  await begin($, on)
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  expect(await allTexts(ui)).not.toMatch(/^[+−] /m)
  await ui.unmount()
})

test('with the detail hidden, why and why not show only under the highlighted option', async ($, on) => {
  await begin($, on, { ...WITH_WHY, recommendation: { option: 2, reason: 'r' } })
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  await ui.press({ key: 'm' })
  expect(await allTexts(ui)).not.toContain('nothing to set up')
  await ui.press({ key: 'opt:1' })
  expect(await allTexts(ui)).toContain('+ nothing to set up')
  await ui.unmount()
})

test('compact at 49x9 with why and why not keeps the key line at the top', async ($, on) => {
  await begin($, on, WITH_WHY)
  const ui = await mountHolding($, { ...SCREEN, props: { ...SCREEN.props, bodyColumns: 49, scroll: { offset: 0, bodyRows: 9 } }, surface: 'terminal' as const })
  await ui.press({ key: 'row:d1' })
  const keys = await keysInOrder(ui)
  expect(keys.indexOf('b')).toBeLessThan(keys.indexOf('opt:1'))
  await ui.unmount()
})

test('while the ring is in the ask box the key line shows only what works there', async ($, on) => {
  await begin($, on)
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  await ring($, 'ask-inline')
  // The keys stay drawn, dim and without their hotkeys, so the engine's ring index still lands on the box (row 285).
  for (const key of ['o', 'b', 'm', 't', 'a', 'c', 'p', 'h']) {
    expect(await ui.find({ key })).toBeDefined()
    expect((await ui.find({ key }))?.props.hotkey).toBeUndefined()
  }
  const all = await allTexts(ui)
  expect(all).toMatch(/enter: send to Claude/)
  expect(all).toMatch(/↑: back to the options/)
  await ui.unmount()
})

test('after a question is sent from the ask box the ring goes back to the highlighted option', async ($, on) => {
  const clock = mock.clock(on as any)
  const seen = await begin($, on)
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  await clock.advance(100)
  await ring($, 'ask-inline')
  await ui.input({ key: 'ask-inline', text: 'would c work on findings too?' })
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 30; j++) {
      await Promise.resolve()
    }
    await clock.advance(100)
  }
  expect(seen.submitted).toHaveLength(1)
  expect(await allTexts(ui)).not.toMatch(/send to Claude/)
  expect((await ui.find({ key: 'line:2' }))?.text).toMatch(/^▌›/)
  expect(await ui.find({ key: 'b' })).toBeDefined()
  await ui.unmount()
})

test('a sent decision shows when it went and the first line of what Claude did next, on the list and the decision', async ($, on) => {
  const seen = await begin($, on)
  const sentAt = new Date().toISOString()
  edit(seen, 'd1', d => ({ ...d, state: 'sent', sentAt, answer: { option: 2, answeredAt: sentAt }, thread: [{ who: 'receipt', text: 'Posted three PR comments.', at: sentAt }] }))
  const ui = await mountHolding($, rowsOf(40))
  const clock = sentAt.slice(11, 16)
  const local = new Date(sentAt)
  const hm = `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`
  expect(clock.length).toBe(5)
  expect((await ui.find({ key: 'under:d1' }))?.text).toMatch(new RegExp(`↗ sent ${hm} · 2 As PR comments`))
  expect((await ui.find({ key: 'receipt:d1' }))?.text).toMatch(/claude: Posted three PR comments\./)
  await ui.press({ key: 'row:d1' })
  const all = await allTexts(ui)
  expect(all).toContain(`↗ sent ${hm}`)
  expect(all).toContain('claude: Posted three PR comments.')
  await ui.unmount()
})

/** Answers `$.model.complete`: the triage prompt with `triage`, the problem prompt with a fixed line. Records each request. */
function smallModel(on: On, triage: string): any[] {
  const asked: any[] = []
  on('model.complete', (_: any, e: any) => {
    asked.push(e)
    return { value: { isAnswered: true, text: /HAND OVER/.test(e.system ?? '') ? triage : 'Review comments need a home' } }
  })

  return asked
}

test('auto: a question from the ask box goes to the small model with the session record, and its answer stays in the pane', async ($, on) => {
  const clock = mock.clock(on as any)
  const asked = smallModel(on, 'ANSWER\nA comment on the line it is about.')
  configure({ discussionReplies: 'auto' })
  try {
    const seen = await begin($, on)
    await $.tool.call({ tool: SESSION_TOOL, title: 'Pantry importer review', summary: 'Reviewing the recipe importer.', now: { text: 'Choosing where comments go' } })
    const ui = await mountHolding($, rowsOf(40))
    await ui.press({ key: 'row:d1' })
    await clock.advance(100)
    await ring($, 'ask-inline')
    await ui.input({ key: 'ask-inline', text: 'what does a PR comment look like?' })
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 30; j++) {
        await Promise.resolve()
      }
      await clock.advance(100)
    }
    const triage = asked.find(e => /HAND OVER/.test(e.system ?? ''))
    expect(triage?.prompt).toContain('Title: Pantry importer review')
    expect(triage?.prompt).toContain('Summary: Reviewing the recipe importer.')
    expect(triage?.prompt).toContain('Now: Choosing where comments go')
    expect(seen.submitted).toEqual([])
    expect((await ui.find({ key: 'talk:reply' }))?.text).toMatch(/^quick answer · now {2}A comment on the line/)
    await ui.unmount()
  } finally {
    configure({})
  }
})

test('a quick answer from triage reads "quick answer", dim, and r asks the main session instead, once', async ($, on) => {
  const seen = await begin($, on)
  edit(seen, 'd1', d => ({
    ...d,
    thread: [
      { who: 'person', text: 'what does a PR comment look like?', at: minutesBefore(3) },
      { who: 'quick', via: 'triage', text: 'A note on the line it is about.', at: minutesBefore(2) },
    ],
  }))
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  expect((await ui.find({ key: 'talk:reply' }))?.text).toMatch(/^quick answer · 2m {2}A note on the line/)
  const speaker = (await ui.findAll({ type: 'Text' })).find((t: any) => t.text === 'quick answer')
  expect(speaker?.props.color).toBe('claude')
  expect(speaker?.props.dimColor).toBe(true)
  expect((await ui.find({ key: 'r' }))?.text).toMatch(/ask the main session/)
  await ui.press({ key: 'r' })
  expect(seen.submitted).toEqual(['On decision 1 · Where the review comments go: what does a PR comment look like?'])
  expect(await ui.find({ key: 'r' })).toBeUndefined()
  await ui.unmount()
})

test('a reply the person asked the quick model for keeps its name and has no r', async ($, on) => {
  const seen = await begin($, on)
  edit(seen, 'd1', d => ({
    ...d,
    thread: [
      { who: 'person', text: 'which is cheaper?', at: minutesBefore(3) },
      { who: 'quick', text: 'The chat.', at: minutesBefore(2) },
    ],
  }))
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  expect((await ui.find({ key: 'talk:reply' }))?.text).toMatch(/^quick model · 2m/)
  expect(await ui.find({ key: 'r' })).toBeUndefined()
  await ui.unmount()
})

test('the problem line sits under the title in bold, with ◇ when the small model wrote it', async ($, on) => {
  const seen = await begin($, on, { ...CHOICE, problem: 'Review comments need a home the team reads' })
  let ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  const header = (await ui.find({ key: 'header' }))!.text
  expect(header.indexOf('Where the review comments go')).toBeLessThan(header.indexOf('Review comments need a home'))
  expect(header.indexOf('Review comments need a home')).toBeLessThan(header.indexOf('d1 · Code review'))
  expect(header).not.toContain('◇')
  const line = (await ui.findAll({ type: 'Text' })).find((t: any) => t.text.startsWith('Review comments need a home'))
  expect(line?.props.bold).toBe(true)
  await ui.press({ key: 'b' })
  await ui.unmount()
  edit(seen, 'd1', d => ({ ...d, problemBy: 'model' }))
  ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  expect((await ui.find({ key: 'header' }))!.text.replace(/[▌\s]+/g, ' ')).toContain('◇ Review comments need a home the team reads')
  await ui.unmount()
})

test('the focusable keys above the ask box are the same before and after the ring moves into it', async ($, on) => {
  await begin($, on)
  const ui = await mountHolding($, rowsOf(40))
  await ui.press({ key: 'row:d1' })
  const before = await keysInOrder(ui)
  const inputsBefore = (await ui.findAll({ type: 'Input' })).map((i: any) => String(i.props.key))
  expect(inputsBefore).toEqual(['ask-inline'])
  await ring($, 'ask-inline')
  expect(await keysInOrder(ui)).toEqual(before)
  expect((await ui.findAll({ type: 'Input' })).map((i: any) => String(i.props.key))).toEqual(inputsBefore)
  await ui.unmount()
})
