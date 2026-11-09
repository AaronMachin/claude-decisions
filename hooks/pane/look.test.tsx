import { expect, test } from 'claude-code/testing'

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
