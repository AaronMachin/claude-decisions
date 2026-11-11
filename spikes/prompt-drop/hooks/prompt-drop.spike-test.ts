import { expect, test } from 'claude-code/testing'
import { isAnswerLine } from './register'

test('a decision answer line is recognised', () => {
  expect(isAnswerLine('d1 2')).toBe(true)
  expect(isAnswerLine(' d12 3 ')).toBe(true)
  expect(isAnswerLine('hello')).toBe(false)
  expect(isAnswerLine('d1 is fine')).toBe(false)
})
