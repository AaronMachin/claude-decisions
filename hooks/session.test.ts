import { expect, test } from 'claude-code/testing'

import { SESSION_DESCRIPTION, SESSION_TOOL, addCapturedLinks, captureLinks, carryOver, checkPrStates, readSession, sessionTool, writeSession } from './session'
import type { SessionRecord } from './session'
import type { StoreCtx } from './store'

type Run = (argv: string[]) => Promise<{ exitCode: number; stdout: string }>

function fake(session = 'session-1', run?: Run): StoreCtx & { files: Map<string, string>; runs: string[][]; setSession: (id: string) => void } {
  const files = new Map<string, string>()
  const runs: string[][] = []
  let id = session

  return {
    files,
    runs,
    setSession: (next: string) => {
      id = next
    },
    env: { get: async () => '/home/test' },
    session: { cwd: async () => '/work/pantry', id: async () => id },
    process: {
      run: async (argv: string[]) => {
        if (argv[0] === 'git') {
          return { exitCode: 0, stdout: '/work/pantry/.git\n' }
        }
        runs.push(argv)
        return run ? run(argv) : { exitCode: 1, stdout: '' }
      },
    },
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
      list: async (dir: string) => [...files.keys()].filter(p => p.startsWith(dir + '/')).map(p => ({ name: p.slice(dir.length + 1) })),
    },
  }
}

const ARTIFACT_URL = ['https://claude.ai', 'code', 'artifact', '0f3c9a'].join('/')

test('the tool replaces only the fields it is given and keeps the rest', async () => {
  const $ = fake()
  expect(SESSION_TOOL).toBe('mcp__decisions__decisions_session')
  await sessionTool($, { title: 'Pantry: sharing links', summary: 'Building the share flow.' })
  await sessionTool($, { now: { text: 'Choosing expiry', waitsOn: ['d4'] }, plan: [{ text: 'Share flow', status: 'active', steps: [{ text: 'Expiry', status: 'todo' }] }] })
  const record = (await readSession($))!
  expect(record.title).toBe('Pantry: sharing links')
  expect(record.summary).toBe('Building the share flow.')
  expect(record.now).toEqual({ text: 'Choosing expiry', waitsOn: ['d4'] })
  expect(record.plan[0]!.steps![0]!.status).toBe('todo')
  expect(record.updatedBy).toBe('claude')
  expect(record.session).toBe('session-1')
})

test('the tool refuses a bad status, steps nested past one level, and an empty call', async () => {
  const $ = fake()
  expect(await sessionTool($, { plan: [{ text: 'A', status: 'doing' }] })).toHaveProperty('deny')
  expect(await sessionTool($, { plan: [{ text: 'A', status: 'active', steps: [{ text: 'B', status: 'todo', steps: [{ text: 'C', status: 'todo' }] }] }] })).toHaveProperty('deny')
  expect(await sessionTool($, { plan: [{ text: ' ', status: 'todo' }] })).toHaveProperty('deny')
  expect(await sessionTool($, {})).toHaveProperty('deny')
  expect(await sessionTool($, { links: [{ url: 'https://github.com/o/pantry/pull/1', state: 'shipped' }] })).toHaveProperty('deny')
})

test('the tool adds, labels and marks links by URL, and never removes one', async () => {
  const $ = fake()
  await writeSession($, { links: [{ url: 'https://github.com/o/pantry/pull/1', label: '#1', kind: 'pr', addedBy: 'mod' }] })
  await sessionTool($, { links: [{ url: 'https://github.com/o/pantry/pull/1', label: '#1 Share links', state: 'merged' }, { url: 'https://example.com/spec', label: 'Spec' }] })
  const links = (await readSession($))!.links
  expect(links).toHaveLength(2)
  expect(links[0]).toMatchObject({ label: '#1 Share links', state: 'merged', addedBy: 'mod' })
  expect(links[1]).toMatchObject({ url: 'https://example.com/spec', addedBy: 'claude' })
})

test('the description says when to call it and stays short', () => {
  expect(SESSION_DESCRIPTION.length).toBeLessThanOrEqual(1500)
  expect(SESSION_DESCRIPTION).toMatch(/start of real work/)
  expect(SESSION_DESCRIPTION).toMatch(/plan step finishes/)
})

test('an Artifact publish result gives one link titled from the call', () => {
  const links = captureLinks('Artifact', { file_path: '/tmp/x/share-flow.html', title: 'Share flow mock' }, { text: `Published. ${ARTIFACT_URL} is live.` })
  expect(links).toEqual([{ url: ARTIFACT_URL, label: 'Share flow mock', kind: 'artifact', addedBy: 'mod' }])
  expect(captureLinks('Artifact', { file_path: '/tmp/x/share-flow.html' }, { text: `Published ${ARTIFACT_URL}` })[0]!.label).toBe('share-flow')
  expect(captureLinks('Artifact', { action: 'read', url: ARTIFACT_URL }, { text: ARTIFACT_URL })).toEqual([])
})

test('a gh pr create result gives its pull request with the number and title', () => {
  const links = captureLinks('Bash', { command: 'gh pr create --title "Share links expire" --body x' }, { text: 'https://github.com/o/pantry/pull/42\n' })
  expect(links).toEqual([{ url: 'https://github.com/o/pantry/pull/42', label: '#42 Share links expire', kind: 'pr', state: 'open', addedBy: 'mod' }])
})

