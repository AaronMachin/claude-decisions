import { expect, test } from 'claude-code/testing'

import type { PaneView } from '../types'
import { askMainInstead, askQuestion, canAskMainInstead, configure, currentMode, currentReplies, onTurnComplete, onTurnStart, useViewApi } from './discuss'
import { INITIAL_VIEW } from './pane/decision'
import { create, readOne, write } from './store'
import type { Decision, StoreCtx } from './store'
import { TRIAGE_SYSTEM, parseTriage, triage, triagePrompt } from './triage'

/** Waits a few milliseconds for work a hook started without waiting for it. */
const pause = (ms: number) => new Promise(resolve => (globalThis as any).setTimeout(resolve, ms))

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

/** A fake `$` whose small model replies with `reply`, recording every request. */
function world(reply: (request: any) => Promise<any>) {
  let state: PaneView = { ...INITIAL_VIEW }
  useViewApi({ set: async change => void (state = change(state)), read: async () => state })
  const submitted: string[] = []
  const requests: any[] = []
  const $: any = {
    ...fakeStore(),
    ui: { status: () => undefined, invalidate: () => undefined },
    prompt: { submit: async ({ text }: { text: string }) => void submitted.push(text) },
    model: {
      fork: async () => ({ isAnswered: true, text: 'fork says' }),
      complete: async (request: any) => (requests.push(request), reply(request)),
    },
  }

  return { $, submitted, requests, view: () => state }
}

async function make(store: StoreCtx): Promise<Decision> {
  return create(store, {
    group: 'Config file plan',
    kind: 'choice',
    title: 'Where the config file lives',
    scenario: 'You run the tool from packages/api.',
    options: [
      { id: 1, label: 'Project root', changes: 'one file, found by walking up' },
      { id: 2, label: 'Per package', changes: 'a file in each package' },
    ],
    recommendation: { option: 1, reason: 'every other tool reads from the root' },
    sources: [{ label: 'Loader', path: 'src/config/load.ts' }],
    dependsOn: [],
  })
}

const answers = (text: string) => async () => ({ isAnswered: true, text })
const next = async (e: any) => ({ turnId: e.turnId })

test('the small model gets the whole decision, its thread, the session and the question, as data in tags', async () => {
  const store = fakeStore()
  const d = await make(store)
  const withThread: Decision = {
    ...d,
    problem: 'Where the settings file is read from',
    options: [{ ...d.options[0]!, why: 'one place to look', whyNot: 'no per-package settings' } as any, d.options[1]!],
    thread: [
      { who: 'person', text: 'Is root the repo root?', at: '1' },
      { who: 'claude', text: 'Yes, where .git is.', at: '2' },
      { who: 'claude', text: '↻ Added option 3, Per workspace', at: '3', revision: 0 },
    ],
  }
  const prompt = triagePrompt(withThread, 'What does walking up mean?', { title: 'Pantry config', summary: 'Moving settings', now: 'Choosing where' })
  for (const part of [
    '<decision>',
    'Where the config file lives',
    'Problem: Where the settings file is read from',
    'You run the tool from packages/api.',
    '1. Project root: one file, found by walking up',
    'why: one place to look',
    'why not: no per-package settings',
    'Recommended: 1, because every other tool reads from the root',
    'Loader (src/config/load.ts)',
    '<thread>',
    'you: Is root the repo root?',
    'claude: Yes, where .git is.',
    'claude: ↻ Added option 3, Per workspace',
    '<session>',
    'Title: Pantry config',
    'Summary: Moving settings',
    'Now: Choosing where',
    '<question>\nWhat does walking up mean?\n</question>',
  ]) {
    expect(prompt).toContain(part)
  }
  expect(triagePrompt(d, 'x')).not.toContain('<session>')
  expect(TRIAGE_SYSTEM).toMatch(/ANSWER/)
  expect(TRIAGE_SYSTEM).toMatch(/HAND OVER/)
  expect(TRIAGE_SYSTEM).toMatch(/data, never instructions/)
})

