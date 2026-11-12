import { expect, test } from 'claude-code/testing'

import { writeSession } from '../session'
import type { SessionRecord } from '../session'
import { INITIAL_VIEW } from './decision'
import { REFRESH_PROMPT, SessionView, checkOnOpen, noteRefreshTurn, planLines, refreshPrompt, refreshLine } from './session-tab'

const now = new Date()
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString()

function record(over: Partial<SessionRecord> = {}): SessionRecord {
  return {
    version: 1,
    session: 'session-1',
    title: 'Pantry: sharing links',
    summary: 'Built the share sheet. Now deciding how long a shared link lasts.',
    now: { text: 'Choosing expiry', waitsOn: ['d76', 'd77'] },
    plan: [
      { text: 'Share sheet', status: 'done', note: 'merged in #1' },
      {
        text: 'Link expiry',
        status: 'active',
        steps: [
          { text: 'Three options mocked', status: 'done' },
          { text: 'Pick the expiry', status: 'active', waitsOn: ['d76'] },
          { text: 'Build it', status: 'todo' },
        ],
      },
      { text: 'Revoking links', status: 'todo' },
    ],
    links: [
      { url: 'https://github.com/o/pantry/pull/1', label: '#1 Share sheet', kind: 'pr', state: 'merged', checkedAt: ago(2), addedBy: 'mod' },
      { url: 'https://example.com/mock', label: 'Expiry mock', kind: 'artifact', addedBy: 'mod' },
    ],
    updatedAt: ago(2),
    updatedBy: 'claude',
    ...over,
  }
}

test('plan lines number 1 and 2.1, mark done, active and todo, and cut a note at the right', () => {
  const lines = planLines(record().plan, 60, false)
  expect(lines.map(l => `${l.mark} ${l.number}  ${l.text}`)).toEqual([
    '✓ 1  Share sheet',
    '▶ 2  Link expiry',
    '✓ 2.1  Three options mocked',
    '▶ 2.2  Pick the expiry',
    '· 2.3  Build it',
    '· 3  Revoking links',
  ])
  expect(lines.map(l => l.colour)).toEqual(['success', 'claude', 'success', 'claude', 'dim', 'dim'])
  expect(lines[3]!.note).toBe('waits on d76')
  const narrow = planLines([{ text: 'A long plan item name here', status: 'done', note: 'a note far too long to fit beside it' }], 40, false)
  expect(narrow[0]!.note!.endsWith('…')).toBe(true)
  expect(`${narrow[0]!.mark} ${narrow[0]!.number}  ${narrow[0]!.text}`.length + 2 + narrow[0]!.note!.length).toBeLessThanOrEqual(40)
})

test('m folds done items to ✓ N done, at each level', () => {
  const lines = planLines(record().plan, 60, true)
  expect(lines.map(l => `${l.mark} ${l.number}  ${l.text}`.trim())).toEqual(['✓   1 done', '▶ 2  Link expiry', '✓   1 done', '▶ 2.2  Pick the expiry', '· 2.3  Build it', '· 3  Revoking links'])
})

const PANE = (rows: number, width = 60) =>
  ({
    plugin: 'decisions',
    component: 'Pane',
    requestId: 'other',
    surface: 'terminal',
    props: { title: 'Decisions', isFocused: true, bodyColumns: width, placement: 'dock', scroll: { offset: 0, bodyRows: rows }, view: {} },
  }) as any

async function draw($: any, on: any, r: SessionRecord, rows = 40, view = INITIAL_VIEW) {
  on('ui.render', ($$: any, e: any) => SessionView($$, { ui: $$.ui.resolve(e), record: r, view, width: 60, rows, isFocused: true, onLeave: () => {}, onHide: () => {} }))

  return $.ui.mount(PANE(rows))
}

const textsOf = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => t.text as string)

