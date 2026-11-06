import type { Register } from 'claude-code'

/** 'A' answers the call with `{ result }` (an empty answers object, the text as context), 'B' refuses it with `{ deny }`. Edit between sessions. */
const VARIANT: 'A' | 'B' = 'A'

const REMINDER =
  'Reminder from the decisions mod: your last turn ended with questions written in chat. Put them in the decisions pane instead, and say in one line what you added.'

type Pending = { id: string; question: string; header: string; options: string[] }

function lastSentence(text: string): string {
  const flat = text.trim().replace(/[*_`)"'\s]+$/, '')
  const parts = flat.split(/(?<=[.!?])\s+/)
  return parts[parts.length - 1] ?? ''
}

/**
 * True when the text ends by asking the person something: its last sentence is a
 * question, or two or more numbered or bulleted lines each end in a question mark.
 * A question answered later in the same text ("Why did it fail? Because...") is not.
 */
export function isQuestionsInChat(text: string): boolean {
  const itemQuestions = text
    .split('\n')
    .filter(line => /^\s*(\d+[.)]|[-*])\s+.*\?[*_`)"']*\s*$/.test(line))

  if (itemQuestions.length >= 2) {
    return true
  }

  const last = lastSentence(text)

  return last.endsWith('?')
}

export const register: Register = on => {
  const pending: Pending[] = []

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e) => {
    const first = pending.length + 1

    for (const q of e.questions) {
      pending.push({
        id: `d${pending.length + 1}`,
        question: q.question,
        header: q.header,
        options: q.options.map(o => o.label),
      })
    }

    const range = pending.length === first ? `${first}` : `${first}-${pending.length}`
    const text = `Added to the decisions pane as ${range}. The person will answer there; carry on with other work.`

    if (VARIANT === 'B') {
      return { deny: text }
    }

    // The engine refuses a string here: AskUserQuestion's result must be an object (questions, answers).
    return { result: { questions: e.questions, answers: {} }, context: [text] }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)

    if (e.agentId === undefined && e.reason === 'answer') {
      const messages = await $.session.messages()
      const texts: string[] = []

      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i]
        const isPrompt = m.role === 'user' && (m.toolResults ?? []).length === 0
        if (isPrompt) {
          break
        }
        if (m.role === 'assistant' && m.text !== '') {
          texts.unshift(m.text)
        }
      }

      const turnText = texts.join('\n') || e.answer

      if (isQuestionsInChat(turnText)) {
        await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: REMINDER }] } })
      }
    }

    return done
  })

  on('prompt.context', async ($, e, next) => {
    const context = await next(e)
    const text = pending.length === 0 ? 'No open decisions.' : pending.map(p => `- ${p.id} ${p.question}`).join('\n')

    return { ...context, blocks: [...context.blocks, { name: 'decisions', text: 'Open decisions in the pane:\n' + text }] }
  })
}
