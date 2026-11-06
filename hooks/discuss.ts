import type { PaneView, PendingQuestion } from '../types'
import { readView, setView } from './pane/decision'
import { statusText } from './pane/list'
import { readAll, readOne, write } from './store'
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
 * Writes a reply at the end of its question's group: after the question and any
 * replies or ↻ lines already under it, before the next question (at the end of the
 * thread when the question isn't found). The decision's state is never changed, so a reply to a
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
  let end = at + 1
  while (at !== -1 && end < d.thread.length && d.thread[end]!.who !== 'person') {
    end += 1
  }
  const thread = at === -1 ? [...d.thread, entry] : [...d.thread.slice(0, end), entry, ...d.thread.slice(end)]
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

/** A main-loop `turn.start`. The reply turn is the one whose text includes the text we sent. */
export function routeStart(e: { text: string; turnId: string; agentId?: string }): Waiter | undefined {
  if (e.agentId !== undefined) {
    return undefined
  }
  busy = true
  const open = waiters.filter(w => w.turnId === undefined)
  // Claude Code 2.1.319 frames the sent text as `The <plugin> plugin sent a message:\n<text>`; 2.1.318 as `... plugin sent "<text>"`. Match the text itself, then the number-and-title lead, never the framing alone.
  const found =
    open.find(w => e.text.includes(w.sent)) ??
    (/plugin sent/.test(e.text) ? open.find(w => e.text.includes(w.sent.slice(0, w.sent.indexOf(':') + 1))) : undefined)
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

export type Mode = 'main' | 'fork' | 'quick'

/** `/config`'s `Discussion replies` value as a mode; anything unknown is the main session. */
export function modeOf(option: unknown): Mode {
  return option === 'fork' ? 'fork' : option === 'quick model' ? 'quick' : 'main'
}

let configured: Mode = 'main'

/** Called by `register(on, options)`: the mode for questions asked from now on. */
export function configure(options: { discussionReplies?: unknown } | undefined): void {
  configured = modeOf(options?.discussionReplies)
}

export function currentMode(): Mode {
  return configured
}

/** The pane state, behind a seam so tests can use their own (the kit gives a test body no `$.state`). */
type ViewApi = { set: (change: (v: PaneView) => PaneView) => Promise<unknown>; read: () => Promise<PaneView> }
let testView: ViewApi | undefined

export function useViewApi(api: ViewApi | undefined): void {
  testView = api
}

/** `$` can only be passed to a function declaration, so the seam is a branch, not a replaceable function. */
async function setState($: any, change: (v: PaneView) => PaneView): Promise<unknown> {
  return testView ? testView.set(change) : setView($, change)
}

async function readState($: any): Promise<PaneView> {
  return testView ? testView.read() : readView($)
}

/** Refreshes the status line and redraws the pane. */
async function redraw($: any): Promise<void> {
  const { decisions } = await readAll($)
  $.ui.status(statusText(decisions))
  $.ui.invalidate('ui.render')
}

function without(list: PendingQuestion[], asked: string, mode?: Mode): PendingQuestion[] {
  return list.filter(p => !(p.asked === asked && (mode === undefined || p.mode === mode)))
}

async function setPending($: any, change: (list: PendingQuestion[]) => PendingQuestion[]): Promise<void> {
  await setState($, v => ({ ...v, pending: change(v.pending) }))
}

/** Sends a question already in the thread to a replier, and takes the reply when it lands. */
async function dispatch($: any, mode: Mode, d: Decision, asked: string, question: string): Promise<void> {
  const isBusyNow = isBusy()
  const status: PendingQuestion['status'] = mode === 'main' ? (isBusyNow ? 'queued' : 'waiting') : 'answering'
  await setPending($, list => [...without(list, asked, mode), { asked, decisionId: d.id, mode, status, run: RUN }])
  await setState($, v => ({ ...v, isAsking: false }))
  await redraw($)

  const fail = async (reason: string) => {
    await setPending($, list => list.map(p => (p.asked === asked && p.mode === mode ? { ...p, status: 'failed', reason } : p)))
    await redraw($)
  }

  if (mode === 'main') {
    addWaiter({ decisionId: d.id, asked, sent: sentText(d, question) })
    $.prompt.submit({ text: sentText(d, question) }).catch(async (error: unknown) => {
      markLate(asked)
      await fail(error instanceof Error ? error.message : String(error))
    })

    return
  }
  const reply = await askModel($, mode, d, question)
  if (!reply.ok) {
    await fail(reply.reason)

    return
  }
  await recordReply($, d.id, asked, mode, reply.text)
  await setPending($, list => without(list, asked, mode))
  await redraw($)
}

/** The person sent a question from the thread: keep it, clear the draft, hand it to the replier. */
export async function askQuestion($: any, mode: Mode, decisionId: string, question: string): Promise<void> {
  const recorded = await recordQuestion($, decisionId, question)
  const d = await readOne($, decisionId)
  if (!recorded || !d) {
    return
  }
  await setState($, v => {
    const { [decisionId]: _gone, ...drafts } = v.drafts
    return { ...v, drafts }
  })
  await dispatch($, mode, d, recorded.asked, question)
}

/** The question a pending entry stands for, from the thread. */
async function questionOf($: any, p: PendingQuestion): Promise<{ d: Decision; text: string } | undefined> {
  const d = await readOne($, p.decisionId)
  const text = d?.thread.find(e => e.who === 'person' && e.at === p.asked)?.text

  return d && text !== undefined ? { d, text } : undefined
}

export const RESENT_NOTICE = 'Sent to the fork. The main-session copy is still queued and will land here too.'

/** `f`: the oldest queued, failed or orphaned question goes to the fork instead. */
export async function resendToFork($: any): Promise<void> {
  const { pending } = await readState($)
  const target = pending.find(p => p.status === 'queued' || p.status === 'failed' || p.run !== RUN)
  const found = target ? await questionOf($, target) : undefined
  if (!target || !found) {
    return
  }
  if (target.mode === 'main') {
    markLate(target.asked)
  }
  await setPending($, list => without(list, target.asked, target.mode))
  await setState($, v => ({ ...v, notice: target.mode === 'main' && target.status === 'queued' ? RESENT_NOTICE : undefined }))
  await dispatch($, 'fork', found.d, target.asked, found.text)
}

/** `m`: the newest question that a fork or the quick model answered is asked again, to the main session. */
export async function askMain($: any): Promise<void> {
  const { decisionId } = await readState($)
  const d = decisionId ? await readOne($, decisionId) : undefined
  if (!d) {
    return
  }
  const at = d.thread.map(e => e.who).findLastIndex(who => who === 'fork' || who === 'quick')
  const question = at === -1 ? undefined : d.thread.slice(0, at).findLast(e => e.who === 'person')
  if (!question) {
    return
  }
  await dispatch($, 'main', d, question.at, question.text)
}

/** The `turn.start` hook's work: a reply turn that begins is "answering". */
export async function onTurnStart($: any, e: any, next: (e: any) => Promise<any>): Promise<any> {
  const waiter = routeStart(e)
  if (waiter && !waiter.late) {
    await setPending($, list => list.map(p => (p.asked === waiter.asked && p.mode === 'main' ? { ...p, status: 'answering' } : p)))
    await redraw($)
  }

  return next(e)
}

/** The `turn.complete` hook's work: the claimed turn's answer goes into the thread under its question. */
export async function onTurnComplete($: any, e: any, next: (e: any) => Promise<any>): Promise<any> {
  const done = await next(e)
  const routed = routeComplete(e)
  if (routed) {
    await recordReply($, routed.waiter.decisionId, routed.waiter.asked, 'claude', routed.text)
    if (!routed.waiter.late) {
      await setPending($, list => without(list, routed.waiter.asked, 'main'))
    }
    await redraw($)
  }

  return done
}
