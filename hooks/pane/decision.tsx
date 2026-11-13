import { draftLines } from './style'
import { atom, read, update } from 'claude-code'

import type { PaneView } from '../../types'
import { reopenDependents, reopenNotice } from '../dependents'
import { focusKeyName } from '../focus-key'
import { readAll, readOne, write } from '../store'
import { openLastOne } from './list'
import { askMainInstead, askQuestion, canAskMainInstead, currentReplies } from '../discuss'
import { readSession, sessionSummary } from '../session'
import type { Answer, Decision, Kind, Option, StoreCtx, ThreadEntry } from '../store'
import { HEADER_RIGHT_GAP, KeyHints, Rule, hintLineCount, isCompact, keysState, wrapLines } from './look'
import type { Hint } from './look'
import { ago, markSeen, noteVisit, readSeen, unreadReplies, when } from './seen'
import { Bar, ChatEntry, Inline, InlineLines, SELECTED_BG, barColour, chatRows, colourProps, kindColour, kindLabel, wrapInline } from './style'

export const PANE_ID = 'decisions'
export const GAP_MS = 1000

export const INITIAL_VIEW: PaneView = {
  screen: 'list',
  ticked: [],
  isParking: false,
  parkDraft: '',
  isHidden: false,
  isAsking: false,
  isMarking: false,
  drafts: {},
  pending: [],
  threadSkip: 0,
  sectionPage: 0,
  marks: {},
  compactPage: 0,
  isContextOpen: false,
  answerDrafts: {},
  isDetailHidden: false,
}

// Change the tag when PaneView's fields change: it declines what an earlier version stored.
const viewAtom = atom({ plugin: 'decisions', key: 'view' } as const, INITIAL_VIEW, { shape: 'view-7' })

export type Typed = { digit: string; at: number } | undefined
export type Typing = { typed: Typed; option: number | undefined }

/** The digit keys' memory. It's a plain object because two quick keys run their handlers before the first await settles. */
export const typing: Typing = { typed: undefined, option: undefined }

/**
 * The option a digit highlights. A `1` followed by a digit within the gap reads as
 * `1x` when that option exists; anything else is the digit alone, `0` meaning 10.
 * Undefined when the option doesn't exist.
 */
export function highlightFor(
  digit: string,
  now: number,
  previous: Typed,
  optionCount: number,
  gapMs: number = GAP_MS,
): { option: number | undefined; typed: Typed } {
  const alone = Number(digit === '0' ? '10' : digit)
  const joined = previous !== undefined && previous.digit === '1' && now - previous.at <= gapMs ? Number('1' + digit) : 0

  if (joined >= 10 && joined <= optionCount) {
    return { option: joined, typed: { digit: 'joined', at: now } }
  }

  return { option: alone >= 1 && alone <= optionCount ? alone : undefined, typed: { digit, at: now } }
}

/**
 * Moves the focus ring for one digit. The state is written before the engine is
 * asked, because two quick keys don't wait for the first focus call to answer.
 */
export async function pressDigit(
  $: { ui: { focus: (args: { requestId: string; key: string }) => Promise<unknown> } },
  digit: string,
  now: number,
  optionCount: number,
  state: Typing = typing,
): Promise<number | undefined> {
  const result = highlightFor(digit, now, state.typed, optionCount)
  state.typed = result.typed
  state.option = result.option
  if (result.option === undefined) {
    return undefined
  }
  await $.ui.focus({ requestId: PANE_ID, key: `opt:${result.option}` })

  return result.option
}

/** `a`: highlights the recommended option. Nothing happens without one. */
export async function highlightRecommendation(
  $: { ui: { focus: (args: { requestId: string; key: string }) => Promise<unknown> } },
  d: Decision,
  state: Typing = typing,
): Promise<number | undefined> {
  const option = d.recommendation?.option
  if (option === undefined || !d.options.some(o => o.id === option)) {
    return undefined
  }
  state.option = option
  await $.ui.focus({ requestId: PANE_ID, key: `opt:${option}` })

  return option
}

/** `b`: back to the list, whatever is highlighted (there is no Discuss row to clear back to, decision 219). */
export async function back(
  _$: { ui: { focus: (args: { requestId: string; key: string }) => Promise<unknown> } },
  view: PaneView,
  state: Typing = typing,
): Promise<PaneView> {
  state.typed = undefined
  state.option = undefined

  return { ...view, screen: 'list', decisionId: undefined, highlight: undefined, answerBox: undefined, isParking: false, notice: undefined }
}

/**
 * Takes a sent decision back to ready, keeping its answer, so it can be changed or sent again:
 * for a send whose prompt was cancelled, or a change of mind (row 292). Undefined unless it was sent.
 */
export async function unsend(store: StoreCtx, d: Decision): Promise<Decision | undefined> {
  const current = (await readOne(store, d.id)) ?? d
  if (current.state !== 'sent') {
    return undefined
  }
  const { sentAt: _sentAt, ...rest } = current
  const next: Decision = { ...rest, state: 'ready' }
  await write(store, next)

  return next
}

/** Records the answer and makes the decision ready. Refused (undefined) once it is sent, or for an option that isn't there. */
export async function chooseOption(store: StoreCtx, d: Decision, option: number): Promise<Decision | undefined> {
  if (d.state === 'sent' || !d.options.some(o => o.id === option)) {
    return undefined
  }
  const next: Decision = {
    ...((await readOne(store, d.id)) ?? d),
    state: 'ready',
    answer: { option, answeredAt: new Date().toISOString() },
  }
  await write(store, next)

  return next
}

/**
 * Chooses an option and, when it replaces a different earlier answer, reopens the
 * decisions that depend on this one. Returns the decision and the notice for the list.
 */
export async function chooseAndReopen(store: StoreCtx, d: Decision, option: number): Promise<{ decision: Decision; notice?: string } | undefined> {
  const previous = ((await readOne(store, d.id)) ?? d).answer
  const decision = await chooseOption(store, d, option)
  if (!decision) {
    return undefined
  }
  // A typed answer replaced, or a condition dropped by choosing the plain option, is a change too.
  if (previous === undefined || isSameAnswer(previous, { option })) {
    return { decision }
  }

  return { decision, notice: reopenNotice(d.id, await reopenDependents(store, decision, previous)) }
}

/** The number of the "Something else" row the pane draws after a decision's last option. */
export function somethingElseNumber(d: Decision): number {
  return d.options.reduce((most, o) => Math.max(most, o.id), 0) + 1
}

function isSameAnswer(a: Answer | undefined, b: Omit<Answer, 'answeredAt'>): boolean {
  return a !== undefined && a.option === b.option && a.text === b.text && a.condition === b.condition
}

/**
 * Saves a typed answer or an option with a condition, makes the decision ready and,
 * when it replaces a different earlier answer, reopens the decisions that depend on it.
 */
async function saveAnswer(store: StoreCtx, d: Decision, answer: Omit<Answer, 'answeredAt'>): Promise<{ decision: Decision; notice?: string } | undefined> {
  const current = (await readOne(store, d.id)) ?? d
  if (current.state === 'sent' || d.state === 'sent') {
    return undefined
  }
  const previous = current.answer
  const decision: Decision = { ...current, state: 'ready', answer: { ...answer, answeredAt: new Date().toISOString() } }
  await write(store, decision)
  if (previous === undefined || isSameAnswer(previous, answer)) {
    return { decision }
  }

  return { decision, notice: reopenNotice(d.id, await reopenDependents(store, decision, previous)) }
}

/** "Something else": the person's own words as the answer. Refused when empty or once sent. */
export async function answerWithText(store: StoreCtx, d: Decision, text: string): Promise<{ decision: Decision; notice?: string } | undefined> {
  const trimmed = text.trim()

  return trimmed === '' ? undefined : saveAnswer(store, d, { text: trimmed })
}

