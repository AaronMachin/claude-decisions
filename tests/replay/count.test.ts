import { expect, test } from 'claude-code/testing'

import { HEADER, countQuestions, formatRow, formatTotals, summarise } from './count'

test('a numbered list of questions counts each one', () => {
  expect(countQuestions('Before I start:\n1. Redis or Postgres?\n2. Do we need expiry?\n3. Who owns a link?')).toBe(3)
})

test('"should I" and "which would you prefer" count, anywhere in the text', () => {
  expect(countQuestions('Should I push this? I can also wait. Which would you prefer? Either works.')).toBe(2)
})

test('a bare offer to carry on does not count, but another offer does', () => {
  expect(countQuestions('Done. Want me to carry on?')).toBe(0)
  expect(countQuestions('Done. Want me to drop the migration?')).toBe(1)
})

test('a statement and a question inside a code block do not count', () => {
  expect(countQuestions('The link is built here.\n```\nwhat is this? \n```\nI added 3 decisions.')).toBe(0)
})

test('a row has the counts and no text, and totals add up', () => {
  const a = summarise('plan', [{ chat: 2, flaggedBy: 'list' }, { chat: 0, flaggedBy: undefined }], 3)
  const b = summarise('review', [{ chat: 0, flaggedBy: 'mid' }], 0)
  expect(formatRow(a)).toBe('plan | 2 | 2 | 3 | 1 | 2/2 | 0 | 0 | 0')
  expect(formatRow(b)).toBe('review | 1 | 0 | 0 | 1 | 0/1 | 1 | 0 | 0')
  expect(formatTotals([a, b])).toBe('total | 3 | 2 | 3 | 2 | 2/3 | 1 | 0 | 0')
  expect(HEADER.split('|')).toHaveLength(9)
})

test('a turn that failed is counted and adds no questions', () => {
  const row = summarise('x', [{ chat: 0, flaggedBy: undefined, failed: true }], 0)
  expect(formatRow(row)).toBe('x | 1 | 0 | 0 | 0 | 1/1 | 0 | 0 | 1')
})