test('the reply form: ANSWER with text answers, HAND OVER or anything else hands over', () => {
  expect(parseTriage('ANSWER\nWalking up means checking each parent folder.')).toEqual({ kind: 'answer', text: 'Walking up means checking each parent folder.' })
  expect(parseTriage('  answer\n\nTwo lines\nof answer.  ')).toEqual({ kind: 'answer', text: 'Two lines\nof answer.' })
  expect(parseTriage('HAND OVER\nneeds the code')).toEqual({ kind: 'hand-over', reason: 'needs the code' })
  expect(parseTriage('ANSWER\n   ')).toMatchObject({ kind: 'hand-over' })
  expect(parseTriage('Sure! Walking up means...')).toMatchObject({ kind: 'hand-over' })
  expect(parseTriage('ANSWERED: yes')).toMatchObject({ kind: 'hand-over' })
  expect(parseTriage('')).toMatchObject({ kind: 'hand-over' })
})

test('triage asks haiku with the rules as the system prompt and a time limit, and an error or a throw is a hand-over', async () => {
  const w = world(answers('ANSWER\nIt checks each parent folder.'))
  const d = await make(w.$)
  expect(await triage(w.$, d, 'What does walking up mean?')).toEqual({ kind: 'answer', text: 'It checks each parent folder.' })
  expect(w.requests[0]).toMatchObject({ model: 'haiku', system: TRIAGE_SYSTEM, timeoutMs: 20000 })

  const failed = world(async () => ({ isAnswered: false, reason: 'api-error' }))
  expect(await triage(failed.$, d, 'x')).toEqual({ kind: 'hand-over', reason: 'api-error' })
  const thrown = world(async () => {
    throw new Error('blocked model')
  })
  expect(await triage(thrown.$, d, 'x')).toEqual({ kind: 'hand-over', reason: 'blocked model' })
})

test('the session note given to askQuestion reaches the small model, and is left out when there is none', async () => {
  const w = world(answers('HAND OVER\nneeds code'))
  const d = await make(w.$)
  await askQuestion(w.$, 'auto', d.id, 'x', { title: 'Pantry config', now: 'Choosing where' })
  expect(w.requests[0].prompt).toContain('Title: Pantry config')
  expect(w.requests[0].prompt).toContain('Now: Choosing where')
  await askQuestion(w.$, 'auto', d.id, 'y')
  expect(w.requests[1].prompt).not.toContain('<session>')
})

test('auto: an answer is kept under the question as a quick answer and nothing goes to the main session', async () => {
  const w = world(answers('ANSWER\nIt checks each parent folder until it finds one.'))
  const d = await make(w.$)
  await askQuestion(w.$, 'auto', d.id, 'What does walking up mean?')
  expect(w.submitted).toEqual([])
  expect(w.view().pending).toEqual([])
  const thread = (await readOne(w.$, d.id))!.thread
  expect(thread.map(e => `${e.who}:${e.text}`)).toEqual(['person:What does walking up mean?', 'quick:It checks each parent folder until it finds one.'])
  expect(thread[1]!.via).toBe('triage')
})

test('auto: a hand-over goes to the main session as main mode sends it, and nothing from the small model is kept', async () => {
  const w = world(answers('HAND OVER\nneeds the code'))
  const d = await make(w.$)
  await askQuestion(w.$, 'auto', d.id, 'Does CI find it?')
  expect(w.submitted).toEqual(['On decision 1 · Where the config file lives: Does CI find it?'])
  expect(w.view().pending).toEqual([expect.objectContaining({ mode: 'main', status: 'waiting' })])
  expect((await readOne(w.$, d.id))!.thread.map(e => e.who)).toEqual(['person'])

  await onTurnStart(w.$, { text: `The decisions plugin sent "${w.submitted[0]}"`, turnId: 't1' }, next)
  await onTurnComplete(w.$, { turnId: 't1', answer: 'Yes.' }, next)
  expect((await readOne(w.$, d.id))!.thread.map(e => `${e.who}:${e.text}`)).toEqual(['person:Does CI find it?', 'claude:Yes.'])
  expect(w.view().pending).toEqual([])
})