/** An option with a condition the person typed (`c`). Refused when empty, for an option that isn't there, or once sent. */
export async function answerWithCondition(
  store: StoreCtx,
  d: Decision,
  option: number,
  condition: string,
): Promise<{ decision: Decision; notice?: string } | undefined> {
  const trimmed = condition.trim()
  if (trimmed === '' || !d.options.some(o => o.id === option)) {
    return undefined
  }

  return saveAnswer(store, d, { option, condition: trimmed })
}

export async function parkDecision(store: StoreCtx, d: Decision, reason: string): Promise<boolean> {
  if (reason.trim() === '') {
    return false
  }
  await write(store, { ...((await readOne(store, d.id)) ?? d), state: 'parked', parkedReason: reason.trim(), parkedAt: new Date().toISOString() })

  return true
}

export async function unparkDecision(store: StoreCtx, d: Decision): Promise<void> {
  const { parkedReason: _gone, parkedAt: _also, ...rest } = (await readOne(store, d.id)) ?? d
  await write(store, { ...rest, state: 'open' })
}

const STATE_TEXT: Record<string, string> = {
  open: 'open',
  live: 'open, in discussion',
  ready: 'answered, ready to send',
  sent: 'answered and sent',
  parked: 'parked',
}

/** The state line: the kind first for every kind but choice ("finding, open"). */
export function stateLine(d: Decision): string {
  const state = STATE_TEXT[d.state] ?? d.state
  const kind = d.isTask ? 'to do' : d.kind === 'choice' ? undefined : d.kind

  return kind ? `${kind}, ${state}` : state
}

function answerText(d: Decision): string {
  const option = d.options.find(o => o.id === d.answer?.option)

  return option ? `${option.id} ${option.label}` : (d.answer?.text ?? 'no answer')
}

/** The line under a reopened decision, only while it is open or live. */
export function reopenedLine(d: Decision): string | undefined {
  if (d.reopenedBy === undefined || (d.state !== 'open' && d.state !== 'live')) {
    return undefined
  }
  const was = d.reopenedBy.was
  const option = d.options.find(o => o.id === was?.option)
  const had = was ? ` You had answered ${option ? `${option.id} ${option.label}` : (was.text ?? 'it')}.` : ''

  return `Reopened because ${d.reopenedBy.id} changed.${had}`
}

/** "⚑ Blocks" and "Depends on:" lines for one decision, given all of them. */
export function dependencyLines(d: Decision, all: Decision[]): string[] {
  const lines = d.blocks ? [`⚑ Blocks ${d.blocks}`] : []
  for (const id of d.dependsOn) {
    const other = all.find(x => x.id === id)
    if (!other) {
      continue
    }
    const status =
      other.state === 'ready' || other.state === 'sent' ? `answered ${answerText(other)}` : other.state === 'parked' ? 'parked' : 'not answered yet'
    lines.push(`Depends on: ${other.id}, ${other.title} (${status})`)
  }

  return lines
}

/** The only places the pane's state is read and written: the scan follows `$` into function declarations, and a state reference only where it's written. */
export function setView($: any, change: (v: PaneView) => PaneView): Promise<unknown> {
  return update($, viewAtom, change)
}

/** Moves the ring to a key and, once the engine says it moved, records it for the `›`. Returns whether it moved. */
export async function focusTo($: any, key: string): Promise<boolean> {
  const moved = await $.ui.focus({ requestId: PANE_ID, key }).catch(() => ({ deny: 'failed' }))
  if (moved?.deny !== undefined) {
    return false
  }
  await setView($, v => ({ ...v, ring: key }))

  return true
}

/** Moves the ring to a key once the next draw has put it on screen. */
export function focusLater($: any, key: string): void {
  $.clock.after(80, () => {
    void focusTo($, key)
  })
}

/** The first column of a row: `›` on the ringed element while the pane has the keys, else a space. */
export function ringMark(key: string, ring: string | undefined, isFocused: boolean): '›' | ' ' {
  return isFocused && ring === key ? '›' : ' '
}

export function readView($: any): Promise<PaneView> {
  return read($, viewAtom)
}

export const SOMETHING_ELSE = 'Something else'
export const SOMETHING_ELSE_LINE = "Type your own answer. It's saved without asking Claude and goes with your next send."
export const BOX_LINE = "enter saves it, Claude isn't asked · empty enter cancels"
export const ASK_EMPTY = 'Ask why an option exists, what it would cost, or for another option. Claude replies here and can change the decision.'
export const ASK_PLACEHOLDER = 'Ask Claude about this decision…'
export const REPLYING = '✻ Claude is replying…'

/** An option as the screen draws it: the stored ones, then Something else, which is never written into `options`. */
export type DrawnOption = Option & { isSomethingElse?: boolean }

export function drawnOptions(d: Decision): DrawnOption[] {
  return [...d.options, { id: somethingElseNumber(d), label: SOMETHING_ELSE, changes: SOMETHING_ELSE_LINE, isSomethingElse: true }]
}

/** The drawn row that holds the answer: the chosen option, or Something else for a typed answer. */
export function chosenNumber(d: Decision): number | undefined {
  if (d.answer?.option !== undefined) {
    return d.answer.option
  }

  return d.answer?.text !== undefined ? somethingElseNumber(d) : undefined
}

/** Where the ring starts on opening (decision 219): the answer, else the recommendation, else 1. */
export function openingOption(d: Decision): number {
  const recommended = d.recommendation?.option

  return chosenNumber(d) ?? (recommended !== undefined && d.options.some(o => o.id === recommended) ? recommended : 1)
}

/**
 * Opens a decision with the ring on the option `enter` would answer (decision 219). The time it was last seen
 * is kept for this visit, so a new reply still reads as new while the person is on it. The tab it was opened
 * from is kept, so answering the last decision there doesn't move the list.
 */
export async function openDecision($: any, d: Decision, tab?: string): Promise<void> {
  noteVisit(d.id, (await readSeen($))[d.id])
  await markSeen($, d.id)
  const option = openingOption(d)
  typing.typed = undefined
  typing.option = undefined
  await setView($, v => ({
    ...v,
    screen: 'decision',
    decisionId: d.id,
    tab: tab ?? v.tab,
    highlight: option,
    ring: `opt:${option}`,
    compactPage: 0,
    isParking: false,
    isContextOpen: false,
    answerBox: undefined,
    notice: undefined,
  }))
  focusLater($, `opt:${option}`)
}

export { kindLabel }

const HIDDEN: Decision['state'][] = ['superseded', 'withdrawn']

/** How many decisions in this one's group are answered (ready or sent), out of those still shown. */
export function progressDots(d: Decision, all: Decision[]): { answered: number; total: number } {
  const pool = all.some(x => x.id === d.id) ? all : [...all, d]
  const group = pool.filter(x => x.group === d.group && !HIDDEN.includes(x.state))

  return { answered: group.filter(x => x.state === 'ready' || x.state === 'sent').length, total: group.length }
}

/** Groups larger than this count their answers without the dots (row 259). */
export const DOTS_UP_TO = 5

/**
 * The dim line under the title: `d41 · Code review · asked 4m ago`, then how many in the group are answered when it
 * has two or more (`●○ 1 of 2 answered`, the dots only up to 5).
 */
export function crumbFor(d: Decision, all: Decision[] = [], now: Date = new Date()): string {
  const { answered, total } = progressDots(d, all)
  const age = ago(d.createdAt, now)
  const dots = total <= DOTS_UP_TO ? `${'●'.repeat(answered)}${'○'.repeat(Math.max(0, total - answered))} ` : ''

  return [d.id, d.group ?? 'Other', age === '' ? '' : `asked ${age}`, total >= 2 ? `${dots}${answered} of ${total} answered` : ''].filter(Boolean).join(' · ')
}

