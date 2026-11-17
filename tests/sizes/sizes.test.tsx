/**
 * Every screen of the pane at every size (decision d110): the list, a decision of each kind, the
 * answer box, the whole thread, the Session page, the Send screen, the assumptions batch and the
 * empty pane offering other sessions, each drawn at 6 widths and 8 heights from the seeded session
 * the testers use. At each size:
 *
 * - no Text or Button is wider than the room it is drawn in (the terminal would wrap it onto rows
 *   the screen didn't count, or cut a Button)
 * - the key line is drawn (the hint row, or the screen's own b and h keys)
 * - on a decision, the key line is in view without scrolling, and every option has its row
 * - on a decision tall enough for the full layout (14 rows), its title and every option's label are
 *   drawn whole somewhere, not only cut with `…`
 *
 * Each test collects every problem and checks the list is empty, so one run names them all.
 */
import { expect, mock, test } from 'claude-code/testing'

import { readAll } from '../../hooks/store'
import type { Decision, StoreCtx } from '../../hooks/store'
import { addDecision } from '../../hooks/tool'
import { seedUx } from '../replay/ux-fixture'
import { layout, overflows } from './layout'

const WIDTHS = [40, 49, 60, 80, 120, 200]
const HEIGHTS = [8, 9, 11, 13, 14, 20, 30, 50]
const SIZES = WIDTHS.flatMap(columns => HEIGHTS.map(rows => ({ columns, rows })))
/** Below this the screens use their compact layout (`isCompact`). */
const COMPACT_BELOW = 14

type Files = Map<string, string>
/** Loosely typed, as the other tests' engines are: the fakes answer with only the fields the mod reads. */
type On = (event: string, ...rest: any[]) => unknown

