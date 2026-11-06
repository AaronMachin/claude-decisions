import { expect, test } from 'claude-code/testing'

import { PANE_ID, INITIAL_VIEW } from './pane/decision'
import { ADD_TOOL, LIST_TOOL } from './tool'

type On = (event: string, hook: (...args: any[]) => any) => unknown

type Seen = {
  files: Map<string, string>
  statuses: (string | undefined)[]
  opened: any[]
  closed: any[]
  submitted: string[]
  tools: string[]
  commands: string[]
}

/** Answers everything the plugin asks of the engine, from memory. */
function engine(on: On): Seen {
  const seen: Seen = { files: new Map(), statuses: [], opened: [], closed: [], submitted: [], tools: [], commands: [] }
  on('env.get', () => ({ value: '/home/test' }))
  on('session.cwd', () => ({ value: '/work/pantry' }))
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
  on('ui.focus', () => ({}))
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

async function start($: any): Promise<void> {
  await $.session.start({ cwd: '/work/pantry', surface: 'terminal', isInteractive: true })
}

test('session.start registers /decisions and both tools and sets the status line', async ($, on) => {
  const seen = engine(on)
  await start($)
  expect(seen.commands).toContain('decisions')
  expect(seen.tools).toEqual(['decisions_add', 'decisions_list'])
})

test('adding a decision stores it, opens the pane unfocused and updates the status line', async ($, on) => {
  const seen = engine(on)
  await start($)
  const answer = await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  expect(JSON.stringify(answer)).toContain('Added d1 to the pane. 1 open.')
  expect(seen.opened).toHaveLength(1)
  expect(seen.opened[0].focus).toBeUndefined()
  expect(seen.statuses.at(-1)).toBe('Decisions: 1 open')
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
  expect(seen.statuses.at(-1)).toBe('Decisions: 1 open')
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

test('the highlight follows the ring: opt:<n> sets it and discuss clears it', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'row:d1' })
  await $.ui.focus({ component: 'Pane', requestId: PANE_ID, plugin: 'decisions', element: 'opt:2', origin: { kind: 'person' } })
  // The Discuss button is on the ring until something is highlighted; b clears the highlight and refocuses it.
  expect((await ui.find({ key: 'opt:2' }))?.text).toMatch(/2 {2}Per package/)
  await $.ui.focus({ component: 'Pane', requestId: PANE_ID, plugin: 'decisions', element: 'discuss', origin: { kind: 'person' } })
  await ui.unmount()
})

test('the header says keys on or keys off, on every screen', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  for (const isFocused of [true, false]) {
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused }, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: isFocused ? 'keys on' : 'keys off' })).toBeDefined()
    await ui.press({ key: 'row:d1' })
    expect(await ui.find({ type: 'Text', text: isFocused ? 'keys on' : 'keys off' })).toBeDefined()
    await ui.press({ key: 'b' })
    await ui.unmount()
  }
})

test('enter on the first row opens the decision, a number then enter answers it and returns to the list', async ($, on) => {
  const seen = engine(on)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ key: 'row:d1' }))?.props.autoFocus).toBe(true)
  await ui.press({ key: 'row:d1' })
  expect(await ui.find({ key: 'opt:2' })).toBeDefined()
  expect((await ui.find({ key: 'discuss' }))?.props.autoFocus).toBe(true)
  await ui.press({ key: 'opt:2' })
  expect(await ui.find({ key: 'row:d1' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Answered (1)' })).toBeDefined()
  expect(seen.statuses.at(-1)).toBe('Decisions: 0 open · 1 ready')
  await ui.press({ key: 'row:d1' })
  expect((await ui.find({ key: 'opt:2' }))?.text).toMatch(/✓ 2 {2}Per package/)
  expect((await ui.find({ key: 'opt:1' }))?.text).not.toMatch(/✓/)
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
    await ui.press({ key: `opt:${option}` })
  }
  await ui.press({ key: 's' })
  expect(seen.submitted).toEqual([])
  expect((await ui.find({ key: 'tick:d1' }))?.text).toMatch(/^\[x\]/)
  await ui.press({ key: 'tick:d1' })
  expect((await ui.find({ key: 'tick:d1' }))?.text).toMatch(/^\[ \]/)
  expect(seen.submitted).toEqual([])
  await ui.press({ key: 'confirm' })
  await Promise.resolve()
  await Promise.resolve()
  expect(seen.submitted).toHaveLength(1)
  expect(seen.submitted[0]).toContain('Decision d2')
  expect(seen.submitted[0]).not.toContain('Decision d1')
  expect(seen.statuses.at(-1)).toBe('Decisions: 0 open · 1 ready')
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
  expect(await ui.find({ type: 'Text', text: 'Parked (1)' })).toBeDefined()
  await ui.unmount()
})