/** `✓` for an answered decision, `◆` for one still waiting (row 252, extra 5). */
function stateMark(d: Decision): string {
  return d.state === 'ready' || d.state === 'sent' ? '✓' : '◆'
}

/** What a decision waits on (its `dependsOn`, with each one's state) and holds up (the decisions that depend on it, and its `blocks`). */
export function relations(d: Decision, all: Decision[]): { waitsOn: { id: string; title: string; state: string }[]; holdsUp: { id: string; title: string; state: string }[]; blocks?: string } {
  const shown = all.filter(x => !HIDDEN.includes(x.state))

  return {
    waitsOn: d.dependsOn.flatMap(id => {
      const other = shown.find(x => x.id === id)
      return other ? [{ id: other.id, title: other.title, state: stateMark(other) }] : []
    }),
    holdsUp: shown.filter(x => x.dependsOn.includes(d.id)).map(x => ({ id: x.id, title: x.title, state: stateMark(x) })),
    ...(d.blocks ? { blocks: d.blocks } : {}),
  }
}

/** The relation lines as drawn, keyed: `waits on d41 Pick a colour ✓`, `holds up d45 Book the weekend ◆`, `holds up merging the branch`. */
export function relationLines(d: Decision, all: Decision[]): { key: string; lead: string; text: string; mark?: string }[] {
  const r = relations(d, all)

  return [
    ...r.waitsOn.map(w => ({ key: `waits:${w.id}`, lead: 'waits on', text: `${w.id} ${w.title}`, mark: w.state })),
    ...r.holdsUp.map(h => ({ key: `holds:${h.id}`, lead: 'holds up', text: `${h.id} ${h.title}`, mark: h.state })),
    ...(r.blocks ? [{ key: 'holds:blocks', lead: 'holds up', text: r.blocks }] : []),
  ]
}

const NEW_FOR_MS = 2 * 60_000

/** An option Claude added from a discussion, while the change is under two minutes old. */
export function isNewFromDiscussion(d: Decision, o: Option, now: number = Date.now()): boolean {
  if (o.fromDiscussion !== true) {
    return false
  }
  const last = d.thread.findLast(e => e.revision !== undefined)

  return last !== undefined && now - new Date(last.at).getTime() < NEW_FOR_MS
}

/** The lines `m` shows beyond the scenario: reopened and the parked reason. What it waits on and holds up sits under the header now (extra 5), and sources are links. */
export function contextExtras(d: Decision, _all: Decision[] = []): string[] {
  const reopened = reopenedLine(d)

  return [...(reopened ? [reopened] : []), ...(d.state === 'parked' && d.parkedReason ? [`Parked: ${d.parkedReason}`] : [])]
}

/** A source's link: a URL as it is; a file path as a `file://` link to the file, without its `:line`, against the working folder. */
export function sourceHref(path: string, cwd: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) {
    return path
  }
  const file = path.replace(/:\d+(?::\d+)?$/, '')
  const absolute = file.startsWith('/') ? file : `${cwd.replace(/\/+$/, '')}/${file.replace(/^\.\//, '')}`

  return `file://${absolute}`
}

/** The digit that presses an option's own row: 1 to 9, 0 for 10, none past 10. */
export function digitOf(option: number): string | undefined {
  return option >= 1 && option <= 9 ? String(option) : option === 10 ? '0' : undefined
}

const REPLIERS = new Set<ThreadEntry['who']>(['claude', 'fork', 'quick'])

/** What the conversation block under the options says (decisions 216, 220, 262). */
export type Conversation = {
  heading: string
  messages: number
  unread: number
  /** The newest unread reply, else the newest reply: always drawn whole (row 262). */
  reply?: ThreadEntry
  /** The person's newest question when nothing has answered it yet: drawn after the reply, so a question never looks lost. */
  asked?: ThreadEntry
  earlier?: string
  empty?: string[]
}

/** The conversation under the options: the counts, the newest unread reply or else the newest reply, and how many other messages the thread screen holds. */
export function conversationLines(d: Decision, seenAt: string | undefined, width: number): Conversation {
  const messages = d.thread.filter(e => e.revision === undefined && e.who !== 'receipt')
  const unread = unreadReplies(d, seenAt)
  const shown = unread.at(-1) ?? messages.findLast(e => REPLIERS.has(e.who))
  const heading = [
    'Talk it through with Claude',
    ...(messages.length > 0 ? [`${messages.length} ${messages.length === 1 ? 'message' : 'messages'}`] : []),
    ...(unread.length > 0 ? [`● ${unread.length} new`] : []),
  ].join(' · ')
  if (messages.length === 0) {
    return { heading, messages: 0, unread: 0, empty: wrapLines(ASK_EMPTY, width) }
  }
  const newest = messages.at(-1)
  const asked = newest?.who === 'person' && newest !== shown ? newest : undefined
  const rest = messages.length - (shown ? 1 : 0) - (asked ? 1 : 0)
  const earlier = rest > 0 ? `${rest} ${shown || asked ? 'earlier ' : ''}${rest === 1 ? 'message' : 'messages'}` : undefined

  return { heading, messages: messages.length, unread: unread.length, reply: shown, asked, earlier }
}

/** The newest reply, when it is a quick answer from triage that can still go to the main session: the `r` key's target. */
export function mainInsteadReply(d: Decision, pending: PaneView['pending']): string | undefined {
  const newest = d.thread.findLast(e => REPLIERS.has(e.who) && e.revision === undefined)

  return newest?.who === 'quick' && newest.via === 'triage' && canAskMainInstead(d, newest.at, pending) ? newest.at : undefined
}

/** Rows the conversation block takes, rule included: heading, the reply, earlier line, replying line, the bordered ask box. */
function conversationRows(c: Conversation, isReplying: boolean, width: number, draft = ''): number {
  // The heading and the rule, then the bordered ask box: its border and its lines (row 294).
  return 2 + (c.reply ? chatRows(c.reply, width) : 0) + (c.asked ? chatRows(c.asked, width) : 0) + (c.earlier ? 1 : 0) + (c.empty?.length ?? 0) + (isReplying ? 1 : 0) + 3 + draftLines(draft, width - 4 - INPUT_SUBMIT_COLUMNS).length
}

/** Columns the engine draws beside a focused Input for its `⏎ submit`. */
const INPUT_SUBMIT_COLUMNS = 10

type HintCtx = {
  d: Decision
  view: PaneView
  isFocused: boolean
  readyCount: number
  isPaged: boolean
  /** Options with a digit that are not on the page drawn. */
  offPage: number[]
  hasMore: boolean
  compact?: boolean
  /** Tall: `m` has something to hide or show. */
  canToggleDetail?: boolean
  /** Something else is on another page, so the key line names it. */
  isElseOffPage?: boolean
  /** The newest reply is a quick answer that can go to the main session, so `r` is offered. */
  canAskMain?: boolean
}

type Handlers = {
  recommend: () => void
  condition: () => void
  talk: () => void
  moreOptions: () => void
  thread: () => void
  askMain: () => void
  digit: (option: number) => void
  more: () => void
  back: () => void
  park: () => void
  send: () => void
  hide: () => void
  unsend: () => void
}

const NO_HANDLERS: Handlers = {
  recommend: () => {},
  condition: () => {},
  talk: () => {},
  moreOptions: () => {},
  thread: () => {},
  askMain: () => {},
  digit: () => {},
  more: () => {},
  back: () => {},
  park: () => {},
  send: () => {},
  hide: () => {},
  unsend: () => {},
}

