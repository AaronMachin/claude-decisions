import { expect, mock, test } from 'claude-code/testing'

import { isQuestionsInChat } from './register'

const ASK = {
  tool: 'AskUserQuestion',
  questions: [
    {
      question: 'Which library should we use?',
      header: 'Library',
      options: [
        { label: 'A', description: 'first' },
        { label: 'B', description: 'second' },
      ],
      multiSelect: false,
    },
    {
      question: 'Keep the cache?',
      header: 'Cache',
      options: [
        { label: 'Yes', description: 'keep' },
        { label: 'No', description: 'drop' },
      ],
      multiSelect: false,
    },
  ],
}

test('an AskUserQuestion call is answered by the mod and adds one decision per question', async ($, on) => {
  let reachedTool = false
  on('tool.call', { tool: 'AskUserQuestion' }, () => {
    reachedTool = true
    return { result: 'the real tool ran' }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.context', (_, e) => ({ blocks: e.blocks }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const answered = await $.tool.call(ASK)
  const text = answered.deny ?? answered.context?.[0]

  expect(reachedTool).toBe(false)
  expect(answered.result).toEqual({ questions: ASK.questions, answers: {} })
  expect(typeof text).toBe('string')
  expect(text).toContain('Added to the decisions pane as 1-2.')
  expect(text).toContain('carry on with other work')

  const context = await $.prompt.context({ blocks: [] })
  const block = context.blocks.find(b => b.name === 'decisions')?.text ?? ''
  expect(block).toContain('Which library should we use?')
  expect(block).toContain('Keep the cache?')
})

test('isQuestionsInChat catches a question and a numbered list, not statements', () => {
  expect(isQuestionsInChat('Should I push this?')).toBe(true)
  expect(isQuestionsInChat('1. Use Redis?\n2. Keep the cache?')).toBe(true)
  expect(isQuestionsInChat('I pushed it. The tests pass.')).toBe(false)
  expect(isQuestionsInChat('Why did this fail? Because the key was wrong.')).toBe(false)
})

test('a turn that ends with questions in chat gets a reminder appended', async ($, on) => {
  const session = mock.session(on)
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('session.messages', () => ({ value: [
    { role: 'user', text: 'plan it', toolUses: [] },
    { role: 'assistant', text: '1. Use Redis?\n2. Keep the cache?', toolUses: [] },
  ] }))
  await $.turn.complete({ answer: '1. Use Redis?\n2. Keep the cache?', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })

  const rows = session.appended()
  expect(rows.length).toBe(1)
  expect(rows[0].message.type).toBe('user')
  expect(JSON.stringify(rows[0].message.content)).toContain('decisions pane')
})

test('a turn that ends with a statement gets no reminder', async ($, on) => {
  const session = mock.session(on)
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('session.messages', () => ({ value: [
    { role: 'user', text: 'push it', toolUses: [] },
    { role: 'assistant', text: 'I pushed it. The tests pass.', toolUses: [] },
  ] }))
  await $.turn.complete({ answer: 'I pushed it. The tests pass.', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' })

  expect(session.appended().length).toBe(0)
})

test('the questions are read from the turn, not only the final answer', async ($, on) => {
  const session = mock.session(on)
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('session.messages', () => ({ value: [
    { role: 'user', text: 'review it', toolUses: [] },
    { role: 'assistant', text: '1. Rename it?\n2. Delete it?', toolUses: [{ id: 'x', name: 'Read' }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'x', text: 'ok', isError: false }] },
    { role: 'assistant', text: 'Let me know.', toolUses: [] },
  ] }))
  await $.turn.complete({ answer: 'Let me know.', durationMs: 5, isAborted: false, turnId: 't3', reason: 'answer' })

  expect(session.appended().length).toBe(1)
})
