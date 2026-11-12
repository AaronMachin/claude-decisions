import { expect, test } from 'claude-code/testing'

import { validateProblem } from '../../hooks/problem'
import { validateSession } from '../../hooks/session'
import { validateAdd } from '../../hooks/tool'
import { unreadReplies } from '../../hooks/pane/seen'
import { CHOICES, INBOX, MODEL_PROBLEM, SEEDED, SESSION_RECORD, inboxState, shifted } from './ux-fixture'

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

test('the inbox group has an unread reply, an answer with a condition, one with Something else and a quick answer, and they load', async () => {
  const at = '2026-11-12T10:00:00.000Z'
  const later = '2026-11-12T10:05:00.000Z'
  expect(INBOX).toHaveLength(4)
  const made = INBOX.map((entry, index) => ({ ...entry.input, id: `d${index + 1}`, createdAt: at, thread: [], options: (entry.input.options ?? []).map((o: any, i: number) => ({ id: i + 1, ...o })) }))
  const [unread, condition, typed, quick] = INBOX.map((entry, index) => inboxState(made[index] as any, entry, later))
  expect(unreadReplies(unread as any, undefined)).toHaveLength(1)
  expect(condition!.state).toBe('ready')
  expect([condition!.answer?.option, condition!.answer?.condition]).toEqual([1, 'only for recipes with photos'])
  expect(typed!.state).toBe('ready')
  expect([typed!.answer?.option, typed!.answer?.text]).toEqual([undefined, 'a QR code on the printed recipe card'])
  expect(quick!.thread.map((e: any) => `${e.who}:${e.via ?? ''}`)).toEqual(['person:', 'quick:triage'])
  expect(unreadReplies(quick as any, undefined)).toHaveLength(1)
  expect(SEEDED.slice(-4)).toEqual(INBOX.map(entry => entry.input))
})

test('the session record is a valid decisions_session call, and the model-written problem fits', () => {
  expect(validateSession(SESSION_RECORD)).toBeUndefined()
  expect(validateProblem(MODEL_PROBLEM, 'decisions_add')).toBeUndefined()
  expect(SESSION_RECORD.links[0].url).toMatch(/^https:\/\/github\.com\/example\//)
})