/** The decision screen's key hints. */
export function decisionHints(c: HintCtx, on: Handlers = NO_HANDLERS): Hint[] {
  const { d, view } = c
  if (view.ring === 'ask-inline') {
    // Any other key types into the box (row 261), so the line names what works there. The other keys stay drawn, dim and
    // without hotkeys (row 285): the engine lands the ring by its place among the focusable elements, and taking them away
    // above the box moved that place past it, so typing went to the main prompt.
    const inert = decisionHints({ ...c, view: { ...view, ring: undefined } }, on)
      .filter(hint => hint.onPress !== undefined)
      .map(hint => ({ ...hint, hotkey: undefined, label: '', isInert: true }))

    return [
      { id: 'enter-send', keyText: 'enter', label: 'send to Claude', keepLabel: true },
      { id: 'up', keyText: '↑', label: 'back to the options', keepLabel: true },
      ...inert,
    ]
  }
  const isSent = d.state === 'sent'
  const highlight = view.highlight
  const isSomethingElse = highlight === somethingElseNumber(d)
  const isOption = highlight !== undefined && d.options.some(o => o.id === highlight)
  const hints: Hint[] = []
  if (highlight !== undefined && !isSent && (isOption || isSomethingElse)) {
    hints.push({ id: 'enter-choose', keyText: 'enter', label: isSomethingElse ? 'type an answer' : `choose ${highlight}`, keepLabel: true })
  }
  if (!isSent && d.recommendation !== undefined) {
    hints.push({ id: 'a', keyText: 'a', label: 'recommended', hotkey: 'a', onPress: on.recommend })
  }
  if (!isSent && isOption) {
    hints.push({ id: 'c', keyText: 'c', label: 'condition', hotkey: 'c', onPress: on.condition, keepLabel: true })
  }
  if (isSent) {
    // Taking it back keeps the answer: change it, or send it again (row 292).
    hints.push({ id: 'u', keyText: 'u', label: 'unsend', hotkey: 'u', onPress: on.unsend, keepLabel: true })
  }
  hints.push({ id: 't', keyText: 't', label: 'talk', hotkey: 't', onPress: on.talk })
  hints.push({ id: 'o', keyText: 'o', label: 'thread', hotkey: 'o', onPress: on.thread })
  if (c.canAskMain) {
    hints.push({ id: 'r', keyText: 'r', label: 'ask the main session', hotkey: 'r', onPress: on.askMain, keepLabel: true })
  }
  if (c.isPaged) {
    // Every option is drawn and the pane scrolls (row 262): ↑ and ↓ reach the ones out of view.
    hints.push({ id: 'more-options', keyText: '↑↓', label: 'more options' })
  }
  if (!isSent) {
    for (const option of c.offPage) {
      const digit = digitOf(option)!
      const label = option === somethingElseNumber(d) ? 'something else' : ''
      hints.push({ id: `digit:${digit}`, keyText: digit, label, hotkey: digit, onPress: () => on.digit(option), keepLabel: label !== '' })
    }
    // Something else past 10 has no key of its own: the line names the number to type.
    const somethingElse = somethingElseNumber(d)
    if (c.isElseOffPage === true && digitOf(somethingElse) === undefined) {
      hints.push({ id: 'else', keyText: String(somethingElse), label: 'something else', keepLabel: true })
    }
  }
  if (c.compact === false) {
    if (c.canToggleDetail) {
      hints.push({ id: 'm', keyText: 'm', label: view.isDetailHidden ? 'show detail' : 'hide detail', hotkey: 'm', onPress: on.more })
    }
  } else if (c.hasMore || view.isContextOpen) {
    hints.push({ id: 'm', keyText: 'm', label: view.isContextOpen ? 'less' : 'more', hotkey: 'm', onPress: on.more })
  }
  hints.push({ id: 'b', keyText: 'b', label: 'back', hotkey: 'b', onPress: on.back })
  if (!isSent) {
    hints.push({ id: 'p', keyText: 'p', label: d.state === 'parked' ? 'unpark' : 'park', hotkey: 'p', onPress: on.park })
  }
  if (c.readyCount > 0 && !isSent) {
    hints.push({ id: 's', keyText: 's', label: d.state === 'ready' ? 'send this' : `send ${c.readyCount}`, hotkey: 's', onPress: on.send })
  }
  if (!isSent) {
    hints.push({ id: 'h', keyText: 'h', label: 'hide', hotkey: 'h', onPress: on.hide })
  }

  return hints
}

/** One paragraph under an option: its changes dim, why and why not, the recommendation's reason in `success`. Drawn through the inline renderer. */
export type DetailPart = { text: string; color?: string; dim?: boolean; key: string }

/** Everything under an option, in full (decisions 217, 262): its changes and, on the recommended one, why. */
export function detailParts(d: Decision, option: number): DetailPart[] {
  const o = drawnOptions(d).find(x => x.id === option)
  const why = d.recommendation?.option === option && !o?.isSomethingElse ? `Why: ${d.recommendation.reason}` : undefined

  return [
    ...(o?.changes ? [{ text: o.changes, key: 'changes' }] : []),
    ...(o?.why ? [{ text: `+ ${o.why}`, color: 'success', dim: true, key: 'for' }] : []),
    ...(o?.whyNot ? [{ text: `− ${o.whyNot}`, color: 'warning', dim: true, key: 'against' }] : []),
    ...(why ? [{ text: why, color: 'success', key: 'why' }] : []),
  ]
}

/** An option's detail as the lines drawn at `width`, markers gone. */
export function detailLines(d: Decision, option: number, width: number): { text: string; color?: string }[] {
  return detailParts(d, option).flatMap(part => wrapInline(part.text, width).map(line => ({ text: line.map(x => x.text).join(''), color: part.color })))
}

/** The line under a chosen option: the condition, or the typed answer. */
export function answerNote(d: Decision): string | undefined {
  if (d.answer?.condition !== undefined && d.answer.option !== undefined) {
    return `⤷ only if ${d.answer.condition}`
  }

  return d.answer?.text !== undefined && d.answer.option === undefined ? `⤷ ${d.answer.text}` : undefined
}

/** Under a sent decision's answer: when it went and, once the turn that carried it ended, the first line of Claude's reply (row 252, extra 4). */
export function receiptLines(d: Decision): string[] {
  if (d.state !== 'sent') {
    return []
  }
  const receipt = d.thread.findLast(e => e.who === 'receipt')?.text

  return [`↗ sent${d.sentAt ? ` ${when(d.sentAt)}` : ''}`, ...(receipt !== undefined ? [`claude: ${receipt}`] : [])]
}

/** Columns before an option's number: the bar, the ring's mark and a space. */
const OPTION_LEAD = 3
/** Columns before an option's detail: the bar, then five spaces, under the option's label. */
const DETAIL_INDENT = 6

/**
 * How the decision screen is laid out (row 262): nothing is cut. Every option is drawn and the pane scrolls when the
 * screen is taller than it; the key line sits under the header so it is in view when the screen opens.
 */
export type DecisionLayout = {
  compact: boolean
  rules: boolean
  /** The scenario, whole. */
  scenario: string
  /** Reopened and parked lines; compact, only with `m`. */
  extras: string[]
  /** Sources are drawn (tall with the detail shown; compact with `m`). */
  showSources: boolean
  hasMore: boolean
  /** Every option's detail is drawn (tall, unless `m` hid it). */
  isFull: boolean
  canToggleDetail: boolean
  /** A blank line between options (row 259). */
  hasGaps: boolean
  page: number
  pageSize: number
  pages: number
  shown: DrawnOption[]
  offPage: number[]
  hints: Hint[]
  hintLines: number
  keysOff: string[]
  conversation?: Conversation
  /** Some option rows are out of the pane's window, so ↑↓ is offered. */
  hasOptionsOutOfView: boolean
}

