import { expect, test } from 'claude-code/testing'

import { PANE_ID, INITIAL_VIEW } from './pane/decision'
import { tabsFor } from './pane/list'
import { ringTarget } from './pane/render'
import { NUDGE } from './integrate'
import { ADD_TOOL, LIST_TOOL, UPDATE_TOOL } from './tool'

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
  /** The id `$.session.id()` answers; a test changes it to be another session. */
  session: string
}

/** Answers everything the plugin asks of the engine, from memory. */
function engine(on: On, options: { failSubmit?: boolean } = {}): Seen {
  const seen: Seen = { files: new Map(), statuses: [], opened: [], closed: [], submitted: [], tools: [], commands: [], focused: [], session: 'session-1' }
  on('env.get', () => ({ value: '/home/test' }))
  on('session.cwd', () => ({ value: '/work/pantry' }))
  on('session.id', () => ({ value: seen.session }))
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
  on('ui.focus', (_: any, e: any) => {
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

/** The ring moving onto `key`, as the engine reports it: what the digit's own `$.ui.focus` does in a real session, which the kit doesn't carry out. */
async function ringOn($: any, key: string): Promise<void> {
  await $.ui.focus({ component: 'Pane', requestId: PANE_ID, plugin: 'decisions', element: key, origin: { kind: 'plugin' } })
}

/** A number key, then enter on the option it highlighted; one press when the ring already starts there (decision 219). */
async function answer($: any, ui: any, option: number): Promise<void> {
  await ui.press({ key: `opt:${option}` })
  if (await ui.find({ key: `opt:${option}` })) {
    await ringOn($, `opt:${option}`)
    await ui.press({ key: `opt:${option}` })
  }
}

async function start($: any): Promise<void> {
  await $.session.start({ cwd: '/work/pantry', surface: 'terminal', isInteractive: true })
}

test('session.start registers /decisions and both tools and sets the status line', async ($, on) => {
  const seen = engine(on)
  await start($)
  expect(seen.commands).toContain('decisions')
  expect(seen.tools).toEqual(['decisions_add', 'decisions_list', 'decisions_update'])
  expect(seen.statuses.at(-1)).toBeUndefined()
  expect(seen.statuses).toHaveLength(1)
})

test('adding a decision stores it, opens the pane unfocused and updates the status line', async ($, on) => {
  const seen = engine(on)
  await start($)
  const answer = await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  expect(JSON.stringify(answer)).toContain('Added d1 to the pane. 1 open.')
  expect(seen.opened).toHaveLength(1)
  expect(seen.opened[0].focus).toBeUndefined()
  expect(seen.statuses.at(-1)).toBe('1 open')
})

test('a hidden pane stays hidden when Claude adds a decision, but the count still goes up', async ($, on) => {
  const seen = engine(on)
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'h' })
  await ui.unmount()
  expect(seen.closed).toHaveLength(1)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  expect(seen.opened).toHaveLength(0)
  expect(seen.statuses.at(-1)).toBe('1 open')
})

test('a malformed add is denied with the reason', async ($, on) => {
  engine(on)
  await start($)
  const answer = await $.tool.call({ tool: ADD_TOOL, ...GOOD, scenario: '' })
  expect(JSON.stringify(answer)).toMatch(/scenario is required/)
})

test('decisions_list returns what was added', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  expect(JSON.stringify(await $.tool.call({ tool: LIST_TOOL }))).toContain('d1 [Config file plan] open: Where the config file lives')
})

test('/decisions opens the pane with the keys and clears hidden', async ($, on) => {
  const seen = engine(on)
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'h' })
  await $.command.run({ command: 'decisions', args: '' } as any)
  expect(seen.opened.at(-1)).toMatchObject({ id: PANE_ID, focus: true })
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  expect(seen.opened).toHaveLength(2)
  await ui.unmount()
})

test('a ring move onto an option or the ask box is taken by the pane without error', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  await $.ui.focus({ component: 'Pane', requestId: PANE_ID, plugin: 'decisions', element: 'opt:2', origin: { kind: 'person' } })
  // The highlight itself is state the kit can't read back and `b` then needs $.ui.focus, which the kit refuses; the real session covers both.
  await $.ui.focus({ component: 'Pane', requestId: PANE_ID, plugin: 'decisions', element: 'ask-inline', origin: { kind: 'person' } })
  expect(await ui.find({ key: 'opt:2' })).toBeDefined()
  await ui.unmount()
})

test('the header says keys on or keys off, on every screen', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  for (const isFocused of [true, false]) {
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused }, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: isFocused ? 'keys on' : 'keys off' })).toBeDefined()
    expect(!!(await ui.find({ type: 'Text', text: /pane focus key/ }))).toBe(!isFocused)
    await ui.press({ key: 'row:d1' })
    expect(await ui.find({ type: 'Text', text: isFocused ? 'keys on' : 'keys off' })).toBeDefined()
    await ui.press({ key: 'b' })
    await ui.unmount()
  }
})

