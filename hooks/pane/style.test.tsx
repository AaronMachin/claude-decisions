import { expect, test } from 'claude-code/testing'

import type { Decision } from '../store'
import { Inline, barColour, kindColour, kindLabel, parseInline, urlLabel, visibleText, wrapInline } from './style'

function make(over: Partial<Decision> = {}): Decision {
  return {
    version: 1,
    id: 'd1',
    number: 1,
    section: 'needs-you',
    kind: 'choice',
    title: 't',
    scenario: 's',
    options: [],
    sources: [],
    dependsOn: [],
    state: 'open',
    thread: [],
    revisions: [],
    createdAt: 't',
    updatedAt: 't',
    ...over,
  }
}

const textOf = (line: { text: string }[]) => line.map(s => s.text).join('')

test('each kind waiting has its own bar colour; assumption is the plain text colour', () => {
  expect(barColour(make({ kind: 'choice' }))).toBe('suggestion')
  expect(barColour(make({ kind: 'go-ahead' }))).toBe('warning')
  expect(barColour(make({ kind: 'finding', state: 'live' }))).toBe('claude')
  expect(barColour(make({ kind: 'question' }))).toBe('error')
  expect(barColour(make({ kind: 'assumption' }))).toBeUndefined()
  expect(kindColour('question')).toBe('error')
  expect(kindLabel('question')).toBe('QUESTION')
  expect(kindLabel('go-ahead')).toBe('GO-AHEAD')
})

test('answered is success; sent and parked are dim', () => {
  expect(barColour(make({ state: 'ready' }))).toBe('success')
  expect(barColour(make({ state: 'sent' }))).toBe('dim')
  expect(barColour(make({ state: 'parked' }))).toBe('dim')
})

test('backticks become a code segment without the backticks', () => {
  expect(parseInline('call `request()` once')).toEqual([{ text: 'call ' }, { text: 'request()', code: true }, { text: ' once' }])
})

test('**bold**, _italic_ and *italic* lose their markers', () => {
  expect(parseInline('a **b** c')).toEqual([{ text: 'a ' }, { text: 'b', bold: true }, { text: ' c' }])
  expect(parseInline('_i_')).toEqual([{ text: 'i', italic: true }])
  expect(parseInline('x *i* y')).toEqual([{ text: 'x ' }, { text: 'i', italic: true }, { text: ' y' }])
})

test('anything unbalanced is drawn as typed, and snake_case is not italic', () => {
  expect(visibleText('an `unbalanced backtick')).toBe('an `unbalanced backtick')
  expect(visibleText('**half bold')).toBe('**half bold')
  expect(visibleText('a recipe_book_id field')).toBe('a recipe_book_id field')
  expect(visibleText('2 * 3 * 4')).toBe('2 * 3 * 4')
  expect(parseInline('a `` b')).toEqual([{ text: 'a `` b' }])
})

test('a URL in the text is a link with a short label', () => {
  const artifact = ['https://claude.ai', 'artifact', 'abc123'].join('/')
  expect(urlLabel(artifact)).toBe('artifact ↗')
  expect(urlLabel('https://github.com/o/pantry/pull/12')).toBe('#12 ↗')
  expect(urlLabel('https://github.com/o/pantry/issues/7')).toBe('#7 ↗')
  expect(urlLabel('https://example.com/docs/recipes/')).toBe('example.com/recipes ↗')
  expect(urlLabel('https://example.com')).toBe('example.com ↗')
  expect(parseInline('see https://github.com/o/pantry/pull/12.')).toEqual([
    { text: 'see ' },
    { text: '#12 ↗', href: 'https://github.com/o/pantry/pull/12' },
    { text: '.' },
  ])
  expect(parseInline('`https://example.com/x`')).toEqual([{ text: 'https://example.com/x', code: true }])
})

test('wrapping at a marker leaves no marker on either line, and nothing is swallowed', () => {
  const lines = wrapInline('aaaa **bold words** cc', 9)
  expect(lines.map(textOf)).toEqual(['aaaa bold', 'words cc'])
  expect(lines[0]!.find(s => s.text.includes('bold'))?.bold).toBe(true)
  expect(lines[1]![0]).toEqual({ text: 'words', bold: true })
  const code = wrapInline('run `npm test` now', 8)
  expect(code.map(textOf)).toEqual(['run npm', 'test now'])
  expect(code.flat().some(s => s.text.includes('`'))).toBe(false)
  const typed = wrapInline('an `unbalanced backtick here', 14)
  expect(typed.map(textOf).join(' ')).toBe('an `unbalanced backtick here')
})

test('a word longer than the line is split, and a newline starts a line', () => {
  expect(wrapInline('abcdefghij', 4).map(textOf)).toEqual(['abcd', 'efgh', 'ij'])
  expect(wrapInline('one\ntwo', 20).map(textOf)).toEqual(['one', 'two'])
})

test('Inline draws code in suggestion, bold, italic and a Link', async ($, on) => {
  on('ui.render', ($$: any, e: any) => Inline($$.ui.resolve(e), parseInline('a `c` **b** _i_ https://github.com/o/pantry/pull/3'), { dimColor: true }))
  const ui = await $.ui.mount({ plugin: 'decisions', component: 'Pane', requestId: 'x', surface: 'terminal', props: { title: 't', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 10 }, view: {} } } as any)
  const spans = (await ui.findAll({ type: 'Text' })) as any[]
  const span = (text: string) => spans.find(t => t.text === text)
  expect(span('c')?.props.color).toBe('suggestion')
  expect(span('b')?.props.bold).toBe(true)
  expect(span('i')?.props.italic).toBe(true)
  expect(spans[0].text).not.toContain('`')
  expect((await ui.find({ type: 'Link' }))?.props.href).toBe('https://github.com/o/pantry/pull/3')
  await ui.unmount()
})
