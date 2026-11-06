/** How Claude is steered to the pane: the nudge, AskUserQuestion, subagent refusals and the prompt hooks. */

import { listDecisions } from './tool'
import { create } from './store'
import type { StoreCtx } from './store'

/** Phrases every statement of the rules carries: the tool description, the system prompt section. */
export const RULE_PHRASES = [
  'decisions pane',
  'one line in chat',
  'decisions_list',
  'AskUserQuestion',
  'starts with the area',
  'main session',
  'recommendation',
]

export const NUDGE =
  'Reminder from the decisions mod: your last turn ended with questions written in chat. Put them in the decisions pane instead with decisions_add, and say in one line what you added.'

type Message = { role: 'user' | 'assistant'; text: string; toolResults?: readonly unknown[] }

function lastSentence(text: string): string {
  const flat = text.trim().replace(/[*_`)"'\s]+$/, '')
  const parts = flat.split(/(?<=[.!?])\s+/)

  return parts[parts.length - 1] ?? ''
}

function bare(sentence: string): string {
  return sentence.replace(/^[\s>*_`\-\d.)]+/, '').replace(/[*_`)"'\s]+$/, '')
}

/** "Want me to carry on?" and its kin: a courtesy, not a decision. */
function isOffer(sentence: string): boolean {
  return /^(want me to|shall i|should i)\s+(carry on|continue|proceed|keep going|go ahead|move on)(\s+[^\s?]+){0,3}\s*\?$/i.test(bare(sentence))
}

const ASKS = /^(should i|do you want|would you prefer|which would you prefer)\b[^?]*\?$/i

/**
 * True when the text asks the person something: two or more list lines each end in a
 * question mark, the last sentence is a question (but not an offer to carry on), or any
 * sentence opens "should I", "do you want", "would you prefer" or "which would you prefer".
 * A question answered later in the same text ("Why did it fail? Because...") is not.
 */
export function isQuestionsInChat(text: string): boolean {
  const itemQuestions = text.split('\n').filter(line => /^\s*(\d+[.)]|[-*])\s+.*\?[*_`)"']*\s*$/.test(line))
  if (itemQuestions.length >= 2) {
    return true
  }
  const last = lastSentence(text)
  if (last.endsWith('?') && !isOffer(last)) {
    return true
  }
  const sentences = text.split(/(?<=[.!?])\s+/)

  return sentences.some(s => ASKS.test(bare(s)) && !isOffer(s))
}

/** The assistant text since the last prompt from the person (not a tool result), or `answer` when there is none. */
export function turnText(messages: readonly Message[], answer: string): string {
  const texts: string[] = []
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.role === 'user' && (m.toolResults ?? []).length === 0) {
      break
    }
    if (m.role === 'assistant' && m.text !== '') {
      texts.unshift(m.text)
    }
  }

  return texts.join('\n') || answer
}

let lastNudged = ''

/** After a main-session turn that ends with questions in chat, appends the reminder, once per turn. */
export async function nudgeAfterTurn($: any, e: { agentId?: string; reason?: string; answer?: string }): Promise<void> {
  if (e.agentId !== undefined || e.reason !== 'answer') {
    return
  }
  const messages: Message[] = await $.session.messages()
  const lastPrompt = [...messages].reverse().find(m => m.role === 'user' && (m.toolResults ?? []).length === 0)
  if (lastPrompt && /On decision \d+ ·/.test(lastPrompt.text)) {
    return
  }
  if (!isQuestionsInChat(turnText(messages, e.answer ?? ''))) {
    return
  }
  const key = `${messages.length}:${messages[messages.length - 1]?.text ?? ''}`
  if (key === lastNudged) {
    return
  }
  lastNudged = key
  await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: NUDGE }] } })
}

export const SUBAGENT_REFUSAL =
  'Only the main session adds decisions. Report this to the main session in your final message and it will add it to the pane.'

/** A subagent's call (it carries an agentId) is refused before anything is written. */
export function refuseSubagent(e: { agentId?: string }): { deny: string } | undefined {
  return e.agentId === undefined ? undefined : { deny: SUBAGENT_REFUSAL }
}

type AskQuestion = {
  question: string
  header?: string
  description?: string
  kind?: 'choice' | 'text' | 'number'
  options?: { label: string; description?: string }[]
  multiSelect?: boolean
  min?: number
  max?: number
}

const ASK_GROUP = 'Questions from Claude'

function scenarioOf(q: AskQuestion, labels: string[]): string {
  const lead = [q.header, q.description ?? 'Claude asked this and had no more to say.'].filter(Boolean).join('. ')
  const extra: string[] = []
  if (q.multiSelect === true && labels.length > 0) {
    extra.push(`Pick any of: ${labels.join(', ')}.`)
  }
  if (q.kind === 'number' && q.min !== undefined && q.max !== undefined) {
    extra.push(`Answer with a number from ${q.min} to ${q.max}.`)
  }

  return [lead.endsWith('.') ? lead : `${lead}.`, ...extra].join(' ')
}

