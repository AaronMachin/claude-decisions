import { expect, test } from 'claude-code/testing'

import { INITIAL_VIEW } from './pane/decision'
import type { PaneView } from '../types'
import { PLACEHOLDER, RESENT_NOTICE, RUN, addWaiter, askMain, askQuestion, configure, currentMode, onTurnComplete, onTurnStart, resendToFork, useViewApi, askModel, isBusy, markLate, routeComplete, routeStart, sentText, contextFor, markAnswered, recordQuestion, recordReply } from './discuss'
import { buildAnswerPrompt } from './send'
import { create, readOne, write } from './store'
import type { Decision, StoreCtx } from './store'

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

async function make(store: StoreCtx): Promise<Decision> {
  return create(store, {
    group: 'Config file plan',
    kind: 'choice',
    title: 'Where the config file lives',
    scenario: 'You run the tool from packages/api.',
    options: [
      { id: 1, label: 'Project root' },
      { id: 2, label: 'Per package' },
    ],
    recommendation: { option: 1, reason: 'because' },
    sources: [],
    dependsOn: [],
  })
}

test('a question moves an open decision to live and leaves ready and sent as they are', async () => {
  const store = fakeStore()
  const d = await make(store)
  const q = await recordQuestion(store, d.id, 'Does a monorepo change this?')
  const after = await readOne(store, d.id)
  expect(after?.state).toBe('live')
  expect(after?.thread).toEqual([{ who: 'person', text: 'Does a monorepo change this?', at: q!.asked }])

  await write(store, { ...after!, state: 'sent' })
  await recordQuestion(store, d.id, 'And now?')
  expect((await readOne(store, d.id))?.state).toBe('sent')
  expect(await recordQuestion(store, 'd99', 'x')).toBeUndefined()
})

test('a reply goes directly under its own question, even when a later question was asked first', async () => {
  const store = fakeStore()
  const d = await make(store)
  const q1 = await recordQuestion(store, d.id, 'first')
  const q2 = await recordQuestion(store, d.id, 'second')
  await recordReply(store, d.id, q1!.asked, 'claude', 'answer one')
  await recordReply(store, d.id, q2!.asked, 'fork', 'answer two')
  const texts = (await readOne(store, d.id))!.thread.map(e => `${e.who}:${e.text}`)
  expect(texts).toEqual(['person:first', 'claude:answer one', 'person:second', 'fork:answer two'])
})

test('a reply to a sent decision is kept and its state stays sent; an unknown question appends', async () => {
  const store = fakeStore()
  const d = await make(store)
  await write(store, { ...d, state: 'sent' })
  expect(await recordReply(store, d.id, 'nope', 'quick', 'late')).toBe(true)
  const after = await readOne(store, d.id)
  expect(after?.state).toBe('sent')
  expect(after?.thread.map(e => e.text)).toEqual(['late'])
  expect(await recordReply(store, 'd99', 'x', 'claude', 'y')).toBe(false)
})

test('marking answered works on open, live and parked decisions only, and the answer prompt carries the thread', async () => {
  const store = fakeStore()
  const d = await make(store)
  const q = await recordQuestion(store, d.id, 'Does CI find it?')
  await recordReply(store, d.id, q!.asked, 'claude', 'Yes.')
  const withRevision = (await readOne(store, d.id))!
  await write(store, { ...withRevision, thread: [...withRevision.thread, { who: 'claude', text: '↻ Added option 3', at: 'x', revision: 0 }] })

  expect(await markAnswered(store, d.id)).toBe(true)
  const done = (await readOne(store, d.id))!
  expect(done.state).toBe('ready')
  expect(done.answer?.option).toBeUndefined()
  const prompt = buildAnswerPrompt([done])
  expect(prompt).toContain('Chosen: settled in the discussion, see below')
  expect(prompt).toContain('  person: Does CI find it?')
  expect(prompt).toContain('  claude: Yes.')
  expect(prompt).toContain('  claude: ↻ Added option 3')

  expect(await markAnswered(store, d.id)).toBe(false)
  await write(store, { ...done, state: 'sent' })
  expect(await markAnswered(store, d.id)).toBe(false)
})

test('the fork gets the decision, the question and the no-files warning; the quick model gets haiku and the decision only', async () => {
  const d = await make(fakeStore())
  const calls: any[] = []
  const $ = {
    model: {
      fork: async (r: any) => (calls.push(['fork', r]), { isAnswered: true, text: 'forked' }),
      complete: async (r: any) => (calls.push(['complete', r]), { isAnswered: true, text: 'quick' }),
    },
  }
  expect(await askModel($, 'fork', d, 'Why root?')).toEqual({ ok: true, text: 'forked' })
  expect(await askModel($, 'quick', d, 'Why root?')).toEqual({ ok: true, text: 'quick' })
  const fork = calls[0][1].prompt as string
  expect(fork).toContain(contextFor(d))
  expect(fork).toContain('1. Project root')
  expect(fork).toContain('Question: Why root?')
  expect(fork).toContain("can't read project files")
  expect(calls[1][1].model).toBe('haiku')
  expect(calls[1][1].prompt).toContain('Where the config file lives')
  expect(calls[1][1].prompt).not.toContain('files')
})