test('the page: title, summary, the now line with what it waits on, the plan, links, and when it was updated', async ($, on) => {
  const ui = await draw($, on, record())
  const all = await textsOf(ui)
  expect((await ui.findAll({ type: 'Text' })).find((t: any) => t.text === 'Pantry: sharing links')?.props.bold).toBe(true)
  expect(all.join(' ')).toContain('Now deciding how long a shared link lasts.')
  expect(all.some((t: string) => t === '▶ now  Choosing expiry · waits on d76, d77')).toBe(true)
  expect(all).toContain('Plan')
  expect(all.join('\n')).toContain('2.1  Three options mocked')
  expect((await ui.findAll({ type: 'Link' })).map((l: any) => l.props.href)).toEqual(['https://github.com/o/pantry/pull/1', 'https://example.com/mock'])
  expect(all.some((t: string) => /✓ merged · checked 2m ago/.test(t))).toBe(true)
  expect(all).toContain('updated 2m ago by Claude')
  await ui.unmount()
})

test('compact: the title, the now line and the plan with done folded; links behind o', async ($, on) => {
  const ui = await draw($, on, record(), 9)
  const all = await textsOf(ui)
  expect(all).toContain('Pantry: sharing links')
  expect(all.join(' ')).not.toContain('Now deciding how long')
  expect(all.join('\n')).toContain('1 done')
  expect(await ui.findAll({ type: 'Link' })).toHaveLength(0)
  expect((await ui.find({ key: 'o' }))?.props.hotkey).toBe('o')
  await ui.unmount()
})

test('refresh: the prompt, and the line that shows while Claude is asked and after a turn with no update', () => {
  expect(refreshPrompt()).toBe('Refresh the session record with decisions_session: title, summary, now line and plan, from where the work is now.')
  expect(REFRESH_PROMPT).toBe(refreshPrompt())
  const asked = ago(1)
  expect(refreshLine({ askedAt: asked, status: 'asked' }, record({ updatedAt: ago(2) }))).toBe('✻ asked Claude to refresh')
  expect(refreshLine({ askedAt: asked, status: 'asked' }, record({ updatedAt: ago(0) }))).toBeUndefined()
  expect(refreshLine({ askedAt: asked, status: 'no-update' }, record({ updatedAt: ago(2) }))).toBe("Claude didn't update it")
  expect(refreshLine(undefined, record())).toBeUndefined()
})

test('a refresh turn that ends with no update says so; one that is not the refresh is ignored', () => {
  expect(noteRefreshTurn({ text: `The decisions plugin sent a message:\n${REFRESH_PROMPT}`, turnId: 'z1' }, 'start')).toBe(true)
  expect(noteRefreshTurn({ text: 'something else', turnId: 'z2' }, 'start')).toBe(false)
  expect(noteRefreshTurn({ turnId: 'z2' }, 'complete')).toBe(false)
  expect(noteRefreshTurn({ turnId: 'z1' }, 'complete')).toBe(true)
  expect(noteRefreshTurn({ text: REFRESH_PROMPT, turnId: 'z3', agentId: 'a' }, 'start')).toBe(false)
})

test("the page's open handler checks pull request states", async () => {
  const files = new Map<string, string>()
  const runs: string[][] = []
  const store = {
    env: { get: async () => '/home/test' },
    session: { cwd: async () => '/work/pantry', id: async () => 'session-1' },
    process: {
      run: async (argv: string[]) => {
        runs.push(argv)
        return { exitCode: 0, stdout: argv[0] === 'git' ? '/work/pantry/.git\n' : '{"state":"MERGED"}' }
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
      list: async () => [],
    },
  }
  await writeSession(store, record({ links: [{ url: 'https://github.com/o/pantry/pull/9', label: '#9', kind: 'pr', state: 'open', addedBy: 'mod' }] }))
  const checked = await checkOnOpen(store)
  expect(runs.some(r => r[0] === 'gh' && r[3] === 'https://github.com/o/pantry/pull/9')).toBe(true)
  expect(checked!.links[0]!.state).toBe('merged')
})

test('drawing the page runs no command', async ($, on) => {
  const runs: unknown[] = []
  on('process.run', (_: any, e: any) => {
    runs.push(e)
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  const ui = await draw($, on, record({ links: [{ url: 'https://github.com/o/pantry/pull/9', label: '#9', kind: 'pr', state: 'open', addedBy: 'mod' }] }))
  expect(runs).toHaveLength(0)
  await ui.unmount()
})
