import { expect, test } from 'claude-code/testing'

import { buildAnswerPrompt, readyDecisions, sendTicked } from './send'
import type { SendCtx } from './send'
import { create, readAll, write } from './store'
import type { Decision } from './store'

function fake(submit: (args: { text: string }) => Promise<unknown>): { ctx: SendCtx; submitted: string[] } {
  const files = new Map<string, string>()
  const submitted: string[] = []
  const ctx: SendCtx = {
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
    prompt: {
      submit: async (args: { text: string }) => {
        submitted.push(args.text)
        return submit(args)
      },
    },
  }

  return { ctx, submitted }
}

const BASE = {
  group: 'Config file plan',
  kind: 'choice' as const,
  scenario: 's',
  options: [
    { id: 1, label: 'Project root' },
    { id: 2, label: 'Vitest' },
  ],
  sources: [],
  dependsOn: [],
}

async function ready(ctx: SendCtx, title: string, option: number): Promise<Decision> {
  const made = await create(ctx, { ...BASE, title })
  const answered: Decision = { ...made, state: 'ready', answer: { option, answeredAt: '2026-11-06T10:00:00Z' } }
  await write(ctx, answered)

  return answered
}

const ok = async () => ({})

test('one answer is worded as an answer, with no condition and no discussion', async () => {
  const { ctx } = fake(ok)
  const d = await ready(ctx, 'Where the config file lives', 1)
  expect(buildAnswerPrompt([d])).toBe(
    [
      "Answer from the decisions pane. This is the person's decision, so act on it and don't ask again. A condition is part of the answer. Do not write decision records or other files about the answers unless the person asks.",
      '',
      'Decision d1 · Where the config file lives (Config file plan)',
      'Chosen: 1. Project root',
      'Condition: none',
      'Discussion: none',
    ].join('\n'),
  )
})

test('several answers, with a condition and a discussion', async () => {
  const { ctx } = fake(ok)
  const a = await ready(ctx, 'Where the config file lives', 1)
  const b = await ready(ctx, 'Which test runner', 2)
  const withThread: Decision = {
    ...b,
    answer: { ...b.answer!, condition: 'only if it runs under the existing CI image' },
    thread: [
      { who: 'person', text: 'does Vitest need a new CI image?', at: 't' },
      { who: 'claude', text: 'no, the current one has the Node version it needs.', at: 't' },
    ],
  }
  expect(buildAnswerPrompt([a, withThread])).toBe(
    [
      "Answers from the decisions pane. These are the person's decisions, so act on them and don't ask again. A condition is part of the answer. Do not write decision records or other files about the answers unless the person asks.",
      '',
      'Decision d1 · Where the config file lives (Config file plan)',
      'Chosen: 1. Project root',
      'Condition: none',
      'Discussion: none',
      '',
      'Decision d2 · Which test runner (Config file plan)',
      'Chosen: 2. Vitest',
      'Condition: only if it runs under the existing CI image',
      'Discussion:',
      '  person: does Vitest need a new CI image?',
      '  claude: no, the current one has the Node version it needs.',
    ].join('\n'),
  )
})

test('readyDecisions keeps only ready ones', () => {
  const d = (state: Decision['state']) => ({ state }) as Decision
  expect(readyDecisions([d('open'), d('ready'), d('sent'), d('parked')]).map(x => x.state)).toEqual(['ready'])
})

test('nothing is submitted with no ids, or for ids that are not ready', async () => {
  const { ctx, submitted } = fake(ok)
  await create(ctx, { ...BASE, title: 'still open' })
  expect((await sendTicked(ctx, [])).sent).toBe(0)
  expect((await sendTicked(ctx, ['d1'])).sent).toBe(0)
  expect(submitted).toEqual([])
})

test('only ticked answers are sent and marked sent; an unticked one stays ready', async () => {
  const { ctx, submitted } = fake(ok)
  await ready(ctx, 'First', 1)
  await ready(ctx, 'Second', 2)
  const result = await sendTicked(ctx, ['d2'])
  expect(result.sent).toBe(1)
  expect(await result.settled).toBeUndefined()
  expect(submitted).toHaveLength(1)
  expect(submitted[0]).toContain('Decision d2')
  expect(submitted[0]).not.toContain('Decision d1')
  const states = (await readAll(ctx)).decisions.map(d => [d.id, d.state])
  expect(states).toEqual([
    ['d1', 'ready'],
    ['d2', 'sent'],
  ])
  expect((await readAll(ctx)).decisions[1]!.sentAt).toBeDefined()
})

test('a second confirm for the same ids sends nothing again', async () => {
  const { ctx, submitted } = fake(ok)
  await ready(ctx, 'First', 1)
  await sendTicked(ctx, ['d1'])
  expect((await sendTicked(ctx, ['d1'])).sent).toBe(0)
  expect(submitted).toHaveLength(1)
})

test('a submit that fails puts the answers back to ready and says so', async () => {
  const { ctx } = fake(async () => {
    throw new Error('refused')
  })
  await ready(ctx, 'First', 1)
  const result = await sendTicked(ctx, ['d1'])
  expect(result.sent).toBe(1)
  expect(await result.settled).toMatch(/not sent.*back to ready/i)
  const d = (await readAll(ctx)).decisions[0]!
  expect(d.state).toBe('ready')
  expect(d.sentAt).toBeUndefined()
})

test('a failed submit keeps a thread entry written while it was waiting', async () => {
  let fail: (e: Error) => void = () => undefined
  const { ctx } = fake(() => new Promise((_, reject) => void (fail = reject)))
  await ready(ctx, 'First', 1)
  const result = await sendTicked(ctx, ['d1'])
  const sent = (await readAll(ctx)).decisions[0]!
  await write(ctx, { ...sent, thread: [{ who: 'person', text: 'asked while sending', at: 'now' }] })
  fail(new Error('refused'))
  await result.settled
  const d = (await readAll(ctx)).decisions[0]!
  expect(d.state).toBe('ready')
  expect(d.thread.map(e => e.text)).toEqual(['asked while sending'])
})
