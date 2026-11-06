import { readAll, write } from './store'
import type { Decision, StoreCtx } from './store'

export type SendCtx = StoreCtx & { prompt: { submit: (args: { text: string }) => Promise<unknown> } }

export function readyDecisions(all: Decision[]): Decision[] {
  return all.filter(d => d.state === 'ready')
}

function block(d: Decision): string {
  const chosen = d.options.find(o => o.id === d.answer?.option)
  const lines = [
    `Decision ${d.id} · ${d.title} (${d.group ?? 'Other'})`,
    `Chosen: ${chosen ? `${chosen.id}. ${chosen.label}` : (d.answer?.text ?? 'nothing')}`,
    `Condition: ${d.answer?.condition ?? 'none'}`,
  ]
  if (d.thread.length === 0) {
    lines.push('Discussion: none')
  } else {
    lines.push('Discussion:', ...d.thread.map(entry => `  ${entry.who}: ${entry.text}`))
  }

  return lines.join('\n')
}

/** The one prompt that carries the answers to Claude. */
export function buildAnswerPrompt(decisions: Decision[]): string {
  const intro =
    decisions.length === 1
      ? "Answer from the decisions pane. This is the person's decision, so act on it and don't ask again. A condition is part of the answer."
      : "Answers from the decisions pane. These are the person's decisions, so act on them and don't ask again. A condition is part of the answer."

  return [intro, ...decisions.map(block)].join('\n\n')
}

/**
 * Marks the ticked ready decisions sent, then submits one prompt without waiting
 * for the turn to end. `settled` resolves with a notice if the submit failed (the
 * decisions are back to ready by then), otherwise with undefined.
 */
export async function sendTicked(
  $: SendCtx,
  ids: string[],
): Promise<{ sent: number; settled: Promise<string | undefined> }> {
  const { decisions } = await readAll($)
  const chosen = readyDecisions(decisions).filter(d => ids.includes(d.id))
  if (chosen.length === 0) {
    return { sent: 0, settled: Promise.resolve(undefined) }
  }
  const text = buildAnswerPrompt(chosen)
  const sentAt = new Date().toISOString()
  for (const d of chosen) {
    await write($, { ...d, state: 'sent', sentAt })
  }
  const settled = Promise.resolve()
    .then(() => $.prompt.submit({ text }))
    .then(
      () => undefined,
      async () => {
        for (const d of chosen) {
          await write($, { ...d, state: 'ready', sentAt: undefined })
        }

        return `${chosen.length} not sent: Claude could not take them. They are back to ready.`
      },
    )

  return { sent: chosen.length, settled }
}