const KEYS_OFF_TALL = (key: string) => `Press the pane focus key (${key} unless you moved it) to use it with a draft kept, or run /decisions with an empty prompt.`

/** The old keys-off sentence; the header now says `<key> to use` instead (row 251). Kept for the compact one-liner's callers. */
export function keysOffLines(width: number, compact: boolean): string[] {
  const key = focusKeyName()

  return compact ? [truncateLine(`${key} to use the pane, your draft stays`, width)] : wrapLines(KEYS_OFF_TALL(key), width)
}

/**
 * Hint lines the decision screen allows before dropping labels: three on a tall pane, which has the rows and
 * gained `c`, `t` and `o`; two on a compact one, as every other screen.
 */
export function hintLinesMax(compact: boolean): number {
  return compact ? 2 : 3
}

/** A question for this decision is out and its reply hasn't landed. */
export function isReplying(view: PaneView, d: Decision): boolean {
  return view.pending.some(p => p.decisionId === d.id && (p.status === 'waiting' || p.status === 'answering'))
}

/** Lines the header takes: the title wrapped whole on a tall pane (row 258), one line compact, then the crumb. */
export function headerLines(d: Decision, width: number, compact: boolean): string[] {
  const label = ` ${kindLabel(d.kind)} `
  const room = Math.max(8, width - 2 - label.length - 1)

  return compact ? [truncateLine(d.title, room)] : wrapLines(d.title, room)
}

/** The problem line under the title, wrapped whole, `◇ ` first when the small model wrote it; none on a compact pane. */
export function problemLines(d: Decision, width: number, compact: boolean): string[] {
  if (compact || d.problem === undefined || d.problem === '') {
    return []
  }
  const room = Math.max(8, width - 2 - ` ${kindLabel(d.kind)} `.length - 1)

  return wrapLines(`${d.problemBy === 'model' ? '◇ ' : ''}${d.problem}`, room)
}

/** Lines the crumb takes: one, or wrapped whole on a tall pane with the keys state after. */
function crumbRows(d: Decision, all: Decision[], width: number, compact: boolean): number {
  const room = width - HEADER_RIGHT_GAP - 2 - 10
  const full = crumbFor(d, all)

  return compact || full.length <= room ? 1 : wrapLines(full, width - 2).length + 1
}

function truncateLine(text: string, width: number): string {
  return text.length <= width ? text : text.slice(0, Math.max(0, width - 1)) + '…'
}

/** Rows one option takes as drawn. */
function optionRows(d: Decision, o: DrawnOption, width: number, withDetail: boolean): number {
  const label = wrapLines(o.label, Math.max(8, width - OPTION_LEAD - `${o.id}: `.length)).length
  const detail = withDetail ? detailParts(d, o.id).reduce((n, part) => n + wrapInline(part.text, width - DETAIL_INDENT).length, 0) : 0

  return label + detail + (chosenNumber(d) === o.id ? (answerNote(d) !== undefined ? 1 : 0) + receiptLines(d).length : 0)
}

export function decisionLayout(
  d: Decision,
  view: PaneView,
  width: number,
  rows: number,
  isFocused: boolean,
  readyCount: number,
  all: Decision[] = [],
  seenAt?: string,
  scrollOffset = 0,
): DecisionLayout {
  const compact = isCompact(rows)
  const drawn = drawnOptions(d)
  const extrasAll = contextExtras(d, all)
  const hasMore = compact && (view.isContextOpen || extrasAll.length > 0 || d.sources.length > 0)
  const isFull = !compact && !view.isDetailHidden
  const conversation = compact ? undefined : conversationLines(d, seenAt, width)
  const extras = compact && !view.isContextOpen ? [] : extrasAll
  const showSources = d.sources.length > 0 && (compact ? view.isContextOpen : isFull)
  const withDetail = (o: DrawnOption) => isFull || view.highlight === o.id
  const hintsFor = (outOfView: boolean) =>
    decisionHints({
      d,
      view,
      isFocused,
      readyCount,
      isPaged: outOfView,
      offPage: [],
      hasMore,
      compact,
      canToggleDetail: !compact,
      isElseOffPage: false,
      canAskMain: mainInsteadReply(d, view.pending) !== undefined,
    })

  // Rows above the options, then the options, for telling whether some are out of the window.
  const before = (hintLines: number) =>
    headerLines(d, width, compact).length +
    problemLines(d, width, compact).length +
    crumbRows(d, all, width, compact) +
    (compact ? 0 : relationLines(d, all).length) +
    hintLines +
    (compact ? 0 : 1) +
    wrapInline(d.scenario, width).length +
    extras.reduce((n, line) => n + wrapLines(line, width).length, 0) +
    (showSources ? d.sources.length : 0) +
    (compact ? 0 : 1)
  const optionLines = drawn.reduce((n, o) => n + optionRows(d, o, width, withDetail(o)), 0)
  const plainHints = hintsFor(false)
  const plainLines = hintLineCount(plainHints, width, hintLinesMax(compact))
  const start = before(plainLines)
  const end = start + optionLines + (isFull ? drawn.length - 1 : 0)
  const hasOptionsOutOfView = start < scrollOffset || end > scrollOffset + rows
  const hints = hasOptionsOutOfView ? hintsFor(true) : plainHints
  // Blank lines between options only while the whole screen fits; past that they only add scrolling.
  const total = end + (conversation ? conversationRows(conversation, isReplying(view, d), width, view.drafts[d.id] ?? '') : 0)
  const hasGaps = isFull && total <= rows

  return {
    compact,
    rules: !compact,
    scenario: d.scenario,
    extras,
    showSources,
    hasMore,
    isFull,
    canToggleDetail: !compact,
    hasGaps,
    page: 0,
    pageSize: Math.max(1, drawn.length),
    pages: 1,
    shown: drawn,
    offPage: [],
    hints,
    hintLines: hintLineCount(hints, width, hintLinesMax(compact)),
    keysOff: [],
    conversation,
    hasOptionsOutOfView,
  }
}

/** The page drawn: the highlighted option's, else the one `o` last moved to, kept inside the pages there are. */
export function pageFor(view: PaneView, pageSize: number, count: number): number {
  const pages = Math.max(1, Math.ceil(count / Math.max(1, pageSize)))
  if (view.highlight !== undefined && view.highlight >= 1 && view.highlight <= count) {
    return Math.floor((view.highlight - 1) / Math.max(1, pageSize))
  }

  return Math.min(Math.max(0, view.compactPage), pages - 1)
}

/** A `1` pressed on option 1 while the ring was already there, waiting to see whether a second digit makes it 10 to 19. */
let heldOne: Typed

/** Any other key, a ring move or leaving the screen: a held `1` must not answer option 1 a moment later. */
export function cancelHeldDigit(): void {
  if (heldOne !== undefined && typing.typed === heldOne) {
    typing.typed = undefined
    typing.option = undefined
  }
  heldOne = undefined
}

/**
 * A digit key or a press on an option. With the ring already on that option it is
 * confirmed (that is also how `enter` arrives); otherwise the digit is read through
 * `highlightFor`, so `1` then `2` is 12, and the option is highlighted.
 *
 * The ring now starts on an option (decision 219), often 1. With ten or more drawn,
 * a `1` there is held for the digit gap before it answers, so `1` then `3` still reaches 13.
 */