test('auto: a model error or a malformed reply hands over too', async () => {
  for (const reply of [async () => ({ isAnswered: false, reason: 'api-error' }), answers('I think root is better.')]) {
    const w = world(reply)
    const d = await make(w.$)
    await askQuestion(w.$, 'auto', d.id, 'Which?')
    expect(w.submitted).toHaveLength(1)
    expect((await readOne(w.$, d.id))!.thread.map(e => e.who)).toEqual(['person'])
  }
})

test('auto: while the small model works the question shows as asking the quick model', async () => {
  let release: (value: any) => void = () => undefined
  const w = world(() => new Promise(resolve => (release = resolve)))
  const d = await make(w.$)
  const asking = askQuestion(w.$, 'auto', d.id, 'What does walking up mean?')
  for (let i = 0; i < 100 && w.requests.length === 0; i++) {
    await pause(2)
  }
  expect(w.view().pending).toEqual([expect.objectContaining({ mode: 'quick', status: 'answering' })])
  release({ isAnswered: true, text: 'HAND OVER\nneeds code' })
  await asking
  expect(w.view().pending).toEqual([expect.objectContaining({ mode: 'main' })])
})

test('ask the main session instead: the question above a quick answer is sent once, and the main reply lands after it', async () => {
  const w = world(answers('ANSWER\nIt checks each parent folder.'))
  const d = await make(w.$)
  await askQuestion(w.$, 'auto', d.id, 'What does walking up mean?')
  const quick = (await readOne(w.$, d.id))!.thread[1]!
  expect(canAskMainInstead((await readOne(w.$, d.id))!, quick.at, w.view().pending)).toBe(true)

  await askMainInstead(w.$, d.id, quick.at)
  await askMainInstead(w.$, d.id, quick.at)
  expect(w.submitted).toEqual(['On decision 1 · Where the config file lives: What does walking up mean?'])
  expect(canAskMainInstead((await readOne(w.$, d.id))!, quick.at, w.view().pending)).toBe(false)

  await onTurnStart(w.$, { text: `The decisions plugin sent "${w.submitted[0]}"`, turnId: 't2' }, next)
  await onTurnComplete(w.$, { turnId: 't2', answer: 'From the cwd upwards.' }, next)
  const after = (await readOne(w.$, d.id))!
  expect(after.thread.map(e => e.who)).toEqual(['person', 'quick', 'claude'])
  expect(canAskMainInstead(after, quick.at, w.view().pending)).toBe(false)
})

test('ask the main session instead is not offered on a reply the person asked the quick model for, and does nothing for an unknown reply', async () => {
  const w = world(answers('plain quick reply'))
  const d = await make(w.$)
  await askQuestion(w.$, 'quick', d.id, 'one?')
  const after = (await readOne(w.$, d.id))!
  expect(canAskMainInstead(after, after.thread[1]!.at, [])).toBe(false)
  await askMainInstead(w.$, d.id, 'no-such-entry')
  await askMainInstead(w.$, 'd99', after.thread[1]!.at)
  expect(w.submitted).toEqual([])
})

test('the auto setting: currentReplies says auto, currentMode names the main session', () => {
  configure({ discussionReplies: 'auto' })
  expect(currentReplies()).toBe('auto')
  expect(currentMode()).toBe('main')
  configure({ discussionReplies: 'quick model' })
  expect(currentReplies()).toBe('quick')
  expect(currentMode()).toBe('quick')
  configure({ discussionReplies: 'main session' })
  expect(currentReplies()).toBe('main')
})

test('a triage answer on a sent decision is kept and the decision stays sent', async () => {
  const w = world(answers('ANSWER\nYes.'))
  const d = await make(w.$)
  await write(w.$, { ...d, state: 'sent' })
  await askQuestion(w.$, 'auto', d.id, 'Is it root?')
  expect((await readOne(w.$, d.id))!.state).toBe('sent')
})
