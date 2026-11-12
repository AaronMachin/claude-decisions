import { expect, test } from 'claude-code/testing'

import { focusKeyName } from '../focus-key'
import { HEADER_RIGHT_GAP, Header } from './look'

const PANE = {
  plugin: 'decisions',
  component: 'Pane',
  requestId: 'other',
  props: { title: 'Decisions', isFocused: true, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

test('the header keeps "keys on" clear of the close mark at the right edge', async ($, on) => {
  const width = 40
  on('ui.render', ($$: any, e: any) => Header($$.ui.resolve(e), 'Decisions', true, undefined, width))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map((t: any) => t.text as string)
  const used = texts.slice(0, 3).join('').length
  expect(texts[2]).toBe('keys on')
  expect(used).toBe(width - HEADER_RIGHT_GAP)
  await ui.unmount()
})

test('without the keys the header says how to use the pane at its right, in one line', async ($, on) => {
  on('ui.render', ($$: any, e: any) => Header($$.ui.resolve(e), 'Decisions', false, undefined, 40))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map((t: any) => t.text as string)
  expect(texts[2]).toBe(`${focusKeyName()} to use`)
  expect(texts.join('').length).toBe(40 - HEADER_RIGHT_GAP)
  await ui.unmount()
})
