import { readOne, write } from './store'
import type { Decision, StoreCtx, ThreadEntry } from './store'

/** Appends the person's question to the thread and moves an open decision to live. Undefined when the decision is missing. */
export async function recordQuestion(store: StoreCtx, id: string, text: string): Promise<{ asked: string } | undefined> {
  const d = await readOne(store, id)
  if (!d) {
    return undefined
  }
  let asked = new Date().toISOString()
  while (d.thread.some(e => e.at === asked)) {
    asked = new Date(Date.parse(asked) + 1).toISOString()
  }
  const entry: ThreadEntry = { who: 'person', text, at: asked }
  await write(store, { ...d, state: d.state === 'open' ? 'live' : d.state, thread: [...d.thread, entry] })

  return { asked }
}

/**
 * Writes a reply directly under the question it answers (at the end when that
 * question isn't found). The decision's state is never changed, so a reply to a
 * sent decision is kept as it is.
 */
export async function recordReply(
  store: StoreCtx,
  id: string,
  asked: string,
  who: 'claude' | 'fork' | 'quick',
  text: string,
): Promise<boolean> {
  const d = await readOne(store, id)
  if (!d) {
    return false
  }
  const entry: ThreadEntry = { who, text, at: new Date().toISOString() }
  const at = d.thread.findIndex(e => e.who === 'person' && e.at === asked)
  const thread = at === -1 ? [...d.thread, entry] : [...d.thread.slice(0, at + 1), entry, ...d.thread.slice(at + 1)]
  await write(store, { ...d, thread })

  return true
}

export const SETTLED_TEXT = 'settled in the discussion, see below'

/** `d` then enter: an open, live or parked decision becomes ready, answered by its discussion. */
export async function markAnswered(store: StoreCtx, id: string): Promise<boolean> {
  const d = await readOne(store, id)
  if (!d || !['open', 'live', 'parked'].includes(d.state)) {
    return false
  }
  const { parkedReason: _gone, ...rest } = d
  const next: Decision = { ...rest, state: 'ready', answer: { text: SETTLED_TEXT, answeredAt: new Date().toISOString() } }
  await write(store, next)

  return true
}

export type ModelCtx = {
  model: {
    fork: (request: { prompt: string }) => Promise<any>
    complete: (request: { model: string; prompt: string }) => Promise<any>
  }
}

/** The decision as the fork or quick model is given it: title, scenario, numbered options, recommendation. */
export function contextFor(d: Decision): string {
  const options = d.options.map(o => `${o.id}. ${o.label}${o.changes ? ` (${o.changes})` : ''}`)
  const lines = [`Decision ${d.number}: ${d.title}`, `Today: ${d.scenario}`, 'Options:', ...options]
  if (d.recommendation) {
    lines.push(`Recommended: ${d.recommendation.option}, because ${d.recommendation.reason}`)
  }

  return lines.join('\n')
}

const SHORT = 'Answer in at most four sentences.'
const NO_FILES = "You can't read project files in this reply, so if the question needs code, say so and stop."

/** One call to the fork or the quick model (haiku, the decision only). Never throws. */
export async function askModel(
  $: ModelCtx,
  mode: 'fork' | 'quick',
  d: Decision,
  question: string,
): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  try {
    const result =
      mode === 'fork'
        ? await $.model.fork({
            prompt: `A question about this decision in the decisions pane.\n\n${contextFor(d)}\n\nQuestion: ${question}\n\n${SHORT} ${NO_FILES}`,
          })
        : await $.model.complete({
            model: 'haiku',
            prompt: `A question about this decision.\n\n${contextFor(d)}\n\nQuestion: ${question}\n\n${SHORT}`,
          })

    return result.isAnswered ? { ok: true, text: result.text } : { ok: false, reason: String(result.reason ?? 'no reply') }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}