test('enter on the first row opens the decision; a number highlights, the same number or enter answers it and returns to the list', async ($, on) => {
  const seen = engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ key: 'row:d1' }))?.props.autoFocus).toBe(true)
  await ui.press({ key: 'row:d1' })
  expect(await ui.find({ key: 'opt:2' })).toBeDefined()
  expect((await ui.find({ key: 'opt:1' }))?.props.autoFocus).toBe(true)
  await ui.press({ key: 'opt:2' })
  expect(await ui.find({ key: 'card:2' })).toBeDefined()
  expect(await ui.find({ key: 'row:d1' })).toBeUndefined()
  await ringOn($, 'opt:2')
  await ui.press({ key: 'opt:2' })
  expect(await ui.find({ key: 'row:d1' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Answered  1' })).toBeDefined()
  expect(seen.statuses.at(-1)).toBe('nothing needs you · 1 ready')
  await ui.press({ key: 'row:d1' })
  expect((await ui.find({ key: 'line:2' }))?.text).toMatch(/Per package {2}✓ your answer/)
  expect((await ui.find({ key: 'line:1' }))?.text).not.toMatch(/✓/)
  await ui.unmount()
})

test('send: nothing is submitted until confirm, and only ticked answers go', async ($, on) => {
  const seen = engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  await $.tool.call({ tool: ADD_TOOL, ...GOOD, title: 'Second one' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  for (const [id, option] of [['d1', 1], ['d2', 2]] as const) {
    await ui.press({ key: `row:${id}` })
    await answer($, ui, option)
  }
  await ui.press({ key: 's' })
  expect(seen.submitted).toEqual([])
  expect((await ui.find({ key: 'tick:d1' }))?.text).toMatch(/^› \[x\]/)
  await ui.press({ key: 'tick:d1' })
  expect((await ui.find({ key: 'tick:d1' }))?.text).toMatch(/^› \[ \]/)
  expect(seen.submitted).toEqual([])
  await ui.press({ key: 'confirm' })
  await Promise.resolve()
  await Promise.resolve()
  expect(seen.submitted).toHaveLength(1)
  expect(seen.submitted[0]).toContain('Decision d2')
  expect(seen.submitted[0]).not.toContain('Decision d1')
  expect(seen.statuses.at(-1)).toBe('nothing needs you · 1 ready')
  await ui.unmount()
})

test('a parked draft survives hiding the pane, and an empty enter cancels', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  await ui.press({ key: 'p' })
  await ui.input({ key: 'park', text: 'waiting', kind: 'change' })
  await ui.unmount()
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ key: 'park' }))?.text).toContain('waiting')
  await ui.input({ key: 'park', text: '' })
  expect(await ui.find({ key: 'park' })).toBeUndefined()
  await ui.press({ key: 'p' })
  await ui.input({ key: 'park', text: 'waiting on design' })
  expect(await ui.find({ type: 'Text', text: 'Parked  1' })).toBeDefined()
  await ui.unmount()
})

test('the option rows carry their own number keys, there is no digit row, and b is not on the list', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ key: 'b' })).toBeUndefined()
  await ui.press({ key: 'row:d1' })
  const keys = (await ui.findAll({ type: 'Button' })).map(b => b.props.key)
  expect(keys).toEqual(expect.arrayContaining(['opt:1', 'opt:2', 'a', 'b', 'p', 'h']))
  expect(keys.some(k => /^digit:/.test(String(k)))).toBe(false)
  expect(keys).not.toContain('s')
  expect((await ui.find({ key: 'opt:2' }))?.props.hotkey).toBe('2')
  await ui.unmount()
})

test('p on a parked decision puts it back to open, through the pane', async ($, on) => {
  const seen = engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  await ui.press({ key: 'p' })
  await ui.input({ key: 'park', text: 'later' })
  expect(seen.statuses.at(-1)).toBe('nothing needs you · 1 parked')
  await ui.press({ key: 't' })
  await ui.press({ key: 'row:d1' })
  expect((await ui.find({ key: 'p' }))?.text).toMatch(/unpark/)
  await ui.press({ key: 'p' })
  expect(seen.statuses.at(-1)).toBe('1 open')
  await ui.unmount()
})

test('a sent decision offers only b, and review back sends nothing', async ($, on) => {
  const seen = engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  await answer($, ui, 1)
  await ui.press({ key: 's' })
  await ui.press({ key: 'b' })
  expect(seen.submitted).toEqual([])
  await ui.press({ key: 's' })
  await ui.press({ key: 'confirm' })
  await Promise.resolve()
  await Promise.resolve()
  expect(seen.submitted).toHaveLength(1)
  expect(seen.statuses.at(-1)).toBeUndefined()
  await ui.press({ key: 'row:d1' })
  const keys = (await ui.findAll({ type: 'Button' })).map(b => b.props.key)
  expect(keys).toContain('b')
  expect(keys).not.toEqual(expect.arrayContaining(['s']))
  expect(keys).not.toContain('h')
  expect(keys).not.toContain('p')
  expect((await ui.find({ key: 'opt:1' }))?.props.hotkey).toBeUndefined()
  await ui.unmount()
})

