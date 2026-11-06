import { expect, test } from 'claude-code/testing'

import { PLACEHOLDER, addWaiter, askModel, isBusy, markLate, routeComplete, routeStart, sentText, contextFor, markAnswered, recordQuestion, recordReply } from './discuss'
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

const framed = (sent: string) => `The decisions plugin sent "${sent}"`

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
  markLate('e1')
  routeStart({ text: framed(sent), turnId: 'w1' })
  expect(routeComplete({ turnId: 'w1', answer: 'late one' })?.waiter.late).toBe(true)
})
