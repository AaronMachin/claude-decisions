/** How Claude is steered to the pane: the nudge, AskUserQuestion, subagent refusals and the prompt hooks. */

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
    const m = messages[i]
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
