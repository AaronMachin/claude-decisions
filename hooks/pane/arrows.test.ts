import { expect, test } from 'claude-code/testing'

import { arrowTarget } from './arrows'

const person = { origin: { kind: 'person' }, by: 1 }
const view = { screen: 'decision', ring: 'opt:2' } as any

test('an arrow on a scrolling decision moves the ring to the next or previous option (row 293)', () => {
  expect(arrowTarget(person as any, view, 5)).toBe('opt:3')
  expect(arrowTarget({ ...person, by: -1 } as any, view, 5)).toBe('opt:1')
})

test('past the first or last option, the wheel, page keys, a plugin\'s scroll and other screens scroll as before', () => {
  expect(arrowTarget({ ...person, by: -1 } as any, { ...view, ring: 'opt:1' }, 5)).toBeUndefined()
  expect(arrowTarget(person as any, { ...view, ring: 'opt:5' }, 5)).toBeUndefined()
  expect(arrowTarget({ ...person, pointer: { row: 3, column: 2 } } as any, view, 5)).toBeUndefined()
  expect(arrowTarget({ ...person, by: 12 } as any, view, 5)).toBeUndefined()
  expect(arrowTarget({ origin: { kind: 'plugin', name: 'decisions' }, by: 1 } as any, view, 5)).toBeUndefined()
  expect(arrowTarget(person as any, { ...view, screen: 'list' }, 5)).toBeUndefined()
  expect(arrowTarget(person as any, { ...view, ring: 'ask-inline' }, 5)).toBeUndefined()
})