export async function pressOption($: any, d: Decision, option: number, choose: (option: number) => Promise<void>, pageSize: number): Promise<void> {
  const view = await readView($)
  const count = drawnOptions(d).length
  const now = Date.now()
  if (view.ring === `opt:${option}`) {
    if (option !== 1 || count < 10) {
      await choose(option)

      return
    }
    if (heldOne !== undefined && now - heldOne.at <= GAP_MS && count >= 11) {
      heldOne = undefined
      typing.typed = { digit: 'joined', at: now }
      typing.option = 11
      await highlightOption($, 11, pageSize, view)

      return
    }
    const held: Typed = { digit: '1', at: now }
    heldOne = held
    typing.typed = held
    typing.option = 1
    try {
      $.clock.after(GAP_MS, () => {
        if (typing.typed === held) {
          heldOne = undefined
          void choose(1)
        }
      })
    } catch {
      // No clock: the `1` stays a highlight, and `enter` again answers it.
    }

    return
  }
  const digit = digitOf(option)
  const result = digit === undefined ? { option, typed: undefined } : highlightFor(digit, now, typing.typed, count)
  typing.typed = result.typed
  typing.option = result.option
  heldOne = undefined
  if (result.option !== undefined) {
    await highlightOption($, result.option, pageSize, view)
  }
}

/** Highlights an option: its page first, then the ring, at once when the page is already drawn. */
export async function highlightOption($: any, option: number, pageSize: number, view: PaneView): Promise<void> {
  const size = Math.max(1, pageSize)
  const page = Math.floor((option - 1) / size)
  const isDrawn = pageFor(view, size, Number.MAX_SAFE_INTEGER) === page
  await setView($, v => ({ ...v, highlight: option, compactPage: page }))
  if (isDrawn) {
    await focusTo($, `opt:${option}`)
  } else {
    focusLater($, `opt:${option}`)
  }
}

type Props = {
  ui: { Box: any; Text: any; Button: any; Input: any; Link?: any }
  d: Decision
  view: PaneView
  width: number
  /** The pane's rows (`scroll.bodyRows`): the options are paged so the hints stay in view. */
  rows?: number
  readyCount: number
  /** Every decision, so the screen can say what this one depends on and how its group is going. */
  all?: Decision[]
  /** When the person had last seen this decision before this visit, for what's new in the conversation. */
  seenAt?: string
  /** Called after anything that changes a decision, so the status line and pane refresh. */
  onChanged: () => void
  /** Called when the pane has gone back to the list, so the ring can be put on its first row. */
  onLeave: () => void
  onSend: () => void
  /** `s` on an answered decision: the preview for this one alone (221). */
  onSendThis?: () => void
  onHide: () => void
  /** The pane has the keys, so the ring (and its `›`) is shown. */
  isFocused?: boolean
  /** The working folder, for a source's `file://` link. */
  cwd?: string
  /** The first row of the screen the pane's window shows (`scroll.offset`), for the ↑↓ hint. */
  scrollOffset?: number
}

/** What a saved typed answer or condition reads as in the notice. */
function savedText(d: Decision, box: { kind: 'text' | 'condition'; option: number }, text: string): string {
  if (box.kind === 'text') {
    return `${SOMETHING_ELSE}: ${text}`
  }
  const o = d.options.find(x => x.id === box.option)

  return `${box.option} ${o?.label ?? ''}, if ${text}`
}

