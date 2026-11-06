import { expect, test } from 'claude-code/testing'

import { highlightFor, pressDigit, repoKey } from './logic'
import type { Highlighter } from './logic'

const PANE = {
  plugin: 'keys-spike',
  component: 'Pane',
  requestId: 'keysa',
  props: {
    title: 'Keys A',
    isFocused: true,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('a digit highlights its option, 0 is 10, and 1 then 0 within the gap is 10', () => {
  expect(highlightFor('3', 1000, undefined).option).toBe(3)
  expect(highlightFor('0', 1000, undefined).option).toBe(10)
  const one = highlightFor('1', 1000, undefined)
  expect(one.option).toBe(1)
  expect(highlightFor('0', 1200, one.typed).option).toBe(10)
  expect(highlightFor('1', 1200, one.typed).option).toBe(11)
  expect(highlightFor('2', 1200, one.typed).option).toBe(12)
  expect(highlightFor('3', 1200, one.typed).option).toBe(3)
  expect(highlightFor('0', 9000, one.typed).option).toBe(10)
  expect(highlightFor('1', 9000, one.typed).option).toBe(1)
})

test('the repository key is the same for the same git common directory and differs for another', async () => {
  const a = await repoKey('/work/pantry/.git')
  expect(a).toMatch(/^pantry-[0-9a-f]{8}$/)
  expect(await repoKey('/work/pantry/.git/')).toBe(a)
  expect(await repoKey('/work/other/.git')).not.toBe(a)
})

test('pane A draws twelve option buttons, a Discuss button and ten digit hotkeys', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const buttons = await ui.findAll({ type: 'Button' })
    const keys = buttons.map(b => b.props.key)

    for (let i = 1; i <= 12; i++) {
      expect(keys).toContain(`opt:${i}`)
    }
    expect(keys).toContain('discuss')
    expect(buttons.map(b => b.props.hotkey).filter(Boolean).sort()).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
    await ui.unmount()
  }
})

test('digits 1 then 0 ask the engine to focus opt:1 then opt:10', async () => {
  const asked: string[] = []
  const $ = {
    ui: {
      focus: async (args: { requestId: string; key: string }) => {
        asked.push(`${args.requestId}/${args.key}`)
        return {}
      },
    },
  }
  const state = { typed: undefined, option: undefined } as Highlighter
  await pressDigit($, 'keysa', '1', 1000, state)
  await pressDigit($, 'keysa', '0', 1200, state)
  expect(asked).toEqual(['keysa/opt:1', 'keysa/opt:10'])
  expect(state.option).toBe(10)
})

test('two digits typed before the first focus call answers still read as 10', async () => {
  const asked: string[] = []
  const $ = {
    ui: {
      focus: async (args: { requestId: string; key: string }) => {
        asked.push(args.key)
        await Promise.resolve()
        return {}
      },
    },
  }
  const state = { typed: undefined, option: undefined } as Highlighter
  await Promise.all([pressDigit($, 'keysa', '1', 1000, state), pressDigit($, 'keysa', '0', 1010, state)])
  expect(asked).toEqual(['opt:1', 'opt:10'])
})

test('session.start appends the codeword note as a user-role message', async ($, on) => {
  const appended: unknown[] = []
  on('env.get', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'x' } }))
  on('session.append', (_, e, next) => {
    appended.push(e.message)
    return next(e)
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(JSON.stringify(appended)).toContain('PLUM-7421')
})

test('a clear raises classic SessionStart and appends the after-clear note', async ($, on) => {
  const appended: unknown[] = []
  on('env.get', () => ({ value: undefined }))
  on('classic.SessionStart', () => ({}))
  on('session.append', (_, e, next) => {
    appended.push(e.message)
    return next(e)
  })
  await $.classic.SessionStart({ source: 'clear' })
  expect(JSON.stringify(appended)).toContain('QUINCE-3308')
})
