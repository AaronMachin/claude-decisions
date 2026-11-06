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

/** Names this load of the mod; a pending question from another load has no one left to answer it. */
export const RUN: string = Math.random().toString(36).slice(2)

export type Waiter = { decisionId: string; asked: string; sent: string; turnId?: string; late?: boolean }

const waiters: Waiter[] = []
let busy = false
const SENT_MARK = 'plugin sent "On decision'
export const PLACEHOLDER = '(no text, see the line above)'

/** What the main session is sent: the number and title lead, so the chat row reads as about that decision. */
export function sentText(d: { number: number; title: string }, question: string): string {
  return `On decision ${d.number} · ${d.title}: ${question}`
}

export function addWaiter(w: Waiter): void {
  waiters.push(w)
}

/** The person sent that question to the fork; its main reply, when it comes, is still stored. */
export function markLate(asked: string): void {
  const w = waiters.find(x => x.asked === asked)
  if (w) {
    w.late = true
  }
}

export function isBusy(): boolean {
  return busy
}

/** A main-loop `turn.start`. The reply turn is the one whose text includes the engine's "plugin sent" framing and our sent text. */
export function routeStart(e: { text: string; turnId: string; agentId?: string }): Waiter | undefined {
  if (e.agentId !== undefined) {
    return undefined
  }
  busy = true
  if (!e.text.includes(SENT_MARK)) {
    return undefined
  }
  const open = waiters.filter(w => w.turnId === undefined)
  const found =
    open.find(w => e.text.includes(w.sent)) ??
    open.find(w => e.text.includes(w.sent.slice(0, w.sent.indexOf(':') + 1))) ??
    open[0]
  if (found) {
    found.turnId = e.turnId
  }

  return found
}

/** A `turn.complete`: the reply only for the turn `routeStart` claimed, never for whichever turn ends next. */
export function routeComplete(e: { turnId: string; agentId?: string; answer: string }): { waiter: Waiter; text: string } | undefined {
  if (e.agentId !== undefined) {
    return undefined
  }
  busy = false
  const at = waiters.findIndex(w => w.turnId === e.turnId)
  if (at === -1) {
    return undefined
  }
  const [waiter] = waiters.splice(at, 1)

  return { waiter: waiter!, text: e.answer.trim() === '' ? PLACEHOLDER : e.answer }
}
