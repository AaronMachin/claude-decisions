import { expect, test } from 'claude-code/testing'

import { cutToWidth, displayWidth, padToWidth, splitAtColumns } from './width'

test('wide East Asian characters and emoji take two columns, combining marks none', () => {
  expect(displayWidth('abc')).toBe(3)
  expect(displayWidth('共有')).toBe(4)
  expect(displayWidth('レシピ')).toBe(6)
  expect(displayWidth('한글')).toBe(4)
  expect(displayWidth('🔗🍲')).toBe(4)
  expect(displayWidth('é')).toBe(1)
  expect(displayWidth('★ › … ⤷')).toBe(7)
})

test('a cut text fits its columns, and a wide character is never cut in half', () => {
  expect(cutToWidth('short', 10)).toBe('short')
  expect(cutToWidth('レシピ共有', 6)).toBe('レシ…')
  expect(displayWidth(cutToWidth('レシピ共有', 6))).toBeLessThanOrEqual(6)
  expect(cutToWidth('ab🔗cd', 4)).toBe('ab…')
  expect(cutToWidth('共有', 1)).toBe('…')
  expect(cutToWidth('abc', 0)).toBe('…')
})

test('splitting at columns keeps combining marks with their letter and always moves on', () => {
  expect(splitAtColumns('aéb', 2)).toEqual(['aé', 'b'])
  expect(splitAtColumns('共有', 3)).toEqual(['共', '有'])
  expect(splitAtColumns('共有', 1)).toEqual(['共', '有'])
})

test('padding counts columns', () => {
  expect(padToWidth('共有', 6)).toBe('共有  ')
})