/** One decision: header, what it waits on, the key hints, context, every option, the conversation (rows 251, 262). Returns an element tree. */
export function DecisionView($: any, props: Props): any {
  const { ui, d, view, width, readyCount, onChanged, onLeave, onSend, onHide } = props
  const { Box, Text, Button, Input } = ui
  const isFocused = props.isFocused === true
  const isSent = d.state === 'sent'
  const chosen = chosenNumber(d)
  const somethingElse = somethingElseNumber(d)
  const all = props.all ?? []
  const layout = decisionLayout(d, view, width, props.rows ?? 30, isFocused, readyCount, all, props.seenAt, props.scrollOffset ?? 0)
  const { compact } = layout
  const now = Date.now()
  const colour = barColour(d)
  const box = isSent ? undefined : view.answerBox

  const toList = async (notice: string | undefined): Promise<unknown> => {
    await leaving()
    const { decisions } = await readAll($)
    const isLast = !decisions.some(x => (x.state === 'open' || x.state === 'live') && x.section === 'needs-you')
    const readyIds = decisions.filter(x => x.state === 'ready').map(x => x.id)
    if (isLast && readyIds.length > 0) {
      // That was the last one (row 270): straight to sending, the ring on send.
      await setView($, v => {
        const { [d.id]: _gone, ...answerDrafts } = v.answerDrafts
        return { ...openLastOne(v, readyIds), answerDrafts, isContextOpen: false, compactPage: 0, notice }
      })
      focusLater($, 'confirm')

      return undefined
    }

    return setView($, v => {
      const { [d.id]: _gone, ...answerDrafts } = v.answerDrafts
      return { ...v, screen: 'list', decisionId: undefined, highlight: undefined, ring: undefined, compactPage: 0, isContextOpen: false, answerBox: undefined, answerDrafts, notice }
    })
  }
  const openBox = async (kind: 'text' | 'condition', option: number) => {
    if (isSent) {
      return
    }
    await setView($, v => ({ ...v, answerBox: { kind, option }, highlight: option }))
    focusLater($, 'answer')
  }
  const choose = async (option: number) => {
    if (isSent) {
      return
    }
    if (option === somethingElse) {
      await openBox('text', option)

      return
    }
    const done = await chooseAndReopen($, d, option)
    if (done) {
      typing.typed = undefined
      typing.option = undefined
      await toList(done.notice)
      onChanged()
      onLeave()
    }
  }
  const saveBox = async (text: string) => {
    const open = (await readView($)).answerBox
    if (open === undefined) {
      return
    }
    const trimmed = text.trim()
    const done =
      trimmed === '' ? undefined : open.kind === 'text' ? await answerWithText($, d, trimmed) : await answerWithCondition($, d, open.option, trimmed)
    if (!done) {
      await setView($, v => {
        const { [d.id]: _gone, ...answerDrafts } = v.answerDrafts
        return { ...v, answerBox: undefined, answerDrafts }
      })
      focusLater($, `opt:${open.option}`)

      return
    }
    typing.typed = undefined
    typing.option = undefined
    const saved = `Saved ${d.id} · ${savedText(d, open, trimmed)} · s sends it`
    await toList(done.notice ? `${saved} · ${done.notice}` : saved)
    onChanged()
    onLeave()
  }
  const openThread = async () => {
    await leaving()
    await setView($, v => ({
      ...v,
      screen: 'thread',
      isAsking: (v.drafts[d.id] ?? '') !== '',
      isMarking: false,
      revisionIndex: undefined,
      threadSkip: 0,
      answerBox: undefined,
      notice: undefined,
    }))
    focusLater($, (view.drafts[d.id] ?? '') !== '' ? 'ask-input' : 'ask')
  }
  /** Leaving this decision: what was on screen counts as read, and a held `1` is dropped. */
  const leaving = async () => {
    cancelHeldDigit()
    await markSeen($, d.id)
  }
  const handlers: Handlers = {
    unsend: async () => {
      if (await unsend($, d)) {
        props.onChanged()
      }
    },
    recommend: async () => {
      const option = d.recommendation?.option
      if (option !== undefined && d.options.some(o => o.id === option)) {
        typing.option = option
        await highlightOption($, option, layout.pageSize, await readView($))
      }
    },
    condition: async () => {
      const option = (await readView($)).highlight
      if (option !== undefined && d.options.some(o => o.id === option)) {
        await openBox('condition', option)
      }
    },
    talk: async () => {
      if (compact) {
        await openThread()

        return
      }
      // Asked again once the box is drawn with the ring in it, in case the first call landed before that draw.
      if (await focusTo($, 'ask-inline')) {
        focusLater($, 'ask-inline')
      }
    },
    moreOptions: async () => {
      typing.typed = undefined
      const next = (layout.page + 1) % layout.pages
      const first = drawnOptions(d)[next * layout.pageSize]?.id ?? 1
      await setView($, v => ({ ...v, highlight: first, compactPage: next }))
      focusLater($, `opt:${first}`)
    },
    thread: () => void openThread(),
    askMain: async () => {
      const replyAt = mainInsteadReply(d, (await readView($)).pending)
      if (replyAt !== undefined) {
        await askMainInstead($, d.id, replyAt)
        onChanged()
      }
    },
    digit: async (option: number) => {
      const digit = digitOf(option)!
      const result = highlightFor(digit, Date.now(), typing.typed, drawnOptions(d).length)
      typing.typed = result.typed
      typing.option = result.option
      if (result.option !== undefined) {
        await highlightOption($, result.option, layout.pageSize, await readView($))
      }
    },
    more: () => void setView($, v => (compact ? { ...v, isContextOpen: !v.isContextOpen } : { ...v, isDetailHidden: !v.isDetailHidden })),
    back: async () => {
      await leaving()
      await onBack($, onLeave)
    },
    park: async () => {
      if (d.state === 'parked') {
        await unparkDecision($, d)
        onChanged()
      } else {
        await setView($, v => ({ ...v, isParking: true }))
        focusLater($, 'park')
      }
    },
    send: async () => {
      await leaving()
      ;(d.state === 'ready' && props.onSendThis ? props.onSendThis : onSend)()
    },
    hide: async () => {
      await leaving()
      onHide()
    },
  }
  // Every key but a digit drops a held `1`; a digit may be the second half of 10 to 19.
  for (const name of Object.keys(handlers) as (keyof Handlers)[]) {
    if (name !== 'digit') {
      const run = handlers[name] as () => void
      ;(handlers as Record<string, unknown>)[name] = () => {
        cancelHeldDigit()
        run()
      }
    }
  }
  const hints = decisionHints(
    {
      d,
      view,
      isFocused,
      readyCount,
      isPaged: layout.hasOptionsOutOfView,
      offPage: [],
      hasMore: layout.hasMore,
      compact,
      canToggleDetail: layout.canToggleDetail,
      isElseOffPage: false,
      canAskMain: mainInsteadReply(d, view.pending) !== undefined,
    },
    handlers,
  )
  const note = answerNote(d)
  const barred = (key: string, lineColour: string | undefined, children: any) => (
    <Box key={key}>
      {Bar(ui, lineColour)}
      {children}
    </Box>
  )
  // Lines under one bar: the bars in a column of their own, so each line's text stays whole beside them.
  const barredBlock = (key: string, lineColour: string | undefined, indent: number, lines: any[]) =>
    lines.length === 0 ? null : (
      <Box key={key}>
        <Box flexDirection="column">{lines.map((_, index) => Bar(ui, lineColour, `${key}:bar:${index}`))}</Box>
        <Box flexDirection="column" paddingLeft={indent}>
          {lines}
        </Box>
      </Box>
    )

  const optionRow = (o: DrawnOption) => {
    const isHighlighted = view.highlight === o.id
    const isChosen = chosen === o.id
    const isRecommended = d.recommendation?.option === o.id && o.isSomethingElse !== true
    const isNew = isNewFromDiscussion(d, o, now)
    const digit = digitOf(o.id)
    const tag = isRecommended ? '  ★ recommended' : ''
    const fresh = isNew ? '  ↻ new' : ''
    const after = isChosen ? '  ✓ your answer' : ''
    const numberWidth = `${o.id}: `.length
    const labelLines = wrapLines(o.label, Math.max(8, width - OPTION_LEAD - numberWidth - tag.length - fresh.length - after.length))
    const lineColour = isChosen ? 'success' : colour
    const selected = isHighlighted ? { backgroundColor: SELECTED_BG } : {}
    const labelLook = { ...selected, ...(chosen !== undefined && !isChosen ? { dimColor: true } : {}) }
    const row = (
      <Box key={`line:${o.id}`}>
        {Bar(ui, lineColour)}
        <Text {...selected}>{`${ringMark(`opt:${o.id}`, view.ring, isFocused)} `}</Text>
        <Button
          key={`opt:${o.id}`}
          hotkey={isSent ? undefined : digit}
          plain
          autoFocus={isHighlighted && box === undefined && !view.isParking ? true : undefined}
          onPress={() => void pressOption($, d, o.id, choose, layout.pageSize)}
        >
          {digit === undefined || isSent ? <Text color="suggestion" {...selected}>{`${o.id}: `}</Text> : ''}
          <Text {...labelLook}>{labelLines[0] ?? ''}</Text>
          {isRecommended ? <Text color="success" {...selected}>{tag}</Text> : ''}
          {isNew ? <Text color="warning" {...selected}>{fresh}</Text> : ''}
          {isChosen ? <Text dimColor {...selected}>{after}</Text> : ''}
        </Button>
      </Box>
    )
    const more = barredBlock(
      `label:${o.id}`,
      lineColour,
      OPTION_LEAD - 1 + numberWidth,
      labelLines.slice(1).map((line, index) => (
        <Text key={`label:${o.id}:${index}`} {...labelLook}>
          {line}
        </Text>
      )),
    )
    const noteRow =
      isChosen && note !== undefined
        ? barred(`note:${o.id}`, lineColour, <Text color="success">{`${' '.repeat(DETAIL_INDENT - 1)}${note}`}</Text>)
        : null
    const detail = barredBlock(
      `detail:${o.id}`,
      lineColour,
      DETAIL_INDENT - 1,
      layout.isFull || isHighlighted
        ? detailParts(d, o.id).flatMap(part => InlineLines(ui, part.text, width - DETAIL_INDENT, part.color ? { color: part.color, ...(part.dim ? { dimColor: true } : {}) } : { dimColor: true }, `detail:${o.id}:${part.key}`))
        : [],
    )
    const answerBox =
      box !== undefined && box.option === o.id ? (
        <Box key="answer-box" flexDirection="column" borderStyle="round" borderColor="claude" marginLeft={DETAIL_INDENT - 1} paddingX={1}>
          {draftLines(view.answerDrafts[d.id] ?? '', width - (DETAIL_INDENT - 1) - 4 - (box.kind === 'text' ? 12 : 8) - INPUT_SUBMIT_COLUMNS).map((line, index) => (
            <Text key={`answer-draft:${index}`} dimColor>
              {line}
            </Text>
          ))}
          <Input
            key="answer"
            autoFocus
            label={box.kind === 'text' ? 'Your answer ' : 'Only if '}
            value={view.answerDrafts[d.id] ?? ''}
            onInput={(text: string) => void setView($, v => ({ ...v, answerDrafts: { ...v.answerDrafts, [d.id]: text } }))}
            onSubmit={(text: string) => void saveBox(text)}
          />
          <Text dimColor>{BOX_LINE}</Text>
        </Box>
      ) : null
    const gap = layout.hasGaps && o !== layout.shown[0] ? (
      <Box key={`gap:${o.id}`}>
        <Text> </Text>
      </Box>
    ) : null
    const receipt = isChosen
      ? barredBlock(
          `receipt:${o.id}`,
          lineColour,
          DETAIL_INDENT - 1,
          receiptLines(d).map((line, index) => (
            <Text key={`receipt:${o.id}:${index}`} dimColor>
              {line}
            </Text>
          )),
        )
      : null
    const block = [row, more, noteRow, receipt, detail]

    return [
      gap,
      isHighlighted ? (
        <Box key={`card:${o.id}`} flexDirection="column">
          {block}
        </Box>
      ) : (
        block
      ),
      answerBox,
    ]
  }

  const hintBlock = KeyHints(ui, hints, width, hintLinesMax(compact))
  const contextBlock = [
    ...InlineLines(ui, layout.scenario, width, compact ? { dimColor: true } : {}, 'context'),
    ...layout.extras.flatMap((line, index) =>
      wrapLines(line, width).map((part, n) => (
        <Text key={`extra:${index}:${n}`} dimColor>
          {part}
        </Text>
      )),
    ),
    ...(layout.showSources
      ? d.sources.map((source, index) => (
          <Box key={`source:${index}`}>
            <Text>{'  '}</Text>
            {ui.Link ? <ui.Link href={sourceHref(source.path, props.cwd ?? '')}>{source.label}</ui.Link> : <Text>{source.label}</Text>}
            <Text dimColor>{`  ${source.path}`}</Text>
          </Box>
        ))
      : []),
  ]
  const talk = layout.conversation
  const draft = view.drafts[d.id] ?? ''
  const talkBlock = talk ? (
    <Box key="talk" flexDirection="column">
      {Rule(ui, width, 'rule:talk')}
      <Box key="talk:heading">
        <Text bold>Talk it through with Claude</Text>
        {talk.messages > 0 ? <Text dimColor>{` · ${talk.messages} ${talk.messages === 1 ? 'message' : 'messages'}`}</Text> : ''}
        {talk.unread > 0 ? <Text color="claude">{` · ● ${talk.unread} new`}</Text> : ''}
      </Box>
      {talk.earlier ? <Text key="talk:earlier" dimColor>{`${talk.earlier} · o: whole thread`}</Text> : null}
      {talk.reply ? ChatEntry(ui, talk.reply, width, 'talk:reply') : null}
      {talk.asked ? ChatEntry(ui, talk.asked, width, 'talk:asked') : null}
      {(talk.empty ?? []).map((line, index) => (
        <Text key={`talk:empty:${index}`} dimColor>
          {line}
        </Text>
      ))}
      {isReplying(view, d) ? <Text key="talk:replying" color="claude">{REPLYING}</Text> : null}
      <Box key="ask-box" flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1}>
        {draftLines(draft, width - 4 - INPUT_SUBMIT_COLUMNS).map((line, index) => (
          <Text key={`ask-draft:${index}`} dimColor>
            {line}
          </Text>
        ))}
        <Box key="ask-row">
        {draft === '' ? <Text dimColor>{`${ASK_PLACEHOLDER} `}</Text> : null}
        <Input
          key="ask-inline"
          value={draft}
          onInput={(text: string) => void setView($, v => ({ ...v, drafts: { ...v.drafts, [d.id]: text } }))}
          onSubmit={async (text: string) => {
            if (text.trim() === '') {
              return
            }
            // Out of the box once it is sent, so the hotkeys work again and stop typing into it (row 261). The view takes the
            // ring at once, so the key line is the options' again on the next draw; the engine's ring follows.
            const option = `opt:${view.highlight ?? openingOption(d)}`
            await setView($, v => ({ ...v, ring: option }))
            focusLater($, option)
            await askQuestion($, currentReplies(), d.id, text.trim(), sessionSummary(await readSession($).catch(() => undefined)))
            onChanged()
          }}
        />
        </Box>
      </Box>
    </Box>
  ) : null

  return (
    <Box flexDirection="column">
      {DecisionHeader(ui, d, all, isFocused, width, compact)}
      {compact ? null : relationLines(d, all).map(line =>
        barred(line.key, colour, [
          <Text key="lead" dimColor>{` ${line.lead} `}</Text>,
          <Text key="text">{line.text}</Text>,
          line.mark ? <Text key="mark" color={line.mark === '✓' ? 'success' : undefined}>{` ${line.mark}`}</Text> : null,
        ]),
      )}
      {hintBlock}
      {layout.rules ? Rule(ui, width, 'rule:top') : null}
      {contextBlock}
      {layout.rules ? Rule(ui, width, 'rule:context') : null}
      {layout.shown.flatMap(optionRow)}
      {view.isParking ? (
        <Input
          key="park"
          autoFocus
          label="Why park it "
          placeholder="a few words, empty cancels"
          value={view.parkDraft}
          onInput={(text: string) => void setView($, v => ({ ...v, parkDraft: text }))}
          onSubmit={async (text: string) => {
            const isParked = await parkDecision($, d, text)
            if (isParked) {
              await leaving()
            }
            await setView($, v => ({
              ...v,
              isParking: false,
              parkDraft: '',
              notice: undefined,
              ...(isParked ? { screen: 'list' as const, decisionId: undefined } : {}),
            }))
            if (isParked) {
              onChanged()
              onLeave()
            }
          }}
        />
      ) : null}
      {view.notice ? <Text dimColor>{view.notice}</Text> : null}
      {talkBlock}
    </Box>
  )
}

