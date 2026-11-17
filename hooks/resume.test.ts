import { expect, test } from 'claude-code/testing'

import { readSession, writeSession } from './session'
import { readAll, storeDir } from './store'
import type { Decision, StoreCtx } from './store'
import { RECENTLY_ACTIVE_MS, adoptSessions, followResume, forgetTranscripts, idsInConversation, otherSessions, projectFolder, sessionsToAdopt, transcriptWrittenAt } from './resume'

function fake(session = "new-id"): any {
  const files = new Map<string, string>()
  const messages: any[] = []
  const written = new Map<string, number>()
  const stats: string[] = []

  return {
    files,
    messages,
    written,
    stats,
    env: { get: async () => '/home/test' },
    session: { cwd: async () => '/work/pantry', id: async () => session, messages: async () => messages } as any,
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
      list: async (dir: string) => [...new Set([...files.keys(), ...written.keys()].filter(p => p.startsWith(dir + '/')).map(p => p.slice(dir.length + 1).split('/')[0]!))].map(name => ({ name })),
      stat: async (path: string) => {
        stats.push(path)
        const mtimeMs = written.get(path)
        if (mtimeMs === undefined) {
          throw new Error('ENOENT')
        }
        return { mtimeMs }
      },
    },
  } as any
}

function decision(n: number, session: string | undefined, over: Partial<Decision> = {}): Decision {
  return {
    version: 1, id: `d${n}`, number: n, group: 'Sharing links', section: 'needs-you', kind: 'choice',
    title: `Decision ${n}`, scenario: 's', options: [{ id: 1, label: 'A' }], sources: [], state: 'open',
    thread: [], revisions: [], createdAt: '2026-11-12T10:00:00.000Z', updatedAt: `2026-11-12T10:0${n % 10}:00.000Z`,
    ...(session === undefined ? {} : { session }), ...over,
  } as Decision
}

async function put($: ReturnType<typeof fake>, ...ds: Decision[]): Promise<void> {
  const dir = await storeDir($)
  for (const d of ds) {
    $.files.set(`${dir}/${d.id}.json`, JSON.stringify(d))
  }
}

test('ids come from the decisions tools in the conversation and from the pane\'s prompts, nothing else', () => {
  const ids = idsInConversation([
    { role: 'assistant', text: 'see d40 in the docs', toolUses: [
      { tool: 'mcp__decisions__decisions_add', input: { title: 'x' }, result: 'Added d12 to the pane. 1 open.' },
      { tool: 'mcp__decisions__decisions_update', input: { id: 'd13' } },
      { tool: 'Bash', input: { command: 'echo d99' }, result: 'd99' },
    ] },
    { role: 'user', text: 'Answers from the decisions pane.\n\nDecision d14 · Pick one (Group)\nChosen: 1', toolUses: [] },
    { role: 'user', text: 'On decision 15 · Where it lives: why?', toolUses: [] },
  ] as any)
  expect([...ids].sort()).toEqual(['d12', 'd13', 'd14', 'd15'])
})

test('the sessions to adopt are the other sessions those ids were stored under', () => {
  const all = [decision(1, 'old-id'), decision(2, 'old-id'), decision(3, 'new-id'), decision(4, 'other'), decision(5, undefined)]
  expect(sessionsToAdopt(new Set(['d1', 'd3', 'd5', 'd9']), all, 'new-id')).toEqual(['old-id'])
})

test('adopting moves every decision of the old session and its record to this one, saying where they came from', async () => {
  const $ = fake('new-id')
  await put($, decision(1, 'old-id'), decision(2, 'old-id'), decision(3, 'other'))
  await writeSession({ ...$, session: { ...$.session, id: async () => 'old-id' } } as any, { title: 'Sharing links' })
  await adoptSessions($, ['old-id'])
  const mine = (await readAll($)).decisions
  expect(mine.map(d => d.id)).toEqual(['d1', 'd2'])
  expect(mine.every(d => (d as any).movedFrom === 'old-id')).toBe(true)
  expect((await readSession($))?.title).toBe('Sharing links')
  expect((await readSession($))?.continuedFrom).toBe('old-id')
})

test('followResume adopts the session the resumed conversation came from, once, and leaves a fresh session alone', async () => {
  const $ = fake('new-id')
  await put($, decision(1, 'old-id'), decision(2, 'old-id'), decision(3, 'someone-else'))
  expect(await followResume($)).toEqual([])
  $.messages.push({ role: 'assistant', text: '', toolUses: [{ tool: 'mcp__decisions__decisions_add', input: {}, result: 'Added d1 to the pane.' }] })
  expect(await followResume($)).toEqual(['old-id'])
  expect((await readAll($)).decisions.map(d => d.id)).toEqual(['d1', 'd2'])
  expect(await followResume($)).toEqual([])
})

