import { expect, test } from 'claude-code/testing'

import { displayWidth, layout, overflows } from './layout'

const text = (s: string, props: Record<string, unknown> = {}) => ({ type: 'Text', props, children: [s] })
const box = (props: Record<string, unknown>, ...children: unknown[]) => ({ type: 'Box', props, children })
const button = (key: string, s: string) => ({ type: 'Button', props: { key, label: s, plain: true }, children: [s] })

test('wide characters and emoji take two columns, combining marks none', () => {
  expect(displayWidth('abc')).toBe(3)
  expect(displayWidth('共有')).toBe(4)
  expect(displayWidth('🔗')).toBe(2)
  expect(displayWidth('é')).toBe(1)
})

test('a column stacks its children, a row sets them side by side, and a wrapping Text takes the rows it wraps onto', () => {
  const tree = box({ flexDirection: 'column' },
    text('0123456789012345', { key: 'long' }),
    box({ key: 'row' }, button('a', 'aaaa'), button('b', 'bbbb')),
    text('end', { key: 'end' }),
  )
  const l = layout(tree, 10)
  expect(l.rowOf.get('long')).toBe(0)
  expect(l.rowOf.get('row')).toBe(2)
  expect(l.rowOf.get('end')).toBe(3)
  expect(l.rows).toBe(4)
  expect(overflows(l)).toEqual([])
})

test('a Button past its room, and a Text set to cut, count as overflowing; a Text that wraps does not', () => {
  const tree = box({ flexDirection: 'column' },
    box({}, button('a', 'aaaaaa'), button('b', 'bbbbbb')),
    text('cut cut cut cut', { wrap: 'truncate-end' }),
    text('wraps wraps wraps'),
  )
  expect(overflows(layout(tree, 10)).map(o => o.key ?? o.text)).toEqual(['b', 'cut cut cut cut'])
})

test('a border and padding take room from the children', () => {
  const tree = box({ borderStyle: 'round', paddingX: 1, flexDirection: 'column' }, button('a', '123456'))
  expect(overflows(layout(tree, 10))).toEqual([])
  expect(overflows(layout(tree, 9)).map(o => o.key)).toEqual(['a'])
  expect(layout(tree, 10).rows).toBe(3)
})