test('a send that fails shows its notice in the pane and the answers are ready again', async ($, on) => {
  const seen = engine(on, { failSubmit: true })
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  await answer($, ui, 1)
  await ui.press({ key: 's' })
  await ui.press({ key: 'confirm' })
  for (let i = 0; i < 20; i++) {
    await Promise.resolve()
  }
  expect(seen.statuses.at(-1)).toBe('nothing needs you · 1 ready')
  expect(await ui.find({ type: 'Text', text: /not sent/ })).toBeDefined()
  await ui.unmount()
})

test('decisions_update through the hooks revises the decision and refreshes the pane', async ($, on) => {
  const seen = engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  const answer = await $.tool.call({
    tool: UPDATE_TOOL,
    id: 'd1',
    summary: 'Added option 3, Third',
    addOptions: [{ label: 'Third' }],
  })
  expect(JSON.stringify(answer)).toContain('Updated d1: Added option 3, Third')
  const file = [...seen.files.entries()].find(([k]) => k.endsWith('d1.json'))![1]
  expect(JSON.parse(file).revisions).toHaveLength(1)
  expect(JSON.stringify(await $.tool.call({ tool: UPDATE_TOOL, id: 'd9', summary: 'x', addOptions: [{ label: 'a' }] }))).toContain('no such decision')
})

test('the turn hooks pass an unrelated turn through untouched', async ($, on) => {
  engine(on)
  on('turn.start', (_: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  await start($)
  const started = await $.turn.start({ text: 'read the files', turnId: 't1' })
  expect(started.turnId).toBe('t1')
  const done = await $.turn.complete({ turnId: 't1', answer: 'done' } as any)
  expect(done).toBeDefined()
})

test('a subagent cannot add or update a decision, and can still list', async ($, on) => {
  const seen = engine(on)
  await start($)
  const refused = await $.tool.call({ tool: ADD_TOOL, agentId: 'a1', ...GOOD })
  expect(JSON.stringify(refused)).toContain('Only the main session adds decisions')
  expect([...seen.files.keys()].some(k => k.endsWith('d1.json'))).toBe(false)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  const update = await $.tool.call({ tool: UPDATE_TOOL, agentId: 'a1', id: 'd1', summary: 'x', addOptions: [{ label: 'a' }] })
  expect(JSON.stringify(update)).toContain('Only the main session adds decisions')
  expect(JSON.stringify(await $.tool.call({ tool: LIST_TOOL, agentId: 'a1' }))).toContain('d1')
})

test('AskUserQuestion lands in the pane and is answered with the object shape', async ($, on) => {
  const seen = engine(on)
  await start($)
  const questions = [{ question: 'Where should links live?', header: 'Links', options: [{ label: 'Database', description: 'a table' }, { label: 'Signed URL', description: 'nothing stored' }], multiSelect: false }]
  const answer: any = await $.tool.call({ tool: 'AskUserQuestion', questions })
  expect(JSON.stringify(answer)).toContain('Added to the decisions pane as 1.')
  expect(JSON.stringify(answer)).toContain('"answers":{}')
  const file = [...seen.files.entries()].find(([k]) => k.endsWith('d1.json'))![1]
  expect(JSON.parse(file).group).toBe('Questions from Claude')
  expect(seen.opened).toHaveLength(1)
  const refused = await $.tool.call({ tool: 'AskUserQuestion', agentId: 'a1', questions })
  expect(JSON.stringify(refused)).toContain('Only the main session adds decisions')
})

test('the compose and context hooks add the rules section and the open list', async ($, on) => {
  engine(on)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'x', scope: 'shared' }] }))
  on('prompt.context', () => ({ blocks: [] }))
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  const input = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] }
  const composed = await $.prompt.compose(input)
  expect(composed.sections.map((s: any) => s.id)).toEqual(['intro', 'decisions:rules'])
  const again = await $.prompt.compose(input)
  expect(again.sections[1]!.text).toBe(composed.sections[1]!.text)
})

const nudges = (appended: any[]) => appended.filter(a => JSON.stringify(a).includes(NUDGE)).length

test('a turn that ends with questions in chat gets the nudge appended once through turn.complete', async ($, on) => {
  engine(on)
  const appended: any[] = []
  on('session.messages', (): any => ({
    value: [
      { role: 'user', text: 'plan sharing' },
      { role: 'assistant', text: 'Two things.\n1. Redis?\n2. Postgres?' },
    ],
  }))
  on('session.append', (_: any, e: any, next: any) => {
    appended.push(e)
    return next(e)
  })
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  await start($)
  await $.turn.complete({ turnId: 't1', reason: 'answer', answer: 'Two things.\n1. Redis?\n2. Postgres?' } as any)
  expect(nudges(appended)).toBe(1)
  await $.turn.complete({ turnId: 't1', reason: 'answer', answer: 'Two things.\n1. Redis?\n2. Postgres?' } as any)
  expect(nudges(appended)).toBe(1)
})

