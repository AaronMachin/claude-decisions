import { expect, test } from 'claude-code/testing'

import { answerKey, askInlineKey, askInputKey, beginFieldPass, endFieldPass, fieldValue, forgetFields, isAskInline, isBlank, parkKey } from './field'

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

test('a draw that ends while another is still running forgets nothing the other drew, so a cleared box is not refilled', () => {
  forgetFields()
  beginFieldPass()
  expect(fieldValue('ask-input:d7', '')).toBe('')
  endFieldPass()
  // The person types; the second draw starts before the first ends, and the saved draft lags behind the box.
  beginFieldPass()
  expect(fieldValue('ask-input:d7', 'half a ques')).toBe('')
  beginFieldPass()
  endFieldPass()
  endFieldPass()
  // The box was cleared (ctrl+u) and drawn again: still the value it opened with, never the lagging draft.
  expect(draw('ask-input:d7', 'half a question')).toBe('')
})

test('every decision has its own field keys, so one decision never shows another one\'s typing', () => {
  expect(askInlineKey('d1')).not.toBe(askInlineKey('d2'))
  expect(askInputKey('d1')).not.toBe(askInputKey('d2'))
  expect(answerKey('d1')).not.toBe(answerKey('d2'))
  expect(parkKey('d1')).not.toBe(parkKey('d2'))
  expect(isAskInline(askInlineKey('d3'))).toBe(true)
  expect(isAskInline('opt:2')).toBe(false)
})

test('an empty or blank submitted text is blank', () => {
  expect(isBlank('')).toBe(true)
  expect(isBlank('  \n ')).toBe(true)
  expect(isBlank(' a ')).toBe(false)
})