/**
 * The decision screen's header (row 251): the bar, the kind as an inverse label in its colour, the title in bold,
 * wrapped whole on a tall pane (258), then the crumb with `keys on` or `<key> to use` at its right.
 */
function DecisionHeader(ui: { Box: any; Text: any }, d: Decision, all: Decision[], isFocused: boolean, width: number, compact: boolean): any {
  const { Box, Text } = ui
  const colour = barColour(d)
  const label = ` ${kindLabel(d.kind)} `
  const lines = headerLines(d, width, compact)
  const state = keysState(isFocused)
  const usable = width - HEADER_RIGHT_GAP
  const crumbRoom = Math.max(1, usable - 2 - state.length - 1)
  const full = crumbFor(d, all)
  // Compact cuts the crumb to its one line; tall wraps it whole, the keys state at the right of its last line (row 262).
  const crumbLines = compact || full.length <= crumbRoom ? [truncateLine(full, crumbRoom)] : wrapLines(full, width - 2)
  const crumb = crumbLines.at(-1)!
  const isStateOwnLine = crumb.length > crumbRoom

  return (
    <Box key="header" flexDirection="column">
      {lines.map((line, index) => (
        <Box key={`title:${index}`}>
          {Bar(ui, colour)}
          {index === 0 ? (
            <Text>
              {' '}
              <Text backgroundColor={kindColour(d.kind) ?? 'text'} color="inverseText" bold>
                {label}
              </Text>
              {' '}
            </Text>
          ) : (
            <Text>{' '.repeat(label.length + 2)}</Text>
          )}
          <Text bold>{line}</Text>
        </Box>
      ))}
      {problemLines(d, width, compact).map((line, index) => (
        <Box key={`problem:${index}`}>
          {Bar(ui, colour)}
          <Text>{' '.repeat(label.length + 2)}</Text>
          <Text bold>{line}</Text>
        </Box>
      ))}
      <Box key="crumb" flexDirection="column">
        {crumbLines.map((line, index) => (
          <Box key={`crumb:${index}`}>
            {Bar(ui, colour)}
            <Text dimColor>{` ${line}`}</Text>
            {index === crumbLines.length - 1 && !isStateOwnLine ? <Text>{' '.repeat(Math.max(1, usable - 2 - line.length - state.length))}</Text> : null}
            {index === crumbLines.length - 1 && !isStateOwnLine ? isFocused ? <Text bold>{state}</Text> : <Text dimColor>{state}</Text> : null}
          </Box>
        ))}
        {isStateOwnLine ? (
          <Box key="crumb:state">
            {Bar(ui, colour)}
            <Text>{' '.repeat(Math.max(1, usable - 1 - state.length))}</Text>
            {isFocused ? <Text bold>{state}</Text> : <Text dimColor>{state}</Text>}
          </Box>
        ) : null}
      </Box>
    </Box>
  )
}

async function onBack($: any, onLeave: () => void): Promise<void> {
  const next = await back($, await readView($))
  await setView($, () => ({ ...next, compactPage: 0, isContextOpen: false, ring: undefined }))
  onLeave()
}
