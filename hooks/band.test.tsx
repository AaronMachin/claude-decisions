import { expect, test } from 'claude-code/testing'

import { bandText, isBandShown } from './band'
import { focusKeyName } from './focus-key'
import { PANE_ID } from './pane/decision'
import { ADD_TOOL } from './tool'

type On = (event: string, hook: (...args: any[]) => any) => unknown

type Pane = { id: string; isPlaced: boolean; isShown: boolean; isFocused: boolean }

/** The engine from memory: files, panes and what was opened. */
function engine(on: On, panes: { list: Pane[] }, options: { unreadable?: boolean } = {}): { opened: any[] } {
  const files = new Map<string, string>()
  const opened: any[] = []
  on('env.get', () => ({ value: '/home/test' }))
  on('session.cwd', () => ({ value: '/work/pantry' }))
  on('session.id', () => ({ value: 'session-1' }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: '/work/pantry/.git\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('fs.read', (_: any, e: any) => ({ value: files.get(e.path) ?? '' }))
  on('fs.write', (_: any, e: any) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.exists', (_: any, e: any) => ({ value: files.has(e.path) }))
  on('fs.list', (_: any, e: any) => {
    if (options.unreadable) {
      throw new Error('EACCES')
    }
    return {
      value: [...files.keys()]
        .filter(p => p.startsWith(e.path + '/'))
        .map(p => ({ name: p.slice(e.path.length + 1), kind: 'file', size: 0, mtimeMs: 0, isLink: false })),
    }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', (_: any, e: any) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.focus', () => ({ value: {} }))
  on('ui.panes', () => ({ value: panes.list }))
  on('tool.register', () => ({ value: {} }))
  on('command.register', (_: any, e: any) => ({ value: { command: e.name } }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))

  return { opened }
}

const DECISION = {
  group: 'Recipe sharing',
  kind: 'choice',
  title: 'How long a share link lasts',
  scenario: 'You share a recipe and the link is copied into a group chat.',
  options: [{ label: 'A week' }, { label: 'Forever' }],
  recommendation: { option: 1, reason: 'A link in a group chat outlives the reason it was sent.' },
}

const BAND = {
  plugin: 'decisions',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 9 }, view: {} },
} as const

const PANE = {
  plugin: 'decisions',
  component: 'Pane',
  requestId: PANE_ID,
  props: { title: 'Decisions', isFocused: false, bodyColumns: 49, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const placed = (isFocused: boolean): Pane => ({ id: PANE_ID, isPlaced: true, isShown: true, isFocused })

async function start($: any): Promise<void> {
  await $.session.start({ cwd: '/work/pantry', surface: 'terminal', isInteractive: true })
}

test('the band text names the count and the focus key', () => {
  expect(bandText(3, true, 'ctrl+x tab')).toBe('3 decisions waiting · ctrl+x tab to answer, your draft stays')
  expect(bandText(1, true, 'ctrl+x tab')).toBe('1 decision waiting · ctrl+x tab to answer, your draft stays')
  expect(bandText(2, false, 'ctrl+x tab')).toBe('2 decisions waiting · ctrl+x tab then enter to open, your draft stays')
  expect(focusKeyName()).toBe('ctrl+x tab')
})

test('the band shows while a decision waits and the pane is open without the keys', async ($, on) => {
  engine(on, { list: [placed(false)] })
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...DECISION })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /1 decision waiting · ctrl\+x tab to answer, your draft stays/ })).toBeDefined()
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()
})

test('a new reply leads the band, and with nothing waiting it says how to read it', () => {
  expect(bandText(2, true, 'ctrl+q', { count: 1, id: 'd43' })).toBe('● 1 new reply on d43 · 2 decisions waiting · ctrl+q to answer, your draft stays')
  expect(bandText(0, true, 'ctrl+q', { count: 1, id: 'd43' })).toBe('● 1 new reply on d43 · ctrl+q to read it')
  expect(bandText(0, false, 'ctrl+q', { count: 3, id: 'd9' })).toBe('● 3 new replies on d9 · ctrl+q then enter to read it')
})

test('a new reply shows even while the pane is hidden; waiting alone does not', () => {
  expect(isBandShown({ isHidden: true, isFocused: false, waiting: 2, unread: 0 })).toBe(false)
  expect(isBandShown({ isHidden: true, isFocused: false, waiting: 0, unread: 1 })).toBe(true)
  expect(isBandShown({ isHidden: false, isFocused: true, waiting: 2, unread: 1 })).toBe(false)
  expect(isBandShown({ isHidden: false, isFocused: false, waiting: 0, unread: 0 })).toBe(false)
  expect(isBandShown({ isHidden: false, isFocused: false, waiting: 1, unread: 0 })).toBe(true)
})

test('the band hides once the pane has the keys', async ($, on) => {
  engine(on, { list: [placed(true)] })
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...DECISION })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /waiting/ })).toBeUndefined()
  await ui.unmount()
})

test('the band hides with nothing waiting', async ($, on) => {
  engine(on, { list: [placed(false)] })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /waiting/ })).toBeUndefined()
  await ui.unmount()
})

test('the band yields to a survey', async ($, on) => {
  engine(on, { list: [placed(false)] })
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...DECISION })
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true }, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /waiting/ })).toBeUndefined()
  await ui.unmount()
})

test('the band stays quiet while the person has hidden the pane', async ($, on) => {
  engine(on, { list: [placed(false)] })
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...DECISION })
  const pane = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: true }, surface: 'terminal' })
  await pane.press({ key: 'h' })
  await pane.unmount()
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /waiting/ })).toBeUndefined()
  await ui.unmount()
})

test('the band stays quiet, without throwing, when the store cannot be read', async ($, on) => {
  engine(on, { list: [placed(false)] }, { unreadable: true })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /waiting/ })).toBeUndefined()
  await ui.unmount()
})

test('for a pane waiting undrawn the band holds one Button that opens the pane focused', async ($, on) => {
  const panes = { list: [] as Pane[] }
  const seen = engine(on, panes)
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...DECISION })
  panes.list = [{ id: PANE_ID, isPlaced: false, isShown: false, isFocused: false }]
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /then enter to open, your draft stays/ })).toBeDefined()
  const button = await ui.find({ key: 'open-decisions' })
  expect(button?.props.autoFocus).toBe(true)
  await ui.press({ key: 'open-decisions' })
  expect(seen.opened.at(-1)).toMatchObject({ id: PANE_ID, focus: true })
  await ui.unmount()
})

test('the pane keys-off line names the focus key', async ($, on) => {
  engine(on, { list: [placed(false)] })
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...DECISION })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: new RegExp(focusKeyName().replace('+', '\\+')) })).toBeDefined()
  await ui.unmount()
})

test('with the Focus key setting the band and the keys-off line name that key', { options: { focusKey: 'ctrl+q' } }, async ($, on) => {
  engine(on, { list: [placed(false)] })
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...DECISION })
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Text', text: /^1 decision waiting · ctrl\+q to answer, your draft stays/ })).toBeDefined()
  await band.unmount()
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await pane.find({ type: 'Text', text: 'ctrl+q to use' })).toBeDefined()
  await pane.unmount()
})

test('an empty Focus key setting falls back to ctrl+x tab', { options: { focusKey: '  ' } }, async ($, on) => {
  engine(on, { list: [placed(false)] })
  await start($)
  await $.tool.call({ tool: ADD_TOOL, ...DECISION })
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Text', text: /ctrl\+x tab to answer/ })).toBeDefined()
  await band.unmount()
})