test('a turn that ends with a statement gets no nudge', async ($, on) => {
  engine(on)
  const appended: any[] = []
  on('session.messages', (): any => ({ value: [{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'Added 2 decisions.' }] }))
  on('session.append', (_: any, e: any, next: any) => {
    appended.push(e)
    return next(e)
  })
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  await start($)
  await $.turn.complete({ turnId: 't2', reason: 'answer', answer: 'Added 2 decisions.' } as any)
  expect(nudges(appended)).toBe(0)
})

test("a person's move onto a tab keeps the ring where it was", async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  await $.tool.call({ tool: ADD_TOOL, ...GOOD, group: 'Recipe sharing', title: 'Second one' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await $.ui.focus({ component: 'Pane', requestId: PANE_ID, plugin: 'decisions', element: 'row:d2', origin: { kind: 'person' } })
  const kept = await $.ui.focus({ component: 'Pane', requestId: PANE_ID, plugin: 'decisions', element: 'tab:g:Config file plan', origin: { kind: 'person' } })
  expect(kept.deny).toBeUndefined()
  expect((await ui.find({ key: 'tab:g:Config file plan' }))?.text).not.toMatch(/›/)
  expect((await ui.find({ key: 'row:d2' }))?.text).toMatch(/^›/)
  await ui.unmount()
})

test('a move onto a row draws › on it while the pane has the keys, and none with the keys off', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  await $.tool.call({ tool: ADD_TOOL, ...GOOD, title: 'Second one' })
  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await $.ui.focus({ component: 'Pane', requestId: PANE_ID, plugin: 'decisions', element: 'row:d2', origin: { kind: 'person' } })
  expect((await ui.find({ key: 'row:d2' }))?.text).toMatch(/^› d2/)
  expect((await ui.find({ key: 'row:d1' }))?.text).toMatch(/^ {2}d1/)
  await ui.unmount()
  ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: false }, surface: 'terminal' })
  expect((await ui.find({ key: 'row:d2' }))?.text).toMatch(/^ {2}d2/)
  await ui.unmount()
})

test('› is drawn only on a key that is in the tree', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await $.ui.focus({ component: 'Pane', requestId: PANE_ID, plugin: 'decisions', element: 'opt:9', origin: { kind: 'person' } })
  await ui.press({ key: 'row:d1' })
  const marked = (await ui.findAll({ type: 'Button' })).filter(b => /^›/.test(b.text ?? ''))
  expect(marked).toHaveLength(0)
  await ui.unmount()
})

test('a move onto an option marks that option', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  await $.ui.focus({ component: 'Pane', requestId: PANE_ID, plugin: 'decisions', element: 'opt:2', origin: { kind: 'person' } })
  expect((await ui.find({ key: 'line:2' }))?.text).toMatch(/^› {2}Per package/)
  expect((await ui.find({ key: 'line:1' }))?.text).toMatch(/^ {3}Project root/)
  await ui.unmount()
})

const TWELVE = {
  ...GOOD,
  title: 'Which of twelve storage places',
  scenario: 'Recipes need a home. There are twelve places they could live, each with its own cost.',
  options: Array.from({ length: 12 }, (_, i) => ({ label: `Place ${i + 1}`, changes: `what place ${i + 1} costs` })),
  recommendation: { option: 1, reason: 'It is the one already in use.' },
}

/** Rows a drawn tree takes on the terminal: a column stacks its children, a row is as tall as its tallest, a border adds two. */
function lineCount(node: any): number {
  if (node === null || node === undefined || node === '' || typeof node === 'boolean') {
    return 0
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return 1
  }
  if (Array.isArray(node)) {
    return node.reduce((n: number, child: any) => n + lineCount(child), 0)
  }
  if (node.type !== 'Box') {
    return 1
  }
  const children: any[] = (node.children ?? []).flat()
  const inner =
    node.props?.flexDirection === 'column'
      ? children.reduce((n: number, child: any) => n + lineCount(child), 0)
      : Math.max(0, ...children.map((child: any) => lineCount(child)))

  return inner + (node.props?.borderStyle ? 2 : 0)
}

function findBox(node: any, match: (props: any) => boolean): any {
  if (node === null || typeof node !== 'object') {
    return undefined
  }
  if (Array.isArray(node)) {
    return node.map(child => findBox(child, match)).find(Boolean)
  }
  if (node.type === 'Box' && match(node.props ?? {})) {
    return node
  }

  return (node.children ?? []).map((child: any) => findBox(child, match)).find(Boolean)
}

const SHORT = (rows: number, bodyColumns = 90) => ({ ...PANE, props: { ...PANE.props, bodyColumns, scroll: { offset: 0, bodyRows: rows } } })

