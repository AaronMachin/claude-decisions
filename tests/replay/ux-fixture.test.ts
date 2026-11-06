import { expect, test } from 'claude-code/testing'

import { validateAdd } from '../../hooks/tool'
import { CHOICES, SEEDED, shifted } from './ux-fixture'

test('every seeded decision passes the tool\'s own validation, in order', () => {
  const ids: string[] = []
  for (const [index, input] of SEEDED.entries()) {
    expect(validateAdd(input, ids)).toBeUndefined()
    ids.push(`d${index + 1}`)
  }
})

test('decision 3 is a choice with a recommendation and decision 2 has twelve options', () => {
  expect(CHOICES[2]!.kind).toBe('choice')
  expect(CHOICES[2]!.recommendation.option).toBe(3)
  expect(CHOICES[1]!.options).toHaveLength(12)
})

test('the review keeps its dependencies pointing at the same findings after the choices are added first', () => {
  expect(shifted({ dependsOn: ['d2'] }, 9).dependsOn).toEqual(['d11'])
  expect(shifted({ title: 'x' }, 9)).toEqual({ title: 'x' })
})

test('the review has an Image uploads finding and at least 30 findings needing the person', () => {
  const needing = SEEDED.filter(i => i.kind === 'finding' && (i.section ?? 'needs-you') === 'needs-you')
  expect(needing.length).toBeGreaterThanOrEqual(30)
  expect(SEEDED.some(i => i.group === 'Image uploads')).toBe(true)
})
