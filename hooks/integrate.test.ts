import { expect, test } from 'claude-code/testing'

import { NUDGE, isQuestionsInChat, nudgeAfterTurn, turnText } from './integrate'

type Message = { role: 'user' | 'assistant'; text: string; toolResults?: unknown[] }

function fakeSession(messages: Message[]): { $: any; appended: any[] } {
  const appended: any[] = []
  const $ = {
    session: {
      messages: async () => messages,
      append: async (args: any) => void appended.push(args),
    },
  }

  return { $, appended }
}

test('isQuestionsInChat fires on a numbered question list, a closing question and a mid-text question', () => {
  expect(isQuestionsInChat('1. Use Redis?\n2. Keep the cache?')).toBe(true)
  expect(isQuestionsInChat('I looked at it. Should I push this?')).toBe(true)
  expect(isQuestionsInChat('Which would you prefer? I will wait for you.')).toBe(true)
  expect(isQuestionsInChat('Done with the plan. Do you want the short or the long version? Either is fine.')).toBe(true)
  expect(isQuestionsInChat('Want me to drop the migration?')).toBe(true)
})

test('isQuestionsInChat leaves statements, answered questions and offers to carry on alone', () => {
  expect(isQuestionsInChat('I pushed it. The tests pass.')).toBe(false)
  expect(isQuestionsInChat('Why did this fail? Because the key was wrong.')).toBe(false)
  expect(isQuestionsInChat('Done. Want me to carry on?')).toBe(false)
  expect(isQuestionsInChat('Shall I continue?')).toBe(false)
  expect(isQuestionsInChat('Should I go ahead with the rest?')).toBe(false)
  expect(isQuestionsInChat('')).toBe(false)
})

test('turnText joins the assistant text since the last prompt and ignores tool results', () => {
  const text = turnText(
    [
      { role: 'user', text: 'old prompt' },
      { role: 'assistant', text: 'old answer?' },
      { role: 'user', text: 'plan it' },
      { role: 'assistant', text: 'First part.' },
      { role: 'user', text: '', toolResults: [{}] },
      { role: 'assistant', text: 'Second part.' },
    ],
    'Second part.',
  )

  expect(text).toBe('First part.\nSecond part.')
  expect(turnText([], 'fallback')).toBe('fallback')
})

test('the nudge is appended once after a main-session turn that ends with questions', async () => {
  const { $, appended } = fakeSession([
    { role: 'user', text: 'plan it' },
    { role: 'assistant', text: '1. Redis?\n2. Postgres?' },
  ])
  await nudgeAfterTurn($, { reason: 'answer', answer: '1. Redis?\n2. Postgres?' })
  await nudgeAfterTurn($, { reason: 'answer', answer: '1. Redis?\n2. Postgres?' })

  expect(appended).toHaveLength(1)
  expect(appended[0].message.content[0].text).toBe(NUDGE)
  expect(NUDGE).toContain('decisions pane')
})

test('the nudge stays quiet on a statement, an offer, a subagent turn and a discussion reply', async () => {
  const statement = fakeSession([{ role: 'user', text: 'go' }, { role: 'assistant', text: 'Done. Tests pass.' }])
  await nudgeAfterTurn(statement.$, { reason: 'answer', answer: 'Done. Tests pass.' })
  expect(statement.appended).toHaveLength(0)

  const offer = fakeSession([{ role: 'user', text: 'go' }, { role: 'assistant', text: 'Done. Want me to carry on?' }])
  await nudgeAfterTurn(offer.$, { reason: 'answer', answer: 'Done. Want me to carry on?' })
  expect(offer.appended).toHaveLength(0)

  const sub = fakeSession([{ role: 'user', text: 'go' }, { role: 'assistant', text: 'Should I push this?' }])
  await nudgeAfterTurn(sub.$, { reason: 'answer', answer: 'Should I push this?', agentId: 'a1' })
  expect(sub.appended).toHaveLength(0)

  const reply = fakeSession([
    { role: 'user', text: 'On decision 3 · Where it lives: why not the root?' },
    { role: 'assistant', text: 'Because of packages. Does that change your answer?' },
  ])
  await nudgeAfterTurn(reply.$, { reason: 'answer', answer: 'Because of packages. Does that change your answer?' })
  expect(reply.appended).toHaveLength(0)
})