test('an unanswered or rejected model call is a reason, not a throw', async () => {
  const d = await make(fakeStore())
  const none = { model: { fork: async () => ({ isAnswered: false, reason: 'nothing-to-fork' }), complete: async () => ({ isAnswered: false, reason: 'api-error' }) } }
  expect(await askModel(none, 'fork', d, 'q')).toEqual({ ok: false, reason: 'nothing-to-fork' })
  expect(await askModel(none, 'quick', d, 'q')).toEqual({ ok: false, reason: 'api-error' })
  const boom = { model: { fork: async () => { throw new Error('aborted') }, complete: async () => ({}) } }
  expect(await askModel(boom, 'fork', d, 'q')).toEqual({ ok: false, reason: 'aborted' })
})

const framed = (sent: string) => `The decisions plugin sent a message:\n${sent}\n\nThis is how Claude Code surfaces a prompt a plugin submits between turns.`
const framedOld = (sent: string) => `The decisions plugin sent "${sent}"`

test('the reply is the sent turn, not the turn that happens to end first', () => {
  const sent = sentText({ number: 1, title: 'Where it lives' }, 'Does CI find it?')
  addWaiter({ decisionId: 'd1', asked: 'a1', sent })
  expect(routeStart({ text: 'read the eight files', turnId: 't1' })).toBeUndefined()
  expect(isBusy()).toBe(true)
  expect(routeStart({ text: framed(sent), turnId: 't2' })?.asked).toBe('a1')
  expect(routeComplete({ turnId: 't1', answer: 'the earlier task' })).toBeUndefined()
  expect(routeComplete({ turnId: 't2', answer: 'Yes.' })).toMatchObject({ text: 'Yes.', waiter: { asked: 'a1' } })
  expect(isBusy()).toBe(false)
})

test('two queued questions each get their own reply, whichever turn completes first', () => {
  const s1 = sentText({ number: 2, title: 'T' }, 'first?')
  const s2 = sentText({ number: 2, title: 'T' }, 'second?')
  addWaiter({ decisionId: 'd2', asked: 'b1', sent: s1 })
  addWaiter({ decisionId: 'd2', asked: 'b2', sent: s2 })
  expect(routeStart({ text: framed(s1), turnId: 'u1' })?.asked).toBe('b1')
  expect(routeStart({ text: framed(s2), turnId: 'u2' })?.asked).toBe('b2')
  expect(routeComplete({ turnId: 'u2', answer: 'two' })?.waiter.asked).toBe('b2')
  expect(routeComplete({ turnId: 'u1', answer: 'one' })?.waiter.asked).toBe('b1')
})

test('a subagent turn is ignored, and a question that contains quotes, newlines and On decision still matches', () => {
  const sent = sentText({ number: 3, title: 'T' }, 'He said "On decision 9"\nwhat now?')
  addWaiter({ decisionId: 'd3', asked: 'c1', sent })
  expect(routeStart({ text: framed(sent), turnId: 'v0', agentId: 'agent1' })).toBeUndefined()
  expect(routeComplete({ turnId: 'v0', agentId: 'agent1', answer: 'x' })).toBeUndefined()
  expect(routeStart({ text: framed(sent), turnId: 'v1' })?.asked).toBe('c1')
  expect(routeComplete({ turnId: 'v1', answer: '   ' })?.text).toBe(PLACEHOLDER)
})

test('a waiter marked late still returns its reply, flagged late', () => {
  const sent = sentText({ number: 4, title: 'T' }, 'q?')
  addWaiter({ decisionId: 'd4', asked: 'e1', sent })
  markLate('e1', 'd4')
  routeStart({ text: framed(sent), turnId: 'w1' })
  expect(routeComplete({ turnId: 'w1', answer: 'late one' })?.waiter.late).toBe(true)
})

/** A fake `$`: the store, the calls a reply makes, and the pane's state kept in memory. */
function world(model: Partial<{ fork: any; complete: any }> = {}, submit?: (text: string) => Promise<unknown>) {
  let state: PaneView = { ...INITIAL_VIEW }
  useViewApi({
    set: async change => void (state = change(state)),
    read: async () => state,
  })
  const submitted: string[] = []
  const $: any = {
    ...fakeStore(),
    ui: { status: () => undefined, invalidate: () => undefined },
    prompt: { submit: async ({ text }: { text: string }) => (submitted.push(text), submit ? submit(text) : undefined) },
    model: {
      fork: model.fork ?? (async () => ({ isAnswered: true, text: 'fork says' })),
      complete: model.complete ?? (async () => ({ isAnswered: true, text: 'quick says' })),
    },
  }

  return { $, submitted, view: () => state, setView: async (change: (v: PaneView) => PaneView) => void (state = change(state)) }
}

