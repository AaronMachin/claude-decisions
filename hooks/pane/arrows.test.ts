import { expect, test } from 'claude-code/testing'

import { arrowTarget, focusMove, keysAboveChanged } from './arrows'

const person = { origin: { kind: 'person' }, by: 1 }
const view = { screen: 'decision', ring: 'opt:2', highlight: 2 } as any
const STOPS = ['opt:1', 'opt:2', 'opt:3', 'ask-inline']

test('an arrow on a scrolling decision moves the ring along the options and into the ask box (row 296)', () => {
  expect(arrowTarget(person as any, view, STOPS)).toBe('opt:3')
  expect(arrowTarget({ ...person, by: -1 } as any, view, STOPS)).toBe('opt:1')
  expect(arrowTarget(person as any, { ...view, ring: 'opt:3' }, STOPS)).toBe('ask-inline')
  expect(arrowTarget({ ...person, by: -1 } as any, { ...view, ring: 'ask-inline' }, STOPS)).toBe('opt:3')
})

test('up from the first option and down from the ask box scroll, and the ring stays', () => {
  expect(arrowTarget({ ...person, by: -1 } as any, { ...view, ring: 'opt:1' }, STOPS)).toBeUndefined()
  expect(arrowTarget(person as any, { ...view, ring: 'ask-inline' }, STOPS)).toBeUndefined()
})

test('a ring lost on something off the list comes back to the highlighted option', () => {
  expect(arrowTarget(person as any, { ...view, ring: 'enter-choose' }, STOPS)).toBe('opt:2')
  expect(arrowTarget(person as any, { ...view, ring: undefined, highlight: undefined }, STOPS)).toBe('opt:1')
})

test('the wheel, page keys, a plugin\'s scroll and other screens scroll as before', () => {
  expect(arrowTarget({ ...person, pointer: { row: 3, column: 2 } } as any, view, STOPS)).toBeUndefined()
  expect(arrowTarget({ ...person, by: 12 } as any, view, STOPS)).toBeUndefined()
  expect(arrowTarget({ origin: { kind: 'plugin', name: 'decisions' }, by: 1 } as any, view, STOPS)).toBeUndefined()
  expect(arrowTarget(person as any, { ...view, screen: 'review' }, STOPS)).toBeUndefined()
})

test('a person\'s ring move off the stops on a scrolling decision is kept on the stops', () => {
  const move = (from: string, to: string, scrolls = true) => focusMove({ origin: { kind: 'person' }, element: to } as any, { ...view, ring: from }, STOPS, scrolls)
  expect(move('opt:2', 'opt:3')).toEqual({ kind: 'allow' })
  expect(move('opt:3', 'b')).toEqual({ kind: 'redirect', element: 'ask-inline' })
  expect(move('ask-inline', 'enter-choose')).toEqual({ kind: 'stay', scrollTo: 'end' })
  expect(move('opt:1', 'enter-choose')).toEqual({ kind: 'stay', scrollTo: 'start' })
  expect(move('enter-choose', 'a')).toEqual({ kind: 'redirect', element: 'opt:2' })
  expect(move('opt:3', 'b', false)).toEqual({ kind: 'allow' })
  expect(focusMove({ origin: { kind: 'plugin', name: 'decisions' }, element: 'b' } as any, { ...view, ring: 'opt:3' }, STOPS, true)).toEqual({ kind: 'allow' })
})

const ROWS = ['session-card', 'row:d138', 'row:d139', 'row:d140']
const list = { screen: 'list', ring: 'row:d138' } as any

test('an arrow on a list taller than the pane moves the ring down the rows, not the window', () => {
  expect(arrowTarget(person as any, list, ROWS)).toBe('row:d139')
  expect(arrowTarget({ ...person, by: -1 } as any, list, ROWS)).toBe('session-card')
  expect(arrowTarget(person as any, { ...list, ring: 'row:d140' }, ROWS)).toBeUndefined()
  expect(arrowTarget({ ...person, by: -1 } as any, { ...list, ring: 'session-card' }, ROWS)).toBeUndefined()
})

test('on the list, a ring that is not on a row lets the window scroll instead of jumping to the top', () => {
  expect(arrowTarget(person as any, { ...list, ring: 'h' }, ROWS)).toBeUndefined()
})

test('the keys above the options count as changed only when one comes or goes on the same decision (row 306)', () => {
  const before = ['a', 'c', 't', 'o', 'r', 'm', 'b', 'p', 'h']
  keysAboveChanged('d1', before)
  expect(keysAboveChanged('d1', before)).toBe(false)
  // Claude replied, so `r` went.
  expect(keysAboveChanged('d1', ['a', 'c', 't', 'o', 'm', 'b', 'p', 'h'])).toBe(true)
  // The ring went to Something else, so `c` went.
  expect(keysAboveChanged('d1', ['a', 't', 'o', 'm', 'b', 'p', 'h'])).toBe(true)
  expect(keysAboveChanged('d1', ['a', 't', 'o', 'm', 'b', 'p', 'h'])).toBe(false)
  // Opening another decision is a fresh screen, not a change.
  expect(keysAboveChanged('d2', before)).toBe(false)
})
