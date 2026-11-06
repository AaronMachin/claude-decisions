import { expect, test } from 'claude-code/testing'

import {
  COMPACT_INSTRUCTION,
  NOTE,
  NUDGE,
  RULES_TEXT,
  RULE_PHRASES,
  addContextBlock,
  addRulesSection,
  answerAskUserQuestion,
  isQuestionsInChat,
  noteAtSessionStart,
  noteOnSubmit,
  nudgeAfterTurn,
  onCompact,
  refuseSubagent,
  resetNotes,
  turnText,
  whyQuestionsInChat,
} from './integrate'
import { create, readAll } from './store'
import type { StoreCtx } from './store'

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

// AskUserQuestion into the pane, and subagent refusals

function fakeStore(): StoreCtx {
  const files = new Map<string, string>()

  return {
    env: { get: async () => '/home/test' },
    session: { cwd: async () => '/work/pantry' },
    process: { run: async () => ({ exitCode: 0, stdout: '/work/pantry/.git\n' }) },
    fs: {
      read: async (path: string) => {
        const text = files.get(path)
        if (text === undefined) {
          throw new Error('ENOENT')
        }
        return text
      },
      write: async (path: string, text: string) => void files.set(path, text),
      exists: async (path: string) => files.has(path),
      list: async (dir: string) => {
        const found = [...files.keys()].filter(p => p.startsWith(dir + '/')).map(p => ({ name: p.slice(dir.length + 1) }))
        if (found.length === 0) {
          throw new Error('ENOENT')
        }
        return found
      },
    },
  }
}

const QUESTIONS: any[] = [
  {
    question: 'Where should shared recipe links live?',
    header: 'Links',
    options: [
      { label: 'Database', description: 'a table of tokens' },
      { label: 'Signed URL', description: 'nothing stored' },
    ],
    multiSelect: false,
  },
  { question: 'What should the link page be called?', header: 'Naming', kind: 'text', options: [], multiSelect: false },
  {
    question: 'Which of these should links expire with?',
    header: 'Expiry',
    options: [{ label: 'Time' }, { label: 'First view' }, { label: 'Never' }],
    multiSelect: true,
  },
]

test('AskUserQuestion becomes decisions and is answered with the object shape', async () => {
  const $ = fakeStore()
  const answer: any = await answerAskUserQuestion($, { questions: QUESTIONS })

  expect(answer.result).toEqual({ questions: QUESTIONS, answers: {} })
  expect(answer.context).toHaveLength(1)
  expect(answer.context[0]).toContain('Added to the decisions pane as 1-3.')

  const { decisions } = await readAll($)
  expect(decisions.map(d => d.kind)).toEqual(['choice', 'question', 'question'])
  expect(decisions.every(d => d.group === 'Questions from Claude' && d.section === 'needs-you')).toBe(true)
  expect(decisions[0]!.title).toBe('Where should shared recipe links live?')
  expect(decisions[0]!.options.map(o => [o.label, o.changes])).toEqual([
    ['Database', 'a table of tokens'],
    ['Signed URL', 'nothing stored'],
  ])
  expect(decisions[0]!.recommendation).toBeUndefined()
  expect(decisions[0]!.scenario).toContain('Links')
  expect(decisions[1]!.options).toEqual([])
  expect(decisions[2]!.options).toEqual([])
  expect(decisions[2]!.scenario).toContain('Pick any of: Time, First view, Never')
})

test('one question reads as a single number', async () => {
  const $ = fakeStore()
  const answer: any = await answerAskUserQuestion($, { questions: [QUESTIONS[0]] })

  expect(answer.context[0]).toContain('as 1.')
})

test('a store that cannot be written answers with the one deny that lets Claude ask in chat', async () => {
  const $ = fakeStore()
  $.fs.write = async () => {
    throw new Error('disk full')
  }
  const answer: any = await answerAskUserQuestion($, { questions: [QUESTIONS[0]] })

  expect(answer.deny).toContain('Ask in chat')
})

test('a call from a subagent is refused with a reason to report to the main session; the main session passes', () => {
  expect((refuseSubagent({ agentId: 'a1' }) as any).deny).toContain('main session')
  expect(refuseSubagent({})).toBeUndefined()
})

// The system prompt section, the open list, the session note and compaction


test('the rules section is added once as a session section, with identical text every time and every rule phrase', () => {
  const base = { sections: [{ id: 'intro', text: 'x', scope: 'shared' as const }] }
  const first = addRulesSection(base)
  const second = addRulesSection(base)

  expect(first.sections.map(s => s.id)).toEqual(['intro', 'decisions:rules'])
  expect(first.sections[1]!.scope).toBe('session')
  expect(first.sections[1]!.text).toBe(second.sections[1]!.text)
  expect(addRulesSection(first).sections).toHaveLength(2)
  for (const phrase of RULE_PHRASES) {
    expect(RULES_TEXT).toContain(phrase)
  }
})