test('a gh pr list result, a fetched page full of PR links, and other commands add nothing', () => {
  const many = 'https://github.com/o/pantry/pull/1\nhttps://github.com/o/pantry/pull/2'
  expect(captureLinks('Bash', { command: 'gh pr list' }, { text: many })).toEqual([])
  expect(captureLinks('WebFetch', { url: 'https://github.com/o/pantry/pulls' }, { text: many })).toEqual([])
  expect(captureLinks('Bash', { command: 'echo gh pr create' }, { text: 'no url here' })).toEqual([])
})

test('a repeat publish of the same URL adds nothing', async () => {
  const $ = fake()
  const link = { url: ARTIFACT_URL, label: 'Share flow mock', kind: 'artifact' as const, addedBy: 'mod' as const }
  expect(await addCapturedLinks($, [link])).toBe(true)
  expect(await addCapturedLinks($, [{ ...link, label: 'Renamed' }])).toBe(false)
  expect((await readSession($))!.links).toEqual([link])
})

test('carryOver into a record the mod already started for its links fills in what it lacks and keeps both sets of links (row 297)', async () => {
  const $ = fake('old-id')
  await sessionTool($, { title: 'Pantry: sharing links', summary: 'Building the share flow.', now: { text: 'Expiry' }, plan: [{ text: 'Share flow', status: 'active' }] })
  await sessionTool($, { links: [{ url: 'https://github.com/o/r/pull/1', label: '#1', state: 'merged' }] })
  $.setSession('new-id')
  await sessionTool($, { links: [{ url: 'https://github.com/o/r/pull/2', label: '#2', state: 'open' }] })
  await carryOver($, 'old-id', 'new-id')
  const record = (await readSession($))!
  expect(record.title).toBe('Pantry: sharing links')
  expect(record.summary).toBe('Building the share flow.')
  expect(record.plan.map(p => p.text)).toEqual(['Share flow'])
  expect(record.links.map(l => l.label)).toEqual(['#1', '#2'])
  expect(record.continuedFrom).toBe('old-id')
})

test('carryOver never overwrites what the new record already says', async () => {
  const $ = fake('old-id')
  await sessionTool($, { title: 'Old title', summary: 'Old summary' })
  $.setSession('new-id')
  await sessionTool($, { title: 'New title' })
  await carryOver($, 'old-id', 'new-id')
  const record = (await readSession($))!
  expect(record.title).toBe('New title')
  expect(record.summary).toBe('Old summary')
})

test('carryOver copies the record to the new session id, saying where it came from', async () => {
  const $ = fake('old-id')
  await sessionTool($, { title: 'Pantry: sharing links' })
  await carryOver($, 'old-id', 'new-id')
  $.setSession('new-id')
  const record = (await readSession($))!
  expect(record.title).toBe('Pantry: sharing links')
  expect(record.session).toBe('new-id')
  expect(record.continuedFrom).toBe('old-id')
})

const minutesAgo = (n: number, now: Date) => new Date(now.getTime() - n * 60_000).toISOString()

test('checkPrStates sets merged and checkedAt, skips a link checked 2 minutes ago, and keeps the state when gh fails', async () => {
  const now = new Date('2026-11-12T12:00:00Z')
  const answers: Record<string, { exitCode: number; stdout: string }> = {
    'https://github.com/o/pantry/pull/1': { exitCode: 0, stdout: '{"state":"MERGED","title":"Share links"}' },
    'https://github.com/o/pantry/pull/3': { exitCode: 1, stdout: '' },
  }
  const $ = fake('session-1', async argv => answers[argv[3]!] ?? { exitCode: 1, stdout: '' })
  const record: SessionRecord = {
    version: 1,
    session: 'session-1',
    plan: [],
    links: [
      { url: 'https://github.com/o/pantry/pull/1', label: '#1', kind: 'pr', state: 'open', addedBy: 'mod' },
      { url: 'https://github.com/o/pantry/pull/2', label: '#2', kind: 'pr', state: 'open', checkedAt: minutesAgo(2, now), addedBy: 'mod' },
      { url: 'https://github.com/o/pantry/pull/3', label: '#3', kind: 'pr', state: 'open', checkedAt: minutesAgo(30, now), addedBy: 'mod' },
      { url: ARTIFACT_URL, label: 'Mock', kind: 'artifact', addedBy: 'mod' },
    ],
    updatedAt: minutesAgo(10, now),
    updatedBy: 'claude',
  }
  const checked = await checkPrStates($, record, now)
  expect(checked.links[0]).toMatchObject({ state: 'merged', checkedAt: now.toISOString() })
  expect(checked.links[1]!.checkedAt).toBe(minutesAgo(2, now))
  expect(checked.links[2]).toMatchObject({ state: 'open', checkedAt: minutesAgo(30, now) })
  expect($.runs.map(r => r[3])).toEqual(['https://github.com/o/pantry/pull/1', 'https://github.com/o/pantry/pull/3'])
  expect($.runs[0]!.slice(0, 3)).toEqual(['gh', 'pr', 'view'])
})
