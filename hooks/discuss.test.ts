import { expect, test } from 'claude-code/testing'

import { markAnswered, recordQuestion, recordReply } from './discuss'
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
