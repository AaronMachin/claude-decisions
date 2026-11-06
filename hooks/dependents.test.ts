import { expect, test } from 'claude-code/testing'

import { reopenDependents, reopenNotice } from './dependents'
import { readAll, write } from './store'
import type { Decision, StoreCtx } from './store'

function fake(): StoreCtx {
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

function make(n: number, over: Partial<Decision> = {}): Decision {
  return {
    version: 1,
    id: `d${n}`,
    number: n,
    section: 'needs-you',
    kind: 'choice',
    title: `Decision ${n}`,
    scenario: 's',
    options: [{ id: 1, label: 'One' }, { id: 2, label: 'Two' }],
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

const ANSWER = { option: 2, answeredAt: 't' }

test('only ready dependents reopen, with the answer they had; the others are left', async () => {
  const $ = fake()
  const changed = make(1, { state: 'ready', answer: { option: 1, answeredAt: 't' } })
  for (const d of [
    changed,
    make(2, { dependsOn: ['d1'], state: 'ready', answer: ANSWER }),
    make(3, { dependsOn: ['d1'], state: 'open' }),
    make(4, { dependsOn: ['d1'], state: 'live' }),
    make(5, { dependsOn: ['d1'], state: 'parked', parkedReason: 'later' }),
    make(6, { dependsOn: ['d1'], state: 'sent', answer: ANSWER }),
    make(7, { dependsOn: ['d9'], state: 'ready', answer: ANSWER }),
  ]) {
    await write($, d)
  }
  const result = await reopenDependents($, changed, { option: 2, answeredAt: 't' })
  expect(result).toEqual({ reopened: ['d2'], sent: ['d6'] })
  const by = Object.fromEntries((await readAll($)).decisions.map(d => [d.id, d]))
  expect(by.d2!.state).toBe('open')
  expect(by.d2!.answer).toBeUndefined()
  expect(by.d2!.reopenedBy).toMatchObject({ id: 'd1', was: ANSWER })
  expect(by.d3!.state).toBe('open')
  expect(by.d3!.reopenedBy).toBeUndefined()
  expect(by.d4!.state).toBe('live')
  expect(by.d5!.state).toBe('parked')
  expect(by.d6!.state).toBe('sent')
  expect(by.d7!.state).toBe('ready')
})

test('reopening goes one level deep only', async () => {
  const $ = fake()
  const a = make(1, { state: 'ready', answer: ANSWER })
  await write($, a)
  await write($, make(2, { dependsOn: ['d1'], state: 'ready', answer: ANSWER }))
  await write($, make(3, { dependsOn: ['d2'], state: 'ready', answer: ANSWER }))
  await reopenDependents($, a, undefined)
  const by = Object.fromEntries((await readAll($)).decisions.map(d => [d.id, d]))
  expect(by.d2!.state).toBe('open')
  expect(by.d3!.state).toBe('ready')
})

test('the notice names what reopened and what was already sent', () => {
  expect(reopenNotice('d3', { reopened: ['d5'], sent: [] })).toBe('d3 changed. Reopened d5.')
  expect(reopenNotice('d3', { reopened: ['d5', 'd6'], sent: ['d7'] })).toBe('d3 changed. Reopened d5 and d6. d7 was already sent.')
  expect(reopenNotice('d3', { reopened: [], sent: ['d7', 'd8'] })).toBe('d3 changed. d7 and d8 were already sent.')
  expect(reopenNotice('d3', { reopened: [], sent: [] })).toBeUndefined()
})