test('the header is the title in bold with keys on at the right, then the crumb', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  const header = await ui.find({ key: 'header' })
  expect(header?.text).toMatch(/^Where the config file lives +keys on/)
  expect((await ui.find({ type: 'Text', text: 'Where the config file lives' }))?.props.bold).toBe(true)
  // At 49 columns the crumb is cut at the edge.
  expect(await ui.find({ type: 'Text', text: /^CHOICE · d1 · Config file plan · ○ 0 of 1 answer/ })).toBeDefined()
  await ui.unmount()
})

test('options 1 to 10 carry their own keys (0 for 10), 11 and 12 none', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...TWELVE })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, scroll: { offset: 0, bodyRows: 40 } }, surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  expect((await ui.find({ key: 'opt:1' }))?.props.hotkey).toBe('1')
  expect((await ui.find({ key: 'opt:10' }))?.props.hotkey).toBe('0')
  expect((await ui.find({ key: 'opt:11' }))?.props.hotkey).toBeUndefined()
  expect((await ui.find({ key: 'opt:11' }))?.text).toMatch(/^11: Place 11/)
  await ui.unmount()
})

test('the highlighted option is a card holding its description and why; with the detail hidden the others show the label only', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  await ui.press({ key: 'm' })
  await ui.press({ key: 'opt:2' })
  await ringOn($, 'opt:2')
  expect(await ui.find({ type: 'Text', text: /one file, shared/ })).toBeUndefined()
  await ui.press({ key: 'opt:1' })
  const card = findBox(await ui.drawn(), props => props.borderStyle === 'round')
  expect(card?.props.borderColor).toBe('claude')
  expect(JSON.stringify(card)).toContain('one file, shared by every package')
  expect(JSON.stringify(card)).toContain('Why: Every other tool reads from the root.')
  expect(JSON.stringify(card)).toContain('opt:1')
  expect(JSON.stringify(card)).not.toContain('opt:2')
  expect((await ui.find({ key: 'line:1' }))?.text).toMatch(/★ recommended/)
  await ui.unmount()
})

test('the whole scenario and the sources show by default; m hides them down to 3 lines and shows them again', async ($, on) => {
  engine(on)
  await start($)
  const long = Array.from({ length: 12 }, (_, i) => `Sentence ${i + 1} of the scenario.`).join(' ')
  await $.tool.call({ tool: ADD_TOOL, ...GOOD, scenario: long, sources: [{ label: 'config.ts', path: 'src/config.ts' }] })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, scroll: { offset: 0, bodyRows: 40 } }, surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  const context = async () => (await ui.findAll({ type: 'Text' })).filter(t => /Sentence|Sources/.test(t.text))
  expect((await context()).length).toBeGreaterThan(3)
  expect(await ui.find({ type: 'Text', text: /Sources: config.ts \(src\/config.ts\)/ })).toBeDefined()
  expect((await ui.find({ key: 'm' }))?.text).toMatch(/hide detail/)
  await ui.press({ key: 'm' })
  expect(await context()).toHaveLength(3)
  expect((await context()).at(-1)?.text).toMatch(/…$/)
  expect((await ui.find({ key: 'm' }))?.text).toMatch(/show detail/)
  await ui.press({ key: 'm' })
  expect((await context()).length).toBeGreaterThan(3)
  await ui.unmount()
})

test('thin rules sit between the header, context, options, conversation and key hints', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  const rules = (await ui.findAll({ type: 'Text' })).filter(t => /^─+$/.test(t.text))
  expect(rules).toHaveLength(4)
  expect(rules[0]?.props.color).toBe('subtle')
  expect((await ui.findAll({ type: 'Text' })).some(t => /^-+$/.test(t.text))).toBe(false)
  await ui.unmount()
})

test('the ring starts on the recommended option, enter is shown choosing it, and there is no Discuss hint', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  expect((await ui.find({ key: 'opt:1' }))?.props.autoFocus).toBe(true)
  expect((await ui.find({ key: 'line:1' }))?.text).toMatch(/^›/)
  expect(await ui.find({ type: 'Text', text: /^enter: choose 1/ })).toBeDefined()
  expect(await ui.find({ key: 'discuss' })).toBeUndefined()
  await ui.unmount()
})

test('compact at 9 rows: 12 options fit the pane, the ringed row is tinted with ›, no border, and o pages', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...TWELVE })
  const ui = await $.ui.mount({ ...SHORT(9), surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  expect(lineCount(await ui.drawn())).toBeLessThanOrEqual(9)
  const first = (await ui.findAll({ type: 'Button' })).filter(b => /^opt:/.test(String(b.props.key))).map(b => String(b.props.key))
  expect(first[0]).toBe('opt:1')
  expect(first.length).toBeLessThan(12)
  expect(await ui.find({ key: 'o' })).toBeDefined()
  await ui.press({ key: 'opt:2' })
  await ringOn($, 'opt:2')
  expect(findBox(await ui.drawn(), props => props.borderStyle !== undefined)).toBeUndefined()
  expect((await ui.find({ key: 'line:2' }))?.text).toMatch(/^›/)
  expect(await ui.find({ type: 'Text', text: /what place 2 costs/ })).toBeDefined()
  expect(lineCount(await ui.drawn())).toBeLessThanOrEqual(9)
  await ui.press({ key: 'o' })
  const second = (await ui.findAll({ type: 'Button' })).filter(b => /^opt:/.test(String(b.props.key))).map(b => String(b.props.key))
  expect(second[0]).toBe(`opt:${first.length + 1}`)
  expect(await ui.find({ key: 'card:2' })).toBeUndefined()
  expect(lineCount(await ui.drawn())).toBeLessThanOrEqual(9)
  await ui.unmount()
})