/** Answers everything the mod asks of the engine from memory, and a store over the same files for seeding. */
function engine(on: On, session = 'session-1'): { files: Files; store: StoreCtx } {
  const files: Files = new Map()
  on('env.get', () => ({ value: '/home/test' }))
  on('session.cwd', () => ({ value: '/work/pantry' }))
  on('session.id', () => ({ value: session }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '/work/pantry/.git\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('fs.read', (_: any, e: any) => ({ value: files.get(e.path) ?? '' }))
  on('fs.write', (_: any, e: any) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.exists', (_: any, e: any) => ({ value: files.has(e.path) }))
  on('fs.list', (_: any, e: any) => ({
    value: [...files.keys()].filter(p => p.startsWith(e.path + '/')).map(p => ({ name: p.slice(e.path.length + 1), kind: 'file', size: 0, mtimeMs: 0, isLink: false })),
  }))
  on('fs.stat', () => {
    throw new Error('ENOENT')
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('clock.after', () => ({ value: undefined }))
  ;(on as any)('ui.focus', { plugin: '*' }, () => ({ value: {} }))
  on('tool.register', () => ({ value: {} }))
  on('command.register', (_: any, e: any) => ({ value: { command: e.name } }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  mock.store(on as any)
  const store: StoreCtx = {
    env: { get: async () => '/home/test' },
    session: { cwd: async () => '/work/pantry', id: async () => session },
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
      list: async (dir: string) => [...files.keys()].filter(p => p.startsWith(dir + '/')).map(p => ({ name: p.slice(dir.length + 1) })),
    },
  }

  return { files, store }
}

const props = (columns: number, rows: number) => ({ title: 'Decisions', isFocused: true, bodyColumns: columns, placement: 'dock', scroll: { offset: 0, bodyRows: rows }, view: {} })

async function mount($: any): Promise<any> {
  return $.ui.mount({ plugin: 'decisions', component: 'Pane', requestId: 'decisions', props: props(49, 30), surface: 'terminal' })
}

/** The engine reporting the ring on `key`, so a second press is enter on it. */
async function ring($: any, key: string): Promise<void> {
  await $.ui.focus({ component: 'Pane', requestId: 'decisions', plugin: 'decisions', element: key, origin: { kind: 'plugin' } })
}

/** Opens a decision from the list, unfolding its group's heading when the row is folded away. */
async function open(ui: any, id: string): Promise<void> {
  if (!(await ui.find({ key: `row:${id}` }))) {
    for (const heading of (await ui.findAll({ type: 'Button' })).filter((b: any) => /^group:/.test(String(b.props.key)))) {
      if (!(await ui.find({ key: `row:${id}` }))) {
        await ui.press({ key: heading.props.key })
      }
    }
  }
  await ui.press({ key: `row:${id}` })
}

/** Text with every space taken out, so a line broken at a space or inside a word too long for the pane still matches. */
const squash = (text: string) => text.replace(/\s+/g, '')

type Check = { decision?: Decision }

/** Draws the screen at every size and returns what is wrong at each. */
async function problemsAtEverySize(ui: any, screen: string, check: Check = {}): Promise<string[]> {
  const problems: string[] = []
  for (const { columns, rows } of SIZES) {
    await ui.redraw(props(columns, rows))
    const at = `${screen} at ${columns}x${rows}`
    const drawn = layout(await ui.drawn(), columns)
    for (const leaf of overflows(drawn)) {
      problems.push(`${at}: ${leaf.kind} ${leaf.key ?? ''} is ${leaf.width} wide in ${leaf.room}: "${leaf.text}"`)
    }
    // The key line: the decision screen, the list and the Session page draw it as `hints`; the thread and Send screens as their own b (back) and h (hide) keys.
    const keyLine = drawn.rowOf.get('hints') ?? drawn.rowOf.get('b') ?? drawn.rowOf.get('h')
    if (keyLine === undefined) {
      problems.push(`${at}: no key line`)
    }
    const d = check.decision
    if (d === undefined) {
      continue
    }
    if (keyLine !== undefined && keyLine >= rows) {
      problems.push(`${at}: the key line is on row ${keyLine}, out of view`)
    }
    const count = d.options.length + 1
    for (let n = 1; n <= count; n++) {
      if (!drawn.rowOf.has(`opt:${n}`)) {
        problems.push(`${at}: option ${n} has no row`)
      }
    }
    if (rows >= COMPACT_BELOW) {
      // A wrapped title or label is drawn a line at a time beside the bar (`▌`), and the recommended mark sits after a label's first line, so both are left out of the join.
      const all = squash(drawn.leaves.map(leaf => leaf.text.replace('★ recommended', '')).filter(text => !/^[▌\s›]*$/.test(text)).join(' '))
      for (const text of [d.title, ...d.options.map(o => o.label)]) {
        if (!all.includes(squash(text))) {
          problems.push(`${at}: "${text}" is not drawn whole`)
        }
      }
    }
  }

  return problems
}

/**
 * Kinds the seeded session doesn't have, and a decision with a long unbroken word in its title and
 * a label that needs wrapping. Text that takes two columns a character (Chinese, Japanese, emoji)
 * is left out: the pane counts characters, not columns, so it is known to overflow (see README).
 */
const EXTRA: Record<string, any>[] = [
  { group: 'Release', kind: 'go-ahead', title: 'Push the release branch and tag it', scenario: 'The branch is ready and the checks pass.' },
  { group: 'Release', kind: 'question', title: 'Which staging account the release goes to', scenario: 'Two accounts exist and neither is named for this.' },
  { group: 'Release', kind: 'go-ahead', isTask: true, title: 'Sign in to the package registry', scenario: 'Run the login command and paste nothing here.' },
  {
    group: 'Long text',
    kind: 'choice',
    title: 'How long a shared link lasts, with an unbroken word: supercalifragilisticexpialidocious-recipe-sharing-link',
    scenario: 'A cook shares a recipe with a friend, who opens it on a phone a week later.',
    options: [
      { label: 'A week', changes: 'Links stop working after seven days' },
      { label: 'Never expires, and a label long enough to need wrapping on any pane narrower than a hundred columns', changes: 'Links live for ever' },
    ],
    recommendation: { option: 1, reason: 'Shorter is safer' },
  },
]

async function seed(store: StoreCtx): Promise<Decision[]> {
  await seedUx(store)
  for (const input of EXTRA) {
    const answer = await addDecision(store, input)
    if ('deny' in answer) {
      throw new Error(answer.deny)
    }
  }

  return (await readAll(store)).decisions
}

/** One decision of each kind and state worth drawing: the first of each kind, then a parked, sent, live and ready one, the 12-option one and the long text. */
function decisionsToDraw(all: Decision[]): Decision[] {
  const picked = new Map<string, Decision>()
  for (const d of all) {
    const kind = `${d.kind}${(d as any).isTask ? ' task' : ''}`
    if (!picked.has(kind)) {
      picked.set(kind, d)
    }
    if (!picked.has(d.state)) {
      picked.set(d.state, d)
    }
  }
  const twelve = all.find(d => d.options.length >= 12)
  const wide = all.find(d => d.group === 'Long text')

  return [...new Set([...picked.values(), ...(twelve ? [twelve] : []), ...(wide ? [wide] : [])])]
}

test('the list fits at every size', { timeoutMs: 60_000 }, async ($, on) => {
  const { store } = engine(on)
  await $.session.start({ cwd: '/work/pantry', surface: 'terminal', isInteractive: true })
  await seed(store)
  const ui = await mount($)
  expect(await problemsAtEverySize(ui, 'list')).toEqual([])
  await ui.unmount()
})

test('a decision of every kind and state fits at every size, with its key line and every option in view', { timeoutMs: 120_000 }, async ($, on) => {
  const { store } = engine(on)
  await $.session.start({ cwd: '/work/pantry', surface: 'terminal', isInteractive: true })
  const all = await seed(store)
  const ui = await mount($)
  const problems: string[] = []
  for (const d of decisionsToDraw(all)) {
    await ui.redraw(props(80, 30))
    await open(ui, d.id)
    problems.push(...(await problemsAtEverySize(ui, `${d.id} (${d.kind}, ${d.state})`, { decision: d })))
    await ui.press({ key: 'b' })
  }
  expect(problems).toEqual([])
  await ui.unmount()
})

test('the answer box fits at every size', { timeoutMs: 60_000 }, async ($, on) => {
  const { store } = engine(on)
  await $.session.start({ cwd: '/work/pantry', surface: 'terminal', isInteractive: true })
  const all = await seed(store)
  const choice = all.find(d => d.kind === 'choice' && d.state === 'open')!
  const ui = await mount($)
  await open(ui, choice.id)
  const other = `opt:${choice.options.length + 1}`
  await ui.press({ key: other })
  await ring($, other)
  await ui.press({ key: other })
  await ui.input({ key: 'answer', text: 'Keep them for a month, then ask the cook whether to keep them longer', kind: 'change' })
  expect(await problemsAtEverySize(ui, `${choice.id} answer box`)).toEqual([])
  await ui.unmount()
})

test('the whole thread fits at every size', { timeoutMs: 60_000 }, async ($, on) => {
  const { store } = engine(on)
  await $.session.start({ cwd: '/work/pantry', surface: 'terminal', isInteractive: true })
  const all = await seed(store)
  const discussed = all.find(d => d.thread.length > 0)!
  const ui = await mount($)
  await open(ui, discussed.id)
  await ui.press({ key: 'o' })
  expect(await problemsAtEverySize(ui, `${discussed.id} thread`)).toEqual([])
  await ui.unmount()
})

test('the Session page, the Send screen and the assumptions batch fit at every size', { timeoutMs: 60_000 }, async ($, on) => {
  const { store } = engine(on)
  await $.session.start({ cwd: '/work/pantry', surface: 'terminal', isInteractive: true })
  await seed(store)
  const ui = await mount($)
  const problems: string[] = []

  await ui.redraw(props(80, 30))
  await ui.press({ key: 'session-card' })
  problems.push(...(await problemsAtEverySize(ui, 'Session page')))
  await ui.press({ key: 'b' })

  await ui.redraw(props(80, 30))
  await ui.press({ key: 's' })
  problems.push(...(await problemsAtEverySize(ui, 'Send screen')))
  await ui.press({ key: 'b' })

  await ui.redraw(props(80, 30))
  const batch = (await ui.findAll({ type: 'Button' })).find((b: any) => /^batch(-\d+)?$/.test(String(b.props.key)))
  expect(batch).toBeDefined()
  await ui.press({ key: batch.props.key })
  problems.push(...(await problemsAtEverySize(ui, 'assumptions batch')))

  expect(problems).toEqual([])
  await ui.unmount()
})

test('the empty pane offering other sessions fits at every size', { timeoutMs: 60_000 }, async ($, on) => {
  const { store } = engine(on, 'session-new')
  await $.session.start({ cwd: '/work/pantry', surface: 'terminal', isInteractive: true })
  await seed({ ...store, session: { ...store.session, id: async () => 'session-old' } })
  const ui = await mount($)
  expect(await problemsAtEverySize(ui, 'empty pane')).toEqual([])
  await ui.unmount()
})