const next = async (e: any) => ({ turnId: e.turnId })

test('main while Claude is idle is waiting, answering when its turn starts, and cleared with the reply under the question', async () => {
  const w = world()
  const d = await make(w.$)
  await askQuestion(w.$, 'main', d.id, 'Does CI find it?')
  expect(w.submitted).toEqual([`On decision 1 · Where the config file lives: Does CI find it?`])
  expect(w.view().pending.map(p => p.status)).toEqual(['waiting'])

  await onTurnStart(w.$, { text: `The decisions plugin sent "${w.submitted[0]}"`, turnId: 'a1' }, next)
  expect(w.view().pending.map(p => p.status)).toEqual(['answering'])
  await onTurnComplete(w.$, { turnId: 'a1', answer: 'Yes, it does.' }, next)
  expect(w.view().pending).toEqual([])
  expect((await readOne(w.$, d.id))!.thread.map(e => `${e.who}:${e.text}`)).toEqual(['person:Does CI find it?', 'claude:Yes, it does.'])
})

test('main while a turn is running is queued, and an unrelated turn ending does not answer it', async () => {
  const w = world()
  const d = await make(w.$)
  await onTurnStart(w.$, { text: 'read the eight files', turnId: 'busy' }, next)
  await askQuestion(w.$, 'main', d.id, 'Which is cheaper?')
  expect(w.view().pending.map(p => p.status)).toEqual(['queued'])
  await onTurnComplete(w.$, { turnId: 'busy', answer: 'the earlier task' }, next)
  expect(w.view().pending.map(p => p.status)).toEqual(['queued'])
  expect((await readOne(w.$, d.id))!.thread).toHaveLength(1)
  await onTurnStart(w.$, { text: `The decisions plugin sent "${w.submitted[0]}"`, turnId: 'mine' }, next)
  await onTurnComplete(w.$, { turnId: 'mine', answer: 'Root.' }, next)
  expect(w.view().pending).toEqual([])
  expect((await readOne(w.$, d.id))!.thread.map(e => e.text)).toEqual(['Which is cheaper?', 'Root.'])
})

test('fork and quick write their reply under the question, and a failed call is kept with its reason', async () => {
  const w = world({ complete: async () => ({ isAnswered: false, reason: 'api-error' }) })
  const d = await make(w.$)
  await askQuestion(w.$, 'fork', d.id, 'one?')
  expect(w.view().pending).toEqual([])
  expect((await readOne(w.$, d.id))!.thread.map(e => `${e.who}:${e.text}`)).toEqual(['person:one?', 'fork:fork says'])
  await askQuestion(w.$, 'quick', d.id, 'two?')
  expect(w.view().pending).toEqual([expect.objectContaining({ mode: 'quick', status: 'failed', reason: 'api-error' })])
})

test('f sends a queued question to the fork, and the late main reply still lands under the same question', async () => {
  const w = world()
  const d = await make(w.$)
  await onTurnStart(w.$, { text: 'busy', turnId: 'busy' }, next)
  await askQuestion(w.$, 'main', d.id, 'queued one?')
  await resendToFork(w.$)
  expect(w.view().notice).toBe(RESENT_NOTICE)
  expect(w.view().pending).toEqual([])
  expect((await readOne(w.$, d.id))!.thread.map(e => `${e.who}:${e.text}`)).toEqual(['person:queued one?', 'fork:fork says'])
  await onTurnComplete(w.$, { turnId: 'busy', answer: 'x' }, next)
  await onTurnStart(w.$, { text: `The decisions plugin sent "${w.submitted[0]}"`, turnId: 'late' }, next)
  await onTurnComplete(w.$, { turnId: 'late', answer: 'late main reply' }, next)
  expect((await readOne(w.$, d.id))!.thread.map(e => `${e.who}:${e.text}`)).toEqual(['person:queued one?', 'fork:fork says', 'claude:late main reply'])
  expect(w.view().pending).toEqual([])
})

test('a pending question from another load of the mod is resendable, and a rejected submit is failed', async () => {
  const w = world({}, async () => { throw new Error('no session') })
  const d = await make(w.$)
  await askQuestion(w.$, 'main', d.id, 'will this send?')
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
  }
  expect(w.view().pending[0]).toMatchObject({ status: 'failed', reason: 'no session' })

  const w2 = world()
  const d2 = await make(w2.$)
  const q = await recordQuestion(w2.$, d2.id, 'orphan?')
  let state: PaneView = { ...INITIAL_VIEW, pending: [{ asked: q!.asked, decisionId: d2.id, mode: 'main', status: 'answering', run: RUN + 'old' }] }
  useViewApi({ set: async c => void (state = c(state)), read: async () => state })
  await resendToFork(w2.$)
  expect(state.pending).toEqual([])
  expect((await readOne(w2.$, d2.id))!.thread.map(e => e.who)).toEqual(['person', 'fork'])
})