test('compact: a digit for an option on another page draws its page and highlights it, and 9 then enter answers', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...TWELVE })
  const ui = await $.ui.mount({ ...SHORT(9), surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  expect(await ui.find({ key: 'opt:9' })).toBeUndefined()
  expect((await ui.find({ key: 'digit:9' }))?.props.hotkey).toBe('9')
  await ui.press({ key: 'digit:9' })
  expect(await ui.find({ key: 'card:9' })).toBeDefined()
  expect(lineCount(await ui.drawn())).toBeLessThanOrEqual(9)
  await ringOn($, 'opt:9')
  await ui.press({ key: 'opt:9' })
  expect(await ui.find({ type: 'Text', text: 'Answered  1' })).toBeDefined()
  await ui.unmount()
})

test('compact: 1 then 2 reaches option 12 on its own page, not option 1', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...TWELVE })
  const ui = await $.ui.mount({ ...SHORT(9), surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  await ui.press({ key: 'opt:1' })
  await ui.press({ key: 'opt:2' })
  expect(await ui.find({ key: 'card:12' })).toBeDefined()
  expect(await ui.find({ key: 'opt:1' })).toBeUndefined()
  await ui.unmount()
})

test('a number past the options does nothing: 4 options have no 9 key anywhere', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD, options: [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }] })
  const ui = await $.ui.mount({ ...SHORT(9), surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  const hotkeys = (await ui.findAll({ type: 'Button' })).map(b => b.props.hotkey).filter(Boolean)
  expect(hotkeys).not.toContain('9')
  expect(hotkeys).toEqual(expect.arrayContaining(['1', '2', '3', '4', '5']))
  expect((await ui.find({ key: 'opt:5' }))?.text ?? (await ui.find({ key: 'digit:5' }))?.text).toBeDefined()
  await ui.unmount()
})

test('compact with no recommendation and no descriptions: no a, the scenario line, and it fits', async ($, on) => {
  const seen = engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...TWELVE, options: TWELVE.options.map(o => ({ label: o.label })) })
  // A choice can't be added without a recommendation; one stored before that rule, or edited by hand, can lack it.
  const path = [...seen.files.keys()].find(p => p.endsWith('/d1.json'))!
  const { recommendation: _gone, ...stored } = JSON.parse(seen.files.get(path)!)
  seen.files.set(path, JSON.stringify(stored))
  const ui = await $.ui.mount({ ...SHORT(9), surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  expect(await ui.find({ key: 'a' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^Recipes need a home/ })).toBeDefined()
  expect(lineCount(await ui.drawn())).toBeLessThanOrEqual(9)
  await ui.press({ key: 'opt:3' })
  expect(lineCount(await ui.drawn())).toBeLessThanOrEqual(9)
  await ui.unmount()
})

test('the pane opens on the tab holding the newest open decision, and each tab shows its open count', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD, group: 'What to work on' })
  for (const title of ['One', 'Two', 'Three']) {
    await $.tool.call({ tool: ADD_TOOL, ...GOOD, group: 'Decisions pane design', title })
  }
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ key: 'row:d2' })).toBeDefined()
  expect(await ui.find({ key: 'row:d1' })).toBeUndefined()
  expect((await ui.find({ key: 'tab:g:Decisions pane design' }))?.text).toMatch(/^ Decisions pane design 3 /)
  expect((await ui.find({ key: 'tab:g:What to work on' }))?.text).toMatch(/^ What to work on 1 /)
  await ui.unmount()
})

test('when the open tab has nothing to answer the list says which tab does, and enter goes there', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD, group: 'What to work on' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  await answer($, ui, 1)
  await ui.unmount()
  await $.tool.call({ tool: ADD_TOOL, ...GOOD, group: 'Decisions pane design', title: 'One' })
  await $.tool.call({ tool: ADD_TOOL, ...GOOD, group: 'Decisions pane design', title: 'Two' })
  const again = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await again.find({ key: 'row:d2' })).toBeDefined()
  await again.press({ key: 't' })
  const pointer = await again.find({ key: 'goto-waiting' })
  expect(pointer?.text).toMatch(/2 waiting in Decisions pane design · enter/)
  expect(pointer?.props.autoFocus).toBe(true)
  expect((await again.find({ key: 'row:d1' }))?.props.autoFocus).toBeUndefined()
  await again.press({ key: 'goto-waiting' })
  expect(await again.find({ key: 'row:d2' })).toBeDefined()
  expect(await again.find({ key: 'goto-waiting' })).toBeUndefined()
  await again.unmount()
})