/**
 * AskUserQuestion: each question becomes a decision (a choice when it has options and
 * takes one answer, otherwise a question), and the call is answered at once with the
 * object shape the tool requires and a note that the questions are in the pane.
 */
export async function answerAskUserQuestion(
  $: StoreCtx,
  e: { questions: AskQuestion[] },
): Promise<{ result: { questions: AskQuestion[]; answers: Record<string, never> }; context: string[] } | { deny: string }> {
  const numbers: number[] = []
  try {
    for (const q of e.questions) {
      const options = q.options ?? []
      const isChoice = options.length > 0 && q.multiSelect !== true && (q.kind ?? 'choice') === 'choice'
      const made = await create($, {
        group: ASK_GROUP,
        kind: isChoice ? 'choice' : 'question',
        title: q.question.trim(),
        scenario: scenarioOf(q, options.map(o => o.label)),
        options: isChoice
          ? options.map((o, index) => ({ id: index + 1, label: o.label, ...(o.description ? { changes: o.description } : {}) }))
          : [],
        sources: [],
        dependsOn: [],
      })
      numbers.push(made.number)
    }
  } catch {
    return { deny: 'The decisions pane could not be written. Ask in chat this once.' }
  }
  const range = numbers.length === 1 ? `${numbers[0]}` : `${numbers[0]}-${numbers[numbers.length - 1]}`

  return {
    result: { questions: e.questions, answers: {} },
    context: [`Added to the decisions pane as ${range}. The person will answer there and the answers arrive as a prompt; carry on with other work.`],
  }
}

/** The short form of the rules, for the system prompt. Built once, so every call returns the same text. */
export const RULES_TEXT = [
  'The decisions mod is on. Put every question, decision, assumption and go-ahead for the person in the decisions pane with decisions_add, never as a list or a question in chat, and never with AskUserQuestion.',
  'Write one line in chat saying what you added, and keep working on anything that does not depend on an open decision.',
  'Give every decision a concrete scenario and a recommendation with its reason, and a plain title; a finding\'s title starts with the area it is about.',
  'Call decisions_list at the start of a conversation and after /compact or /clear, and never ask again what is already open, answered or parked.',
  'Only the main session adds decisions: a subagent reports to the main session, which adds them.',
].join('\n')

type Section = { id: string; text: string; scope: 'shared' | 'session' }

/** The `prompt.compose` answer with the rules section added, once, on the session side. */
export function addRulesSection(result: { sections: readonly Section[] }): { sections: readonly Section[] } {
  if (result.sections.some(s => s.id === 'decisions:rules')) {
    return result
  }

  return { sections: [...result.sections, { id: 'decisions:rules', text: RULES_TEXT, scope: 'session' }] }
}

/** The `prompt.context` answer with the open list added as one block. */
export async function addContextBlock(
  $: StoreCtx,
  result: { blocks: readonly { name: string; text: string }[] },
): Promise<{ blocks: readonly { name: string; text: string }[] }> {
  const { result: list } = await listDecisions($)

  return {
    ...result,
    blocks: [
      ...result.blocks,
      { name: 'decisions', text: `Decisions pane, as at the start of this conversation (call decisions_list for the current list):\n${list}` },
    ],
  }
}

export const NOTE =
  'The decisions mod is on: put questions in the decisions pane with decisions_add, and call decisions_list first.'

const asNote = { message: { type: 'user', content: [{ type: 'text', text: NOTE }] } }

async function holdsNote($: any): Promise<boolean> {
  const messages: Message[] = await $.session.messages()

  return messages.some(m => m.role === 'user' && m.text.includes(NOTE))
}

/** At session start, unless a reload finds the note already in the conversation. */
export async function noteAtSessionStart($: any): Promise<void> {
  if (!(await holdsNote($))) {
    await $.session.append(asNote)
  }
}

let isNoteDue = false

/**
 * On a prompt: the first one after /clear (session.start does not fire there), or the
 * first one after a compaction. Never twice, and not when the conversation holds it.
 */
export async function noteOnSubmit($: any): Promise<void> {
  if (isNoteDue) {
    isNoteDue = false
    await $.session.append(asNote)

    return
  }
  if ((await $.session.turns()) <= 1 && !(await holdsNote($))) {
    await $.session.append(asNote)
  }
}

export const COMPACT_INSTRUCTION = 'Keep the ids and titles of the open, answered and parked decisions in the decisions pane.'

/** A main-conversation compaction: asks the summary to keep the open decisions and flags the note for the next prompt. */
export async function onCompact(e: any, next: (e: any) => Promise<any>): Promise<any> {
  if (e.agentId !== undefined || e.trigger === 'precompute') {
    return next(e)
  }
  const instructions = e.instructions ? `${e.instructions}\n${COMPACT_INSTRUCTION}` : COMPACT_INSTRUCTION
  const done = await next({ ...e, instructions })
  if (done && done.messages !== undefined) {
    isNoteDue = true
  }

  return done
}
