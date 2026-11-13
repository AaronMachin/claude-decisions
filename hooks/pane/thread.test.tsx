import { expect, test } from 'claude-code/testing'

import { RUN, configure } from '../discuss'
import { ChatEntry } from './style'
import { INITIAL_VIEW, PANE_ID } from './decision'
import { UPDATE_TOOL, ADD_TOOL } from '../tool'
import { backFromThread, clipToBudget, revisionChanges, isResendable, leaveThread, noteFor, rowsOf, visibleEntries, when } from './thread'
import type { Decision, ThreadEntry } from '../store'

type On = (event: string, hook: (...args: any[]) => any) => unknown

type Seen = {
  files: Map<string, string>
  statuses: (string | undefined)[]
  opened: any[]
  closed: any[]
  submitted: string[]
  tools: string[]
  commands: string[]
  focused: string[]
}

/** Answers everything the plugin asks of the engine, from memory. */
function engine(on: On, options: { failSubmit?: boolean } = {}): Seen {
  const seen: Seen = { files: new Map(), statuses: [], opened: [], closed: [], submitted: [], tools: [], commands: [], focused: [] }
  on('env.get', () => ({ value: '/home/test' }))
  on('session.cwd', () => ({ value: '/work/pantry' }))
  on('session.id', () => ({ value: 'session-1' }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: '/work/pantry/.git\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('fs.read', (_: any, e: any) => ({ value: seen.files.get(e.path) ?? '' }))
  on('fs.write', (_: any, e: any) => {
    seen.files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.exists', (_: any, e: any) => ({ value: seen.files.has(e.path) }))
  on('fs.list', (_: any, e: any) => ({
    value: [...seen.files.keys()]
      .filter(p => p.startsWith(e.path + '/'))
      .map(p => ({ name: p.slice(e.path.length + 1), kind: 'file', size: 0, mtimeMs: 0, isLink: false })),
  }))
  on('ui.status', (_: any, e: any) => {
    seen.statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.open', (_: any, e: any) => {
    seen.opened.push(e)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_: any, e: any) => {
    seen.closed.push(e)
    return { value: undefined }
  })
  on('ui.invalidate', () => ({ value: undefined }))
  ;(on as any)('ui.focus', { plugin: '*' }, (_: any, e: any) => {
    seen.focused.push(String(e.key ?? e.element))
    return { value: {} }
  })
  on('tool.register', (_: any, e: any) => {
    seen.tools.push(e.name)
    return { value: {} }
  })
  on('command.register', (_: any, e: any) => {
    seen.commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('prompt.submit', (_: any, e: any) => {
    seen.submitted.push(e.text)
    if (options.failSubmit) {
      throw new Error('refused')
    }
    return { text: e.text }
  })
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))

  return seen
}

const GOOD = {
  group: 'Config file plan',
  kind: 'choice',
  title: 'Where the config file lives',
  scenario: 'You run the tool from packages/api and it needs its settings.',
  options: [
    { label: 'Project root', changes: 'one file, shared by every package' },
    { label: 'Per package' },
  ],
  recommendation: { option: 1, reason: 'Every other tool reads from the root.' },
}

const PANE = {
  plugin: 'decisions',
  component: 'Pane',
  requestId: PANE_ID,
  props: { title: 'Decisions', isFocused: true, bodyColumns: 49, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

/**
 * Answering the last waiting decision opens the Send screen (row 270). The tests that mount through this are about
 * what follows on the list or the decision, so the mount holds the answers there with b, as the person would.
 */
async function mountHolding<M extends (props: any) => Promise<any>>($: { ui: { mount: M } }, props: Parameters<M>[0]): Promise<Awaited<ReturnType<M>>> {
  const ui = await $.ui.mount(props)
  const hold = async () => {
    if (await ui.find({ type: 'Text', text: 'That was the last one.' })) {
      await ui.press({ key: 'b' })
    }
  }
  const press = async (args: any) => {
    // One list (row 265): a group with nothing waiting is folded, so a row in it is reached by unfolding its heading.
    if (/^row:/.test(String(args.key)) && !(await ui.find({ key: args.key }))) {
      for (const heading of (await ui.findAll({ type: 'Button' })).filter((b: any) => /^group:/.test(String(b.props.key)))) {
        if (!(await ui.find({ key: args.key }))) {
          await ui.press({ key: heading.props.key })
        }
      }
    }
    const result = await ui.press(args)
    if (args.key !== 'b' && args.key !== 'confirm') {
      await hold()
    }
    return result
  }
  const input = async (args: any) => {
    const result = await ui.input(args)
    await hold()
    return result
  }

  // The kit's handle is frozen, so the wrapper is a view over it with press and input replaced.
  return new Proxy({}, { get: (_target, key) => (key === 'press' ? press : key === 'input' ? input : typeof ui[key] === 'function' ? ui[key].bind(ui) : ui[key]) }) as Awaited<ReturnType<M>>
}

async function start($: any): Promise<void> {
  await $.session.start({ cwd: '/work/pantry', surface: 'terminal', isInteractive: true })
}


const pass = (on: any) => {
  on('turn.start', (_: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
}

async function openThread($: any) {
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  const ui = await mountHolding($, { ...PANE, surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  await ui.press({ key: 'o' })

  return ui
}

async function settle(): Promise<void> {
  for (let i = 0; i < 30; i++) {
    await Promise.resolve()
  }
}

test('o opens the thread, with Ask and the keys, and no Mark answered, d or m', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  const ui = await mountHolding($, { ...PANE, surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  await ui.press({ key: 'o' })
  expect((await ui.find({ key: 'ask' }))?.props.autoFocus).toBe(true)
  expect(await ui.find({ key: 'mark' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'Replies from: main session' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'No discussion yet. Ask a question below.' })).toBeDefined()
  const keys = (await ui.findAll({ type: 'Button' })).map(b => b.props.key)
  expect(keys).toEqual(expect.arrayContaining(['b', 'h']))
  expect(keys).not.toContain('d')
  expect(keys).not.toContain('m')
  expect(keys).not.toContain('f')
  await ui.press({ key: 'b' })
  expect(await ui.find({ key: 'opt:1' })).toBeDefined()
  await ui.unmount()
})

test('asking in the main session shows the question, the waiting note, then the reply with the note cleared', async ($, on) => {
  const seen = engine(on)
  pass(on)
  const ui = await openThread($)
  await ui.press({ key: 'ask' })
  await ui.input({ key: 'ask-input', text: 'Does CI find it?' })
  await settle()
  expect(seen.submitted).toEqual(['On decision 1 · Where the config file lives: Does CI find it?'])
  expect(await ui.find({ type: 'Text', text: 'Does CI find it?' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'sent, waiting for Claude' })).toBeDefined()
  await $.turn.start({ text: 'something else entirely', turnId: 'other' })
  await $.turn.complete({ turnId: 'other', answer: 'not for us' } as any)
  expect(await ui.find({ type: 'Text', text: 'not for us' })).toBeUndefined()
  await $.turn.start({ text: `The decisions plugin sent a message:\n${seen.submitted[0]}\n\nThis is how Claude Code surfaces a prompt a plugin submits between turns.`, turnId: 'mine' })
  expect(await ui.find({ type: 'Text', text: 'Claude is answering' })).toBeDefined()
  await $.turn.complete({ turnId: 'mine', answer: 'Yes, from the root.' } as any)
  await settle()
  expect(await ui.find({ type: 'Text', text: 'Yes, from the root.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Claude is answering' })).toBeUndefined()
  await ui.unmount()
})

test('a question sent while a turn runs shows the queued note and the f key, and f hands it to the fork', async ($, on) => {
  const seen = engine(on)
  pass(on)
  const ui = await openThread($)
  await $.turn.start({ text: 'read eight files', turnId: 'busy' })
  await ui.press({ key: 'ask' })
  await ui.input({ key: 'ask-input', text: 'Which is cheaper?' })
  await settle()
  expect(await ui.find({ type: 'Text', text: 'queued, Claude is mid-step' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'f send it to the fork instead' })).toBeDefined()
  expect((await ui.find({ key: 'f' }))?.props.hotkey).toBe('f')
  await ui.press({ key: 'f' })
  await settle()
  expect(await ui.find({ type: 'Text', text: 'queued, Claude is mid-step' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /main-session copy is still queued/ })).toBeDefined()
  expect(seen.submitted).toHaveLength(1)
  await ui.unmount()
})

test('a half-typed question survives hiding the pane and reopening the thread', async ($, on) => {
  engine(on)
  const ui = await openThread($)
  await ui.press({ key: 'ask' })
  await ui.input({ key: 'ask-input', text: 'half a thou', kind: 'change' })
  await ui.unmount()
  const again = await mountHolding($, { ...PANE, surface: 'terminal' })
  expect((await again.find({ key: 'ask-input' }))?.text).toContain('half a thou')
  await again.input({ key: 'ask-input', text: '' })
  expect(await again.find({ key: 'ask-input' })).toBeUndefined()
  expect(await again.find({ key: 'ask' })).toBeDefined()
  await again.unmount()
})

test('the thread no longer answers: a typed answer goes in Something else, and b comes back to the decision ready for it', async ($, on) => {
  const seen = engine(on)
  const ui = await openThread($)
  expect(await ui.find({ key: 'mark' })).toBeUndefined()
  expect(await ui.find({ key: 'd' })).toBeUndefined()
  await ui.press({ key: 'b' })
  await ui.press({ key: 'opt:3' })
  await ($ as any).ui.focus({ component: 'Pane', requestId: PANE_ID, plugin: 'decisions', element: 'opt:3', origin: { kind: 'plugin' } })
  await ui.press({ key: 'opt:3' })
  await ui.input({ key: 'answer', text: 'from the root, after the move' })
  expect(await ui.find({ key: 'group:g:Config file plan' })).toBeDefined()
  expect(seen.statuses.at(-1)).toBe('nothing needs you · 1 not sent')
  expect(seen.submitted).toEqual([])
  await ui.unmount()
})

test('a ↻ line opens the earlier version and b returns to the thread', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  await $.tool.call({ tool: UPDATE_TOOL, id: 'd1', summary: 'Added option 3, Third', addOptions: [{ label: 'Third' }], recommendation: { option: 3, reason: 'fits' } })
  const ui = await mountHolding($, { ...PANE, surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  await ui.press({ key: 'o' })
  expect((await ui.find({ key: 'rev:0' }))?.text).toContain('↻ Added option 3, Third')
  await ui.press({ key: 'rev:0' })
  expect(await ui.find({ type: 'Text', text: 'Before: Added option 3, Third' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Why 1: Every other tool/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^\s+3 {2}Third/ })).toBeUndefined()
  await ui.press({ key: 'b' })
  expect(await ui.find({ key: 'ask' })).toBeDefined()
  await ui.unmount()
})

test('a long thread in a short pane keeps only the newest entries and the key row in the tree', async ($, on) => {
  const seen = engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  const file = [...seen.files.keys()].find(k => k.endsWith('d1.json'))!
  const d = JSON.parse(seen.files.get(file)!)
  d.thread = Array.from({ length: 60 }, (_, i) => ({ who: i % 2 ? 'claude' : 'person', text: `entry number ${i}`, at: `2026-11-05T10:${String(i).padStart(2, '0')}:00.000Z` }))
  seen.files.set(file, JSON.stringify(d))
  const ui = await mountHolding($, { ...PANE, props: { ...PANE.props, scroll: { offset: 0, bodyRows: 24 } }, surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  await ui.press({ key: 'o' })
  expect(await ui.find({ type: 'Text', text: 'entry number 59' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'entry number 0' })).toBeUndefined()
  const keys = (await ui.findAll({ type: 'Button' })).map(b => b.props.key)
  expect(keys).toEqual(expect.arrayContaining(['o', 'b', 'h', 'ask']))
  expect(keys).not.toContain('n')
  await ui.press({ key: 'o' })
  expect((await ui.find({ key: 'n' }))?.props.hotkey).toBe('n')
  await ui.unmount()
})

const entry = (text: string, who: ThreadEntry['who'] = 'person'): ThreadEntry => ({ who, text, at: text })

test('visibleEntries keeps the newest that fit, pages with skip and always shows one', () => {
  const thread = Array.from({ length: 10 }, (_, i) => entry(`e${i}`))
  // A chat line is one row: the speaker and the text share it (row 251).
  const first = visibleEntries(thread, 0, 3, 40)
  expect(first.shown.map(e => e.text)).toEqual(['e7', 'e8', 'e9'])
  expect(first.olderHidden).toBe(7)
  expect(visibleEntries(thread, 3, 3, 40).shown.map(e => e.text)).toEqual(['e4', 'e5', 'e6'])
  expect(visibleEntries(thread, 3, 3, 40).newerHidden).toBe(3)
  expect(visibleEntries(thread, 0, 0, 40).shown).toHaveLength(1)
  expect(visibleEntries([entry('x'.repeat(200))], 0, 4, 20).shown).toHaveLength(1)
})

test('notes, resend rules and the back key of the thread', () => {
  const p = { asked: 'a', decisionId: 'd1', mode: 'main' as const, status: 'queued' as const, run: RUN }
  expect(noteFor(p, RUN)).toBe('queued, Claude is mid-step')
  expect(noteFor({ ...p, status: 'waiting' }, RUN)).toBe('sent, waiting for Claude')
  expect(noteFor({ ...p, status: 'answering' }, RUN)).toBe('Claude is answering')
  expect(noteFor({ ...p, mode: 'fork', status: 'answering' }, RUN)).toBe('asking the fork')
  expect(noteFor({ ...p, mode: 'quick', status: 'answering' }, RUN)).toBe('asking the quick model')
  expect(noteFor({ ...p, status: 'failed', reason: 'api-error' }, RUN)).toBe('no reply: api-error')
  expect(noteFor({ ...p, run: 'old' }, RUN)).toBe('no reply: the pane was reloaded')
  expect(isResendable(p, RUN)).toBe(true)
  expect(isResendable({ ...p, status: 'answering' }, RUN)).toBe(false)
  expect(isResendable({ ...p, status: 'answering', run: 'old' }, RUN)).toBe(true)

  const thread = { ...INITIAL_VIEW, screen: 'thread' as const }
  expect(backFromThread({ ...thread, revisionIndex: 0 }).view.revisionIndex).toBeUndefined()
  expect(backFromThread(thread).view.screen).toBe('decision')
  expect(when('2026-11-04T10:42:00', new Date('2026-11-07T09:00:00'))).toBe('4 Nov 10:42')
  expect(when('2026-11-07T10:42:00', new Date('2026-11-07T09:00:00'))).toBe('10:42')
})

test('under a fork reply there is no m: it hides and shows detail on the decision now, and asks nothing again', async ($, on) => {
  const seen = engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  const file = [...seen.files.keys()].find(k => k.endsWith('d1.json'))!
  const d = JSON.parse(seen.files.get(file)!)
  d.thread = [
    { who: 'person', text: 'can you see the files?', at: '2026-11-07T10:00:00.000Z' },
    { who: 'fork', text: 'No, I cannot read files.', at: '2026-11-07T10:00:05.000Z' },
  ]
  seen.files.set(file, JSON.stringify(d))
  const ui = await mountHolding($, { ...PANE, surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  await ui.press({ key: 'o' })
  expect(await ui.find({ key: 'm' })).toBeUndefined()
  await settle()
  expect(seen.submitted).toEqual([])
  await ui.unmount()
})

for (const [value, label] of [['fork', 'fork'], ['quick model', 'quick model'], ['main session', 'main session']] as const) {
  test(`the setting ${value} shows who replies`, { options: { discussionReplies: value } }, async ($, on) => {
    engine(on)
    const ui = await openThread($)
    expect(await ui.find({ type: 'Text', text: `Replies from: ${label}` })).toBeDefined()
    await ui.unmount()
  })
}

test('with the setting on fork, a question is not sent to the main session', { options: { discussionReplies: 'fork' } }, async ($, on) => {
  const seen = engine(on)
  const ui = await openThread($)
  await ui.press({ key: 'ask' })
  await ui.input({ key: 'ask-input', text: 'who answers?' })
  await settle()
  expect(seen.submitted).toEqual([])
  expect(await ui.find({ type: 'Text', text: /^no reply: / })).toBeDefined()
  await ui.unmount()
})

test('the thread keeps its key row: rows are counted generously and one long entry is clipped to the room', () => {
  expect(rowsOf(entry('word '.repeat(20)), 22)).toBeGreaterThanOrEqual(7)
  const long = [entry('x'.repeat(2000), 'claude')]
  expect(clipToBudget(long[0]!, 6, 40).text.length).toBeLessThan(6 * 38)
  expect(rowsOf(clipToBudget(long[0]!, 6, 40), 40)).toBeLessThanOrEqual(6)
  expect(clipToBudget(entry('short'), 6, 40).text).toBe('short')
})

test('leaving the thread changes only the screen fields of the view it is given', () => {
  const live = { ...INITIAL_VIEW, screen: 'thread' as const, pending: [{ asked: 'a', decisionId: 'd1', mode: 'main' as const, status: 'answering' as const, run: RUN }] }
  expect(leaveThread(live).pending).toEqual(live.pending)
  expect(leaveThread(live).screen).toBe('decision')
})

test('thread entries read as a chat: speaker and age, then the text on the same line', async ($, on) => {
  const at = new Date(Date.now() - 2 * 60_000).toISOString()
  on('ui.render', ($$: any, e: any) => ChatEntry($$.ui.resolve(e), { who: 'person', at, text: 'would c work on findings too?' }, 60, 'chat'))
  const ui = await mountHolding($, { plugin: 'decisions', component: 'Pane', requestId: 'x', surface: 'terminal', props: { title: 't', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 10 }, view: {} } } as any)
  expect((await ui.find({ key: 'chat' }))?.text).toBe('you · 2m  would c work on findings too?')
  expect(JSON.stringify(await ui.find({ key: 'chat' }))).toContain('"color":"suggestion"')
  await ui.unmount()
})

function decision(over: Partial<Decision> = {}): Decision {
  return {
    version: 1, id: 'd1', number: 1, section: 'needs-you', kind: 'choice', title: 't', scenario: 's',
    options: [{ id: 1, label: 'Red' }, { id: 2, label: 'Blue' }],
    recommendation: { option: 1, reason: 'r' },
    sources: [], dependsOn: [], state: 'open', thread: [], revisions: [], createdAt: 't', updatedAt: 't',
    ...over,
  }
}

test('what changed: an added option, a moved recommendation and a renamed option; none when nothing visible changed', () => {
  const before = decision()
  const { revisions: _r, thread: _t, ...was } = before
  const after = decision({ options: [{ id: 1, label: 'Red' }, { id: 2, label: 'Navy' }, { id: 3, label: 'Green' }], recommendation: { option: 3, reason: 'r' } })
  expect(revisionChanges(was, after)).toEqual([
    { kind: 'added', text: '+ 3  Green' },
    { kind: 'renamed', text: '~ 2  Blue → Navy', old: 'Blue', number: 2, label: 'Navy' },
    { kind: 'recommendation', text: '★ recommendation 1 → 3' },
  ])
  expect(revisionChanges(was, decision({ blocks: 'the plan' }))).toEqual([])
})

test('a ↻ line in the thread is followed by what changed, the old label struck through', async ($, on) => {
  const seen = engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  await $.tool.call({ tool: UPDATE_TOOL, id: 'd1', summary: 'Added option 3, Third', addOptions: [{ label: 'Third' }], recommendation: { option: 3, reason: 'fits' } })
  await $.tool.call({ tool: UPDATE_TOOL, id: 'd1', summary: 'Blocks the plan', blocks: 'the plan' })
  const path = [...seen.files.keys()].find(p => p.endsWith('/d1.json'))!
  const stored = JSON.parse(seen.files.get(path)!)
  stored.options[1].label = 'Each package'
  stored.revisions.push({ at: new Date().toISOString(), summary: 'Renamed 2', before: { ...stored, options: stored.options.map((o: any) => (o.id === 2 ? { ...o, label: 'Per package' } : o)), revisions: undefined, thread: undefined } })
  stored.thread.push({ who: 'claude', text: '↻ Renamed 2', at: new Date().toISOString(), revision: stored.revisions.length - 1 })
  seen.files.set(path, JSON.stringify(stored))
  const ui = await mountHolding($, { ...PANE, props: { ...PANE.props, scroll: { offset: 0, bodyRows: 40 } }, surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  await ui.press({ key: 'o' })
  const spans = (await ui.findAll({ type: 'Text' })) as any[]
  expect(spans.find(t => t.text === '  + 3  Third')?.props.color).toBe('success')
  expect(spans.find(t => t.text === '  ★ recommendation 1 → 3')?.props.color).toBe('warning')
  expect(spans.find(t => t.text === 'Per package')?.props.strikethrough).toBe(true)
  expect(spans.some(t => /^ {2}~ 2 {2}Per package → Each package$/.test(t.text))).toBe(true)
  // The blocks change shows nothing under its ↻ line.
  expect((await ui.find({ key: 'changes:1' }))).toBeUndefined()
  await ui.unmount()
})

test('auto: a question asked on the thread screen goes to the small model first, and its answer reads "quick answer"', async ($, on) => {
  const seen = engine(on)
  pass(on)
  const asked: any[] = []
  on('model.complete', (_: any, e: any) => {
    asked.push(e)
    return { value: { isAnswered: true, text: /HAND OVER/.test(e.system ?? '') ? 'ANSWER\nIt checks each parent folder.' : 'Where settings live' } } as any
  })
  configure({ discussionReplies: 'auto' })
  try {
    const ui = await openThread($)
    await ui.press({ key: 'ask' })
    await ui.input({ key: 'ask-input', text: 'What does walking up mean?' })
    await settle()
    expect(asked.some(e => /HAND OVER/.test(e.system ?? ''))).toBe(true)
    expect(seen.submitted).toEqual([])
    expect(await ui.find({ type: 'Text', text: 'quick answer' })).toBeDefined()
    await ui.unmount()
  } finally {
    configure({})
  }
})