test('Claude adding a decision while the person is not in the pane moves the list to its tab', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD, group: 'What to work on' })
  await $.tool.call({ tool: ADD_TOOL, ...GOOD, group: 'Decisions pane design' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 't' })
  expect(await ui.find({ key: 'row:d1' })).toBeDefined()
  await $.tool.call({ tool: ADD_TOOL, ...GOOD, group: 'Decisions pane design', title: 'Third' })
  await ui.unmount()
  const after = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await after.find({ key: 'row:d3' })).toBeDefined()
  await after.unmount()
})

test("another session sees none of this session's decisions: not in the pane, the status line, the list or an update", async ($, on) => {
  const seen = engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  expect(seen.statuses.at(-1)).toBe('1 open')
  const stored = JSON.parse([...seen.files.values()][0]!)
  expect(stored.session).toBe('session-1')
  seen.session = 'session-2'
  await start($)
  expect(seen.statuses.at(-1)).toBeUndefined()
  expect(JSON.stringify(await $.tool.call({ tool: LIST_TOOL }))).toContain('No open decisions in the pane.')
  expect(JSON.stringify(await $.tool.call({ tool: UPDATE_TOOL, id: 'd1', summary: 'Changed', title: 'New title' }))).toMatch(/d1/)
  expect(JSON.parse([...seen.files.values()][0]!).title).toBe(GOOD.title)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /No decisions yet/ })).toBeDefined()
  await ui.unmount()
  const answer = await $.tool.call({ tool: ADD_TOOL, ...GOOD, title: 'Second session' })
  expect(JSON.stringify(answer)).toContain('Added d2 to the pane. 1 open.')
  seen.session = 'session-1'
  expect(JSON.stringify(await $.tool.call({ tool: LIST_TOOL }))).not.toContain('Second session')
})

test('a decision stored before sessions were stamped is not shown', async ($, on) => {
  const seen = engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  const path = [...seen.files.keys()].find(p => p.endsWith('/d1.json'))!
  const { session: _gone, ...old } = JSON.parse(seen.files.get(path)!)
  seen.files.set(path, JSON.stringify(old))
  expect(JSON.stringify(await $.tool.call({ tool: LIST_TOOL }))).toContain('No open decisions in the pane.')
})

test("sending answers only this session's ready decisions", async ($, on) => {
  const seen = engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  await answer($, ui, 1)
  await ui.unmount()
  seen.session = 'session-2'
  await $.tool.call({ tool: ADD_TOOL, ...GOOD, title: 'Second session' })
  const other = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await other.press({ key: 'row:d2' })
  await answer($, other, 2)
  await other.press({ key: 's' })
  expect(await other.find({ key: 'tick:d1' })).toBeUndefined()
  await other.press({ key: 'confirm' })
  await Promise.resolve()
  await Promise.resolve()
  expect(seen.submitted[0]).toContain('Decision d2')
  expect(seen.submitted[0]).not.toContain('Decision d1')
  await other.unmount()
})

/** Columns a drawn element takes on the terminal, the engine's `k: ` in front of a hotkey Button included. */
function drawnWidth(node: any): number {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return 0
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node).length
  }
  if (Array.isArray(node)) {
    return node.reduce((n: number, child: any) => n + drawnWidth(child), 0)
  }
  const inner = (node.children ?? []).reduce((n: number, child: any) => n + drawnWidth(child), 0)

  return inner + (node.type === 'Button' && node.props?.hotkey ? node.props.hotkey.length + 2 : 0)
}

test('compact at 90 columns: every key line fits the width as the engine draws it, highlighted or not', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...TWELVE })
  const ui = await $.ui.mount({ ...SHORT(9), surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  const lines = async () => (findBox(await ui.drawn(), props => props.key === 'hints')?.children ?? []).flat().map(drawnWidth)
  for (const width of await lines()) {
    expect(width).toBeLessThanOrEqual(89)
  }
  await ui.press({ key: 'digit:9' })
  for (const width of await lines()) {
    expect(width).toBeLessThanOrEqual(89)
  }
  expect(await ui.find({ key: 'card:9' })).toBeDefined()
  await ui.unmount()
})

test('answering the last open decision on a tab leaves the list on that tab', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD, group: 'What to work on' })
  await $.tool.call({ tool: ADD_TOOL, ...GOOD, group: 'Storage choices' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'row:d2' })
  await answer($, ui, 1)
  expect(await ui.find({ key: 'row:d2' })).toBeDefined()
  expect((await ui.find({ key: 'goto-waiting' }))?.text).toMatch(/1 waiting in What to work on/)
  await ui.unmount()
})

test('an empty pane offers only h', async ($, on) => {
  engine(on)
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.findAll({ type: 'Button' })).map(b => b.props.key)).toEqual(['h'])
  await ui.unmount()
})