test('m asks the newest fork-answered question again to the main session', async () => {
  const w = world()
  const d = await make(w.$)
  await askQuestion(w.$, 'fork', d.id, 'can you see the files?')
  let state: PaneView = { ...INITIAL_VIEW, decisionId: d.id }
  useViewApi({ set: async c => void (state = c(state)), read: async () => state })
  await askMain(w.$)
  expect(w.submitted).toEqual(['On decision 1 · Where the config file lives: can you see the files?'])
  expect(state.pending[0]).toMatchObject({ mode: 'main', status: 'waiting' })
})

test('the setting picks the mode', () => {
  configure({})
  expect(currentMode()).toBe('main')
  configure({ discussionReplies: 'fork' })
  expect(currentMode()).toBe('fork')
  configure({ discussionReplies: 'quick model' })
  expect(currentMode()).toBe('quick')
  configure({ discussionReplies: 'main session' })
  expect(currentMode()).toBe('main')
})

test('the older framing of the sent text is matched too, and a plugin-framed turn with no waiter is ignored', () => {
  const sent = sentText({ number: 5, title: 'T' }, 'old framing?')
  addWaiter({ decisionId: 'd5', asked: 'f1', sent })
  expect(routeStart({ text: framedOld(sent), turnId: 'x1' })?.asked).toBe('f1')
  expect(routeStart({ text: framed(sentText({ number: 5, title: 'T' }, 'nobody asked')), turnId: 'x2' })).toBeUndefined()
  expect(routeComplete({ turnId: 'x1', answer: 'ok' })?.text).toBe('ok')
})

test('a second reply to the same question goes after the first, and before the next question', async () => {
  const store = fakeStore()
  const d = await make(store)
  const q1 = await recordQuestion(store, d.id, 'first')
  await recordQuestion(store, d.id, 'second')
  await recordReply(store, d.id, q1!.asked, 'fork', 'fork reply')
  await recordReply(store, d.id, q1!.asked, 'claude', 'late main reply')
  expect((await readOne(store, d.id))!.thread.map(e => `${e.who}:${e.text}`)).toEqual([
    'person:first',
    'fork:fork reply',
    'claude:late main reply',
    'person:second',
  ])
})

test('a failed submit takes its waiter out, so a later m is answered and cleared', async () => {
  let failFirst = true
  const w = world({}, async () => {
    if (failFirst) {
      failFirst = false
      throw new Error('no session')
    }
  })
  const d = await make(w.$)
  await askQuestion(w.$, 'main', d.id, 'same words?')
  for (let i = 0; i < 6; i++) {
    await Promise.resolve()
  }
  expect(w.view().pending[0]).toMatchObject({ status: 'failed' })
  await w.setView(v => ({ ...v, decisionId: d.id }))
  await resendToFork(w.$)
  await askMain(w.$)
  expect(w.submitted).toHaveLength(2)
  await onTurnStart(w.$, { text: `The decisions plugin sent a message:\n${w.submitted[1]}`, turnId: 'again' }, next)
  await onTurnComplete(w.$, { turnId: 'again', answer: 'answered' }, next)
  expect(w.view().pending.filter(p => p.mode === 'main')).toEqual([])
})

test('f resends the open decision\'s own question, not an older one from another decision', async () => {
  const w = world()
  const d1 = await make(w.$)
  const d2 = await make(w.$)
  await onTurnStart(w.$, { text: 'busy', turnId: 'busy' }, next)
  await askQuestion(w.$, 'main', d1.id, 'one?')
  await askQuestion(w.$, 'main', d2.id, 'two?')
  await w.setView(v => ({ ...v, decisionId: d2.id }))
  await resendToFork(w.$)
  expect((await readOne(w.$, d2.id))!.thread.map(e => e.who)).toEqual(['person', 'fork'])
  expect((await readOne(w.$, d1.id))!.thread.map(e => e.who)).toEqual(['person'])
  expect(w.view().pending.map(p => p.decisionId)).toEqual(['d1'])
})

test('an empty or text-less fork or quick reply is stored as a visible placeholder', async () => {
  for (const text of ['', '   ', undefined]) {
    const w = world({ fork: async () => ({ isAnswered: true, text }) })
    const d = await make(w.$)
    await askQuestion(w.$, 'fork', d.id, 'anything?')
    expect((await readOne(w.$, d.id))!.thread.map(e => e.text)).toEqual(['anything?', '(no reply text)'])
  }
})