test('the open list is added as a context block that says to call decisions_list for the current one', async () => {
  const $ = fakeStore()
  const empty = await addContextBlock($, { blocks: [{ name: 'claudeMd', text: 'c' }] })
  expect(empty.blocks.map(b => b.name)).toEqual(['claudeMd', 'decisions'])
  expect(empty.blocks[1]!.text).toContain('No open decisions')
  await create($, { group: 'G', kind: 'choice', title: 'Where it lives', scenario: 's', options: [{ id: 1, label: 'Root' }], sources: [], dependsOn: [] })
  const full = await addContextBlock($, { blocks: [] })
  expect(full.blocks[0]!.text).toContain('Where it lives')
  expect(full.blocks[0]!.text).toContain('decisions_list')
})

test('the note is appended at session start unless the conversation already holds it', async () => {
  const fresh = fakeSession([])
  await noteAtSessionStart(fresh.$)
  expect(fresh.appended).toHaveLength(1)
  expect(fresh.appended[0]!.message.content[0].text).toBe(NOTE)

  const held = fakeSession([{ role: 'user', text: NOTE }])
  await noteAtSessionStart(held.$)
  expect(held.appended).toHaveLength(0)
})

test('after /clear the first prompt appends the note; a later prompt does not', async () => {
  resetNotes()
  const cleared = fakeSession([])
  ;(cleared.$.session as any).turns = async () => 0
  await noteOnSubmit(cleared.$)
  expect(cleared.appended).toHaveLength(1)

  const later = fakeSession([{ role: 'user', text: 'hi' }])
  ;(later.$.session as any).turns = async () => 5
  await noteOnSubmit(later.$)
  expect(later.appended).toHaveLength(0)

  const held = fakeSession([{ role: 'user', text: NOTE }])
  ;(held.$.session as any).turns = async () => 1
  await noteOnSubmit(held.$)
  expect(held.appended).toHaveLength(0)
})

test('a compaction asks the summary to keep the open decisions, and the next prompt appends the note once', async () => {
  const seen: any[] = []
  const next = async (e: any) => {
    seen.push(e)

    return { messages: [] }
  }
  await onCompact({ trigger: 'manual', instructions: 'the plan', messages: [] } as any, next)
  expect(seen[0].instructions).toContain('the plan')
  expect(seen[0].instructions).toContain(COMPACT_INSTRUCTION)

  const after = fakeSession([{ role: 'user', text: 'Summary of the conversation' }])
  ;(after.$.session as any).turns = async () => 9
  await noteOnSubmit(after.$)
  await noteOnSubmit(after.$)
  expect(after.appended).toHaveLength(1)
})

test('a skipped, precompute or subagent compaction passes through and sets no flag', async () => {
  const passes: any[] = []
  const skip = async (e: any) => {
    passes.push(e)

    return { skip: 'off' }
  }
  await onCompact({ trigger: 'manual', messages: [] } as any, skip)
  await onCompact({ trigger: 'precompute', messages: [] } as any, async (e: any) => ({ messages: [], e }))
  await onCompact({ trigger: 'auto', agentId: 'a1', messages: [] } as any, async (e: any) => ({ messages: [], e }))
  expect(passes[0].instructions).toContain(COMPACT_INSTRUCTION)

  const quiet = fakeSession([{ role: 'user', text: 'hi' }])
  ;(quiet.$.session as any).turns = async () => 9
  await noteOnSubmit(quiet.$)
  expect(quiet.appended).toHaveLength(0)
})

test('the note appended at session start is not appended again by the first prompt, but is after /clear', async () => {
  resetNotes()
  const started = fakeSession([])
  ;(started.$.session as any).turns = async () => 0
  await noteAtSessionStart(started.$)
  await noteOnSubmit(started.$)
  expect(started.appended).toHaveLength(1)

  await noteOnSubmit(started.$)
  expect(started.appended).toHaveLength(2)
  resetNotes()
})

test('an AskUserQuestion with no questions adds nothing and says so', async () => {
  const answer: any = await answerAskUserQuestion(fakeStore(), { questions: [] })

  expect(answer.context[0]).toContain('nothing was added')
})

test('whyQuestionsInChat names the rule that flagged the text', () => {
  expect(whyQuestionsInChat('Questions:\n1. Redis?\n2. Postgres?')).toBe('list')
  expect(whyQuestionsInChat('I looked at it. Should I push this?')).toBe('last')
  expect(whyQuestionsInChat('Which would you prefer? I will wait.')).toBe('mid')
  expect(whyQuestionsInChat('Done. Want me to carry on?')).toBeUndefined()
})
