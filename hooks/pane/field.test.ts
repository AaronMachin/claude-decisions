import { expect, test } from 'claude-code/testing'

import { beginFieldPass, endFieldPass, fieldValue, forgetFields } from './field'

const draw = (field: string, draft: string): string => {
  beginFieldPass()
  const value = fieldValue(field, draft)
  endFieldPass()
  return value
}

test('an open field keeps the value it opened with, so a draw never takes typed letters away (row 299)', () => {
  expect(draw('ask-inline:d1', '')).toBe('')
  // The draft saved so far is "ab" while the field already holds "abc".
  expect(draw('ask-inline:d1', 'ab')).toBe('')
  expect(draw('ask-inline:d1', 'abc')).toBe('')
})

test('a field that closed and opened again takes the draft as saved then', () => {
  expect(draw('answer:d2', 'half')).toBe('half')
  beginFieldPass()
  endFieldPass()
  expect(draw('answer:d2', 'half typed')).toBe('half typed')
})

test('closing the pane forgets every field, so the draft comes back when it is shown again', () => {
  expect(draw('park:d3', '')).toBe('')
  forgetFields()
  expect(draw('park:d3', 'because')).toBe('because')
})

test('two fields keep their own value', () => {
  beginFieldPass()
  expect(fieldValue('ask-inline:d5', 'one')).toBe('one')
  expect(fieldValue('ask-inline:d6', 'two')).toBe('two')
  endFieldPass()
})
