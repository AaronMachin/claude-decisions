import { expect, test } from 'claude-code/testing'

import { validateAdd } from '../hooks/tool'
import { DEMO, PARKED_TITLE } from './seed-data'

const sectionOf = (input: Record<string, any>) => input.section ?? 'needs-you'

test('every demo decision passes the tool\'s own validation, in order', () => {
  const ids: string[] = []
  for (const [index, input] of DEMO.entries()) {
    expect(validateAdd(input, ids)).toBeUndefined()
    ids.push(`d${index + 1}`)
  }
})

test('the demo has two tabs, Sharing links and Pantry review', () => {
  expect([...new Set(DEMO.map(i => i.group))].sort()).toEqual(['Pantry review', 'Sharing links'])
})

test('the review has all three sections and fits one page', () => {
  const review = DEMO.filter(i => i.group === 'Pantry review')
  expect(review.every(i => i.kind === 'finding')).toBe(true)
  for (const section of ['needs-you', 'claudes-call', 'already-decided']) {
    expect(review.some(i => sectionOf(i) === section)).toBe(true)
  }
  expect(review.filter(i => sectionOf(i) === 'needs-you').length).toBeLessThanOrEqual(6)
})

test('the first choice has two options and a recommendation, and five assumptions have five different scenarios', () => {
  const first = DEMO[0]!
  expect(first.kind).toBe('choice')
  expect(first.options).toHaveLength(2)
  expect(first.recommendation.option).toBe(1)
  const assumptions = DEMO.filter(i => i.kind === 'assumption')
  expect(assumptions).toHaveLength(5)
  expect(new Set(assumptions.map(i => i.scenario)).size).toBe(5)
})

test('the parked finding is one of the review\'s needs-you findings', () => {
  const parked = DEMO.filter(i => i.title === PARKED_TITLE)
  expect(parked).toHaveLength(1)
  expect(parked[0]!.group).toBe('Pantry review')
  expect(sectionOf(parked[0]!)).toBe('needs-you')
})