test('the Send and assumptions screens open with › on the row the ring starts on', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  for (const title of ['Codes are 8 characters', 'Links never expire']) {
    await $.tool.call({ tool: ADD_TOOL, group: 'Config file plan', kind: 'assumption', title, scenario: 's' })
  }
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'batch' })
  expect((await ui.find({ key: 'batch:d2' }))?.text).toMatch(/^› d2/)
  await ui.press({ key: 'b' })
  await ui.press({ key: 'row:d1' })
  await answer($, ui, 1)
  await ui.press({ key: 's' })
  expect((await ui.find({ key: 'tick:d1' }))?.text).toMatch(/^› \[x\] d1/)
  await ui.unmount()
})

test('compact assumptions screen fits 9 rows with the pane header and a notice, keys on or off', async ($, on) => {
  engine(on)
  await start($)
  for (let i = 1; i <= 12; i++) {
    await $.tool.call({ tool: ADD_TOOL, group: 'Config file plan', kind: 'assumption', title: `Assumption ${i}`, scenario: 's' })
  }
  const ui = await $.ui.mount({ ...SHORT(9), surface: 'terminal' })
  await ui.press({ key: 'batch' })
  await ringOn($, 'batch:d1')
  await ui.press({ key: '1' })
  await ui.press({ key: 'batch:d1' })
  expect(await ui.find({ type: 'Text', text: /Answered 1 assumption/ })).toBeDefined()
  expect(lineCount(await ui.drawn())).toBeLessThanOrEqual(9)
  await ui.unmount()
  const off = await $.ui.mount({ ...SHORT(9), props: { ...SHORT(9).props, isFocused: false }, surface: 'terminal' })
  expect(lineCount(await off.drawn())).toBeLessThanOrEqual(9)
  await off.unmount()
})

test('a sent 12-option decision on a 9-row pane shows the page holding its answer', async ($, on) => {
  const seen = engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...TWELVE })
  const path = [...seen.files.keys()].find(p => p.endsWith('/d1.json'))!
  seen.files.set(path, JSON.stringify({ ...JSON.parse(seen.files.get(path)!), state: 'sent', answer: { option: 9, answeredAt: 't' } }))
  const ui = await $.ui.mount({ ...SHORT(9), surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  expect((await ui.find({ key: 'line:9' }))?.text).toMatch(/✓/)
  expect(lineCount(await ui.drawn())).toBeLessThanOrEqual(9)
  await ui.unmount()
})

test('compact with m open and an option highlighted still fits 9 rows', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...TWELVE, scenario: 'A long scenario. '.repeat(20), sources: [{ label: 'a.ts', path: 'src/a.ts' }] })
  const ui = await $.ui.mount({ ...SHORT(9), surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  await ui.press({ key: 'm' })
  await ui.press({ key: 'opt:1' })
  expect(await ui.find({ type: 'Text', text: /what place 1 costs/ })).toBeDefined()
  expect(lineCount(await ui.drawn())).toBeLessThanOrEqual(9)
  await ui.unmount()
})

test('when the pane gets the keys the ring goes where the pane means it, not to a row that went', () => {
  const at = (n: number) => `2026-11-12T10:0${n}:00.000Z`
  const d = (id: string, group: string, over: Record<string, unknown> = {}) =>
    ({ version: 1, id, number: Number(id.slice(1)), group, section: 'needs-you', kind: 'choice', title: id, scenario: 's', options: [{ id: 1, label: 'A' }], sources: [], dependsOn: [], state: 'open', thread: [], revisions: [], createdAt: at(1), updatedAt: at(1), ...over }) as any
  const tabs = tabsFor([d('d1', 'Old'), d('d2', 'New'), d('d3', 'New', { thread: [{ who: 'claude', text: 'hi', at: at(5) }] })])
  // The prompt had the keys while a new decision switched the list to "New": the stored ring is a row on the old tab.
  expect(ringTarget({ ...INITIAL_VIEW, screen: 'list', tab: 'g:New', ring: 'row:d1' }, tabs)).toBe('row:d3')
  expect(ringTarget({ ...INITIAL_VIEW, screen: 'list', tab: 'g:New', ring: 'row:d2' }, tabs)).toBe('row:d2')
  expect(ringTarget({ ...INITIAL_VIEW, screen: 'decision', decisionId: 'd2', highlight: 1 }, tabs)).toBe('opt:1')
  expect(ringTarget({ ...INITIAL_VIEW, screen: 'decision', decisionId: 'd2' }, tabs)).toBe('opt:1')
  expect(ringTarget({ ...INITIAL_VIEW, screen: 'decision', decisionId: 'd2', highlight: 1, answerBox: { kind: 'text', option: 2 } }, tabs)).toBe('answer')
  expect(ringTarget({ ...INITIAL_VIEW, screen: 'review' }, tabs)).toBeUndefined()
  expect(ringTarget({ ...INITIAL_VIEW, screen: 'review', decisionId: 'd2', ticked: ['d2'] }, tabs)).toBe('confirm')
})
