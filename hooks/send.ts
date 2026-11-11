import { SETTLED_TEXT } from './discuss'
import { readAll, readOne, write } from './store'
import type { Decision, StoreCtx } from './store'

export type SendCtx = StoreCtx & { prompt: { submit: (args: { text: string }) => Promise<unknown> } }

export function readyDecisions(all: Decision[]): Decision[] {
  return all.filter(d => d.state === 'ready')
}

/** A typed answer is "Something else: <text>"; the old discussion marker and no answer read as before. */
function chosenText(text: string | undefined): string {
  if (text === undefined) {
    return 'nothing'
  }

  return text === SETTLED_TEXT ? text : `Something else: ${text}`
}

function block(d: Decision): string {
  const chosen = d.options.find(o => o.id === d.answer?.option)
  const lines = [
    `Decision ${d.id} · ${d.title} (${d.group ?? 'Other'})`,
    `Chosen: ${chosen ? `${chosen.id}. ${chosen.label}` : chosenText(d.answer?.text)}`,
    `Condition: ${d.answer?.condition ?? 'none'}`,
  ]
  if (d.thread.length === 0) {
    lines.push('Discussion: none')
  } else {
    lines.push('Discussion:', ...d.thread.map(entry => `  ${entry.who}: ${entry.text}`))
  }

  return lines.join('\n')
}

/** One decision's block as the prompt carries it, line by line, for the preview before sending it alone (decision 221). */
export function previewLines(d: Decision): string[] {
  return block(d).split('\n')
}

/** The one prompt that carries the answers to Claude. */
export function buildAnswerPrompt(decisions: Decision[]): string {
  const intro =
    decisions.length === 1
      ? "Answer from the decisions pane. This is the person's decision, so act on it and don't ask again. A condition is part of the answer. Do not write decision records or other files about the answers unless the person asks."
      : "Answers from the decisions pane. These are the person's decisions, so act on them and don't ask again. A condition is part of the answer. Do not write decision records or other files about the answers unless the person asks."

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
    await write($, { ...((await readOne($, d.id)) ?? d), state: 'sent', sentAt })
  }
  const settled = Promise.resolve()
    .then(() => $.prompt.submit({ text }))
    .then(
      () => undefined,
      async () => {
        for (const d of chosen) {
          await write($, { ...((await readOne($, d.id)) ?? d), state: 'ready', sentAt: undefined })
        }

        return `${chosen.length} not sent: Claude could not take them. They are back to ready.`
      },
    )

  return { sent: chosen.length, settled }
}