test('other sessions: those with decisions still waiting, newest first, at most three, with a title', async () => {
  const $ = fake('new-id')
  await put($,
    decision(1, 'a', { updatedAt: '2026-11-12T09:00:00.000Z' }),
    decision(2, 'b', { updatedAt: '2026-11-12T11:00:00.000Z', group: 'Imports' }),
    decision(3, 'b', { updatedAt: '2026-11-12T10:00:00.000Z', state: 'sent' } as any),
    decision(4, 'c', { state: 'sent' } as any),
    decision(5, 'd', { updatedAt: '2026-11-12T08:00:00.000Z' }),
    decision(6, 'e', { updatedAt: '2026-11-12T07:00:00.000Z' }),
    decision(7, 'new-id'),
  )
  await writeSession({ ...$, session: { ...$.session, id: async () => 'a' } } as any, { title: 'Sharing links work' })
  const others = await otherSessions($)
  expect(others.map(o => o.session)).toEqual(['b', 'a', 'd'])
  expect(others[0]).toMatchObject({ title: 'Imports', waiting: 1, at: '2026-11-12T11:00:00.000Z' })
  expect(others[1]?.title).toBe('Sharing links work')
})

const NOW = Date.parse('2026-11-12T12:00:00.000Z')
const PROJECTS = '/home/test/.claude/projects'

test('a transcript is found under this working directory\'s project folder, or under another one, and its place is remembered', async () => {
  forgetTranscripts()
  const $ = fake('new-id')
  $.env.get = async (name: string) => (name === 'HOME' ? '/home/test' : undefined)
  expect(projectFolder('/work/pantry')).toBe('-work-pantry')
  $.written.set(`${PROJECTS}/-work-pantry/here.jsonl`, NOW - 1000)
  $.written.set(`${PROJECTS}/-work-pantry-worktree/there.jsonl`, NOW - 2000)
  expect(await transcriptWrittenAt($, 'here', NOW)).toBe(NOW - 1000)
  expect(await transcriptWrittenAt($, 'there', NOW)).toBe(NOW - 2000)
  $.stats.length = 0
  expect(await transcriptWrittenAt($, 'there', NOW)).toBe(NOW - 2000)
  expect($.stats).toEqual([`${PROJECTS}/-work-pantry-worktree/there.jsonl`])
  expect(await transcriptWrittenAt($, 'nowhere', NOW)).toBeUndefined()
  $.stats.length = 0
  expect(await transcriptWrittenAt($, 'nowhere', NOW + 1000)).toBeUndefined()
  expect($.stats).toEqual([])
})

test('CLAUDE_CONFIG_DIR moves the projects folder', async () => {
  forgetTranscripts()
  const $ = fake('new-id')
  $.env.get = async (name: string) => (name === 'HOME' ? '/home/test' : '/elsewhere/config/')
  $.written.set('/elsewhere/config/projects/-work-pantry/s.jsonl', NOW)
  expect(await transcriptWrittenAt($, 's', NOW)).toBe(NOW)
})

test('other sessions written to in the last 30 minutes are marked active and kept apart from those offered (row 300)', async () => {
  forgetTranscripts()
  const $ = fake('new-id')
  $.env.get = async (name: string) => (name === 'HOME' ? '/home/test' : undefined)
  await put($,
    decision(1, 'closed', { updatedAt: '2026-11-12T09:00:00.000Z' }),
    decision(2, 'open-tab', { updatedAt: '2026-11-12T11:00:00.000Z' }),
    decision(3, 'no-transcript', { updatedAt: '2026-11-12T08:00:00.000Z' }),
  )
  $.written.set(`${PROJECTS}/-work-pantry/closed.jsonl`, NOW - RECENTLY_ACTIVE_MS - 1)
  $.written.set(`${PROJECTS}/-work-pantry/open-tab.jsonl`, NOW - 5 * 60_000)
  const others = await otherSessions($, NOW)
  expect(others.map(o => o.session)).toEqual(['closed', 'no-transcript', 'open-tab'])
  expect(others.map(o => o.activeAt)).toEqual([undefined, undefined, new Date(NOW - 5 * 60_000).toISOString()])
})
