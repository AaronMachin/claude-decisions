import { atom, read, update } from 'claude-code'

import type { PaneView } from '../../types'
import { reopenDependents, reopenNotice } from '../dependents'
import { focusKeyName } from '../focus-key'
import { readOne, write } from '../store'
import { askQuestion, currentMode } from '../discuss'
import type { Answer, Decision, Kind, Option, StoreCtx, ThreadEntry } from '../store'
import { Card, Header, KeyHints, Rule, capLines, cardFrame, cardInset, hintLineCount, isCompact, wrapLines } from './look'
import type { Hint } from './look'
import { ago, markSeen, noteVisit, readSeen, unreadReplies } from './seen'

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
const viewAtom = atom({ plugin: 'decisions', key: 'view' } as const, INITIAL_VIEW, { shape: 'view-6' })

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
  if (previous?.option === undefined || previous.option === option) {
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

const KIND_COLOR: Record<Kind, string> = { choice: 'suggestion', 'go-ahead': 'warning', finding: 'claude', assumption: 'subtle', question: 'subtle' }

/** The kind as the crumb names it, and the colour the spec gives it. */
export function kindLabel(kind: Kind): { text: string; color: string } {
  return { text: kind.toUpperCase(), color: KIND_COLOR[kind] }
}

const HIDDEN: Decision['state'][] = ['superseded', 'withdrawn']

/** How many decisions in this one's group are answered (ready or sent), out of those still shown. */
export function progressDots(d: Decision, all: Decision[]): { answered: number; total: number } {
  const pool = all.some(x => x.id === d.id) ? all : [...all, d]
  const group = pool.filter(x => x.group === d.group && !HIDDEN.includes(x.state))

  return { answered: group.filter(x => x.state === 'ready' || x.state === 'sent').length, total: group.length }
}

/** "CHOICE · d41 · Code review · ●○ 1 of 2 answered": the dim line under the title. */
export function crumbFor(d: Decision, all: Decision[] = []): string {
  const { answered, total } = progressDots(d, all)
  const dots = '●'.repeat(answered) + '○'.repeat(Math.max(0, total - answered))

  return [kindLabel(d.kind).text, d.id, d.group ?? 'Other', `${dots} ${answered} of ${total} answered`].join(' · ')
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

/** The lines `m` used to show beyond the scenario: reopened, blocks and depends-on, parked reason, sources. */
export function contextExtras(d: Decision, all: Decision[]): string[] {
  const reopened = reopenedLine(d)

  return [
    ...(reopened ? [reopened] : []),
    ...dependencyLines(d, all),
    ...(d.state === 'parked' && d.parkedReason ? [`Parked: ${d.parkedReason}`] : []),
    ...(d.sources.length > 0 ? [`Sources: ${d.sources.map(s => `${s.label} (${s.path})`).join(', ')}`] : []),
  ]
}

/** The digit that presses an option's own row: 1 to 9, 0 for 10, none past 10. */
export function digitOf(option: number): string | undefined {
  return option >= 1 && option <= 9 ? String(option) : option === 10 ? '0' : undefined
}

const REPLIERS = new Set<ThreadEntry['who']>(['claude', 'fork', 'quick'])

/** What the conversation block under the options says (decisions 216, 220). */
export type Conversation = {
  heading: string
  messages: number
  unread: number
  reply?: { who: string; when: string; lines: string[] }
  earlier?: string
  empty?: string[]
}

/**
 * The conversation under the options: the counts, the newest unread reply or else the newest reply (at most
 * `replyCap` lines, cut with `…`), and how many other messages the thread screen holds.
 */
export function conversationLines(d: Decision, seenAt: string | undefined, width: number, replyCap = 6, now: Date = new Date()): Conversation {
  const messages = d.thread.filter(e => e.revision === undefined)
  const unread = unreadReplies(d, seenAt)
  const shown = unread.at(-1) ?? messages.findLast(e => REPLIERS.has(e.who))
  const heading = [
    'Talk it through with Claude',
    ...(messages.length > 0 ? [`${messages.length} ${messages.length === 1 ? 'message' : 'messages'}`] : []),
    ...(unread.length > 0 ? [`● ${unread.length} new`] : []),
  ].join(' · ')
  if (messages.length === 0) {
    return { heading, messages: 0, unread: 0, empty: replyCap > 0 ? wrapLines(ASK_EMPTY, width) : [] }
  }
  const reply = shown && replyCap > 0 ? { who: shown.who, when: ago(shown.at, now), lines: capLines(shown.text, Math.max(1, width - 2), replyCap).lines } : undefined
  const rest = reply ? messages.length - 1 : messages.length
  const earlier = rest > 0 ? `${rest} ${reply ? 'earlier ' : ''}${rest === 1 ? 'message' : 'messages'}` : undefined

  return { heading, messages: messages.length, unread: unread.length, reply, earlier }
}

/** Rows the conversation block takes, without its rule: heading, reply, earlier line, replying line, the ask box. */
function conversationRows(c: Conversation, isReplying: boolean): number {
  return 1 + (c.reply ? 1 + c.reply.lines.length : 0) + (c.earlier ? 1 : 0) + (c.empty?.length ?? 0) + (isReplying ? 1 : 0) + 1
}

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
}

type Handlers = {
  recommend: () => void
  condition: () => void
  talk: () => void
  moreOptions: () => void
  thread: () => void
  digit: (option: number) => void
  more: () => void
  back: () => void
  park: () => void
  send: () => void
  hide: () => void
}

const NO_HANDLERS: Handlers = {
  recommend: () => {},
  condition: () => {},
  talk: () => {},
  moreOptions: () => {},
  thread: () => {},
  digit: () => {},
  more: () => {},
  back: () => {},
  park: () => {},
  send: () => {},
  hide: () => {},
}

/** The decision screen's key hints. */
export function decisionHints(c: HintCtx, on: Handlers = NO_HANDLERS): Hint[] {
  const { d, view } = c
  const isSent = d.state === 'sent'
  const highlight = view.highlight
  const isSomethingElse = highlight === somethingElseNumber(d)
  const isOption = highlight !== undefined && d.options.some(o => o.id === highlight)
  const hints: Hint[] = []
  if (highlight !== undefined && !isSent && (isOption || isSomethingElse)) {
    hints.push({ id: 'enter-choose', keyText: 'enter', label: isSomethingElse ? 'type an answer' : `choose ${highlight}` })
  }
  if (!isSent && d.recommendation !== undefined) {
    hints.push({ id: 'a', keyText: 'a', label: 'recommended', hotkey: 'a', onPress: on.recommend })
  }
  if (!isSent && isOption) {
    hints.push({ id: 'c', keyText: 'c', label: 'condition', hotkey: 'c', onPress: on.condition })
  }
  hints.push({ id: 't', keyText: 't', label: 'talk', hotkey: 't', onPress: on.talk })
  if (c.isPaged && !isSent) {
    hints.push({ id: 'o', keyText: 'o', label: 'more options', hotkey: 'o', onPress: on.moreOptions })
  } else {
    hints.push({ id: 'o', keyText: 'o', label: 'thread', hotkey: 'o', onPress: on.thread })
  }
  if (!isSent) {
    for (const option of c.offPage) {
      const digit = digitOf(option)!
      hints.push({ id: `digit:${digit}`, keyText: digit, label: '', hotkey: digit, onPress: () => on.digit(option) })
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

/** One line of an option's detail: its `changes` dim, the recommendation's reason in `success`. */
export type DetailLine = { text: string; color?: string }

/** Everything under an option, in full: its changes and, on the recommended one, why (decision 217). */
export function detailLines(d: Decision, option: number, width: number): DetailLine[] {
  const o = drawnOptions(d).find(x => x.id === option)
  const why = d.recommendation?.option === option && !o?.isSomethingElse ? `Why: ${d.recommendation.reason}` : undefined

  return [...(o?.changes ? wrapLines(o.changes, width).map(text => ({ text })) : []), ...(why ? wrapLines(why, width).map(text => ({ text, color: 'success' })) : [])]
}

/** The highlighted option's card lines: in full, else 2 lines each; compact, one line. */
export function cardDetail(d: Decision, option: number, width: number, compact: boolean, isFull = false): DetailLine[] {
  if (isFull) {
    return detailLines(d, option, width)
  }
  const o = drawnOptions(d).find(x => x.id === option)
  const why = d.recommendation?.option === option && !o?.isSomethingElse ? `Why: ${d.recommendation.reason}` : undefined
  if (compact) {
    const one = [o?.changes, why].filter(Boolean).join(' · ')

    return one === '' ? [] : [{ text: truncateLine(one, width - 3) }]
  }

  return [...(o?.changes ? capLines(o.changes, width, 2).lines.map(text => ({ text })) : []), ...(why ? capLines(why, width, 2).lines.map(text => ({ text, color: 'success' })) : [])]
}

/** The lines under the highlighted option: its description and, on the recommended one, why. Compact: one line. */
export function cardLines(d: Decision, option: number, width: number, compact: boolean): string[] {
  return cardDetail(d, option, width, compact).map(line => line.text)
}

function truncateLine(text: string, width: number): string {
  return text.length <= width ? text : text.slice(0, Math.max(0, width - 1)) + '…'
}

/** The line under a chosen option: the condition, or the typed answer. */
export function answerNote(d: Decision): string | undefined {
  if (d.answer?.condition !== undefined && d.answer.option !== undefined) {
    return `⤷ only if ${d.answer.condition}`
  }

  return d.answer?.text !== undefined && d.answer.option === undefined ? `⤷ ${d.answer.text}` : undefined
}

/** How the decision screen fits the pane: rules, context lines, the page of options, the conversation, the hints. */
export type DecisionLayout = {
  compact: boolean
  rules: boolean
  /** Tall: the scenario lines (in full, the extras too). Compact: the one line above the options. */
  context: string[]
  hasMore: boolean
  /** Tall, with the detail shown and room for it: every option's text and the reason in full (decisions 217, 228). */
  isFull: boolean
  /** Tall: the full layout fits, or the detail is hidden, so `m` changes something. */
  canToggleDetail: boolean
  page: number
  pageSize: number
  pages: number
  shown: DrawnOption[]
  offPage: number[]
  hints: Hint[]
  hintLines: number
  /** The keys-off line, or none while the pane has the keys. */
  keysOff: string[]
  /** Tall only: what the conversation block under the options says. */
  conversation?: Conversation
}

const KEYS_OFF_TALL = (key: string) => `Press the pane focus key (${key} unless you moved it) to use it with a draft kept, or run /decisions with an empty prompt.`

/** The line under the header while the prompt has the keys (row 149, shorter on a compact pane). */
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

export function decisionLayout(
  d: Decision,
  view: PaneView,
  width: number,
  rows: number,
  isFocused: boolean,
  readyCount: number,
  all: Decision[] = [],
  seenAt?: string,
): DecisionLayout {
  const compact = isCompact(rows)
  const inner = width - cardInset(compact)
  const keysOff = isFocused ? [] : keysOffLines(width, compact)
  const drawn = drawnOptions(d)
  const count = drawn.length
  const scenario = wrapLines(d.scenario, width)
  const extras = contextExtras(d, all).flatMap(line => wrapLines(line, width))
  const fullContext = [...scenario, ...extras]
  const isContextOpen = compact && view.isContextOpen
  const hasMore = compact && (view.isContextOpen || extras.length > 0 || scenario.length > 1)
  const replying = isReplying(view, d)
  const talk = (cap: number) => (compact ? undefined : conversationLines(d, seenAt, width, cap))
  const talkRows = (cap: number) => (compact ? 0 : conversationRows(talk(cap)!, replying))
  const fixedBase =
    2 +
    keysOff.length +
    (view.notice ? 1 : 0) +
    (view.isParking ? 1 : 0) +
    (view.answerBox !== undefined && d.state !== 'sent' ? 1 + wrapLines(BOX_LINE, width).length : 0) +
    (answerNote(d) !== undefined ? 1 : 0)
  const hintMax = hintLinesMax(compact)
  const hintsFor = (isPaged: boolean, offPage: number[], canToggleDetail: boolean) =>
    decisionHints({ d, view, isFocused, readyCount, isPaged, offPage, hasMore, compact, canToggleDetail })

  // Full detail: every option's text at the card's width, so moving the highlight never tips it over the edge.
  const fullOptionRows = drawn.reduce((n, o) => n + 1 + detailLines(d, o.id, inner).length, 0) + cardFrame(false)
  const fullHintLines = hintLineCount(hintsFor(false, [], true), width, hintMax)
  const fitsFull = !compact && fixedBase + 4 + fullContext.length + fullOptionRows + talkRows(6) + fullHintLines <= rows
  const canToggleDetail = fitsFull || view.isDetailHidden
  if (fitsFull && !view.isDetailHidden) {
    const hints = hintsFor(false, [], true)

    return {
      compact,
      rules: true,
      context: fullContext,
      hasMore,
      isFull: true,
      canToggleDetail,
      page: 0,
      pageSize: count,
      pages: 1,
      shown: drawn,
      offPage: [],
      hints,
      hintLines: hintLineCount(hints, width, hintMax),
      keysOff,
      conversation: talk(6),
    }
  }

  // Compact, the highlighted option's one line; tall, the biggest card. The ring always starts on an option now (219),
  // so compact keeps its scenario line as well rather than giving it up to the highlight.
  const reserveCard = compact
    ? view.highlight !== undefined
      ? 1
      : 0
    : drawn.reduce((most, o) => Math.max(most, cardDetail(d, o.id, inner, compact).length), 0) + cardFrame(compact)
  type Step = { rules: boolean; contextCap: number; replyCap: number }
  const steps: Step[] = compact
    ? [{ rules: true, contextCap: 1, replyCap: 0 }, { rules: false, contextCap: 1, replyCap: 0 }]
    : [
        { rules: true, contextCap: 3, replyCap: 6 },
        { rules: false, contextCap: 3, replyCap: 6 },
        { rules: false, contextCap: 1, replyCap: 2 },
        { rules: false, contextCap: 1, replyCap: 0 },
      ]
  const fit = (step: Step, hintLines: number) => {
    const ruleRows = step.rules ? (compact ? 1 : 4) : 0
    const without = fixedBase + hintLines + ruleRows + reserveCard + talkRows(step.replyCap)
    const contextRows = isContextOpen ? Math.min(fullContext.length, Math.max(step.contextCap, rows - without - 1)) : compact ? 1 : Math.min(scenario.length, step.contextCap)

    return { room: rows - without - contextRows, contextRows, ruleRows }
  }
  // A sent decision has no `o`: its page is the one holding the answer, so the ✓ is always drawn.
  const anchored = d.state === 'sent' && view.highlight === undefined ? { ...view, highlight: chosenNumber(d) } : view
  const unpagedHints = hintsFor(false, [], canToggleDetail)
  const unpagedLines = hintLineCount(unpagedHints, width, hintMax)
  let chosen = steps.find(step => fit(step, unpagedLines).room >= count)
  let hints = unpagedHints
  let hintLines = unpagedLines
  let pageSize = Math.max(1, count)
  if (chosen === undefined) {
    chosen = steps[steps.length - 1]!
    const guess = Math.max(1, fit(chosen, hintLineCount(hintsFor(true, [], canToggleDetail), width, hintMax)).room)
    const pagedHints = (size: number, page: number) =>
      hintsFor(
        true,
        drawn.filter(o => digitOf(o.id) !== undefined && Math.floor((o.id - 1) / size) !== page).map(o => o.id),
        canToggleDetail,
      )
    hints = pagedHints(guess, pageFor(anchored, guess, count))
    hintLines = hintLineCount(hints, width, hintMax)
    pageSize = Math.max(1, fit(chosen, hintLines).room)
    hints = pagedHints(pageSize, pageFor(anchored, pageSize, count))
    hintLines = hintLineCount(hints, width, hintMax)
    pageSize = Math.max(1, fit(chosen, hintLines).room)
  }
  const pages = Math.max(1, Math.ceil(count / pageSize))
  const page = pageFor(anchored, pageSize, count)
  const { contextRows } = fit(chosen, hintLines)
  const context = isContextOpen
    ? fullContext.slice(0, contextRows)
    : compact
      ? [truncateLine(d.scenario.replace(/\s+/g, ' '), width)]
      : capLines(d.scenario, width, contextRows).lines

  return {
    compact,
    rules: chosen.rules,
    context,
    hasMore,
    isFull: false,
    canToggleDetail,
    page,
    pageSize,
    pages,
    shown: drawn.slice(page * pageSize, (page + 1) * pageSize),
    offPage: pages > 1 ? drawn.filter(o => digitOf(o.id) !== undefined && Math.floor((o.id - 1) / pageSize) !== page).map(o => o.id) : [],
    hints,
    hintLines,
    keysOff,
    conversation: talk(chosen.replyCap),
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
  ui: { Box: any; Text: any; Button: any; Input: any }
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
}

/** What a saved typed answer or condition reads as in the notice. */
function savedText(d: Decision, box: { kind: 'text' | 'condition'; option: number }, text: string): string {
  if (box.kind === 'text') {
    return `${SOMETHING_ELSE}: ${text}`
  }
  const o = d.options.find(x => x.id === box.option)

  return `${box.option} ${o?.label ?? ''}, if ${text}`
}

/** One decision: header, context, the options (the highlighted one in a card), the conversation and the key hints. Returns an element tree. */
export function DecisionView($: any, props: Props): any {
  const { ui, d, view, width, readyCount, onChanged, onLeave, onSend, onHide } = props
  const { Box, Text, Button, Input } = ui
  const isFocused = props.isFocused === true
  const isSent = d.state === 'sent'
  const chosen = chosenNumber(d)
  const somethingElse = somethingElseNumber(d)
  const layout = decisionLayout(d, view, width, props.rows ?? 30, isFocused, readyCount, props.all ?? [], props.seenAt)
  const { compact } = layout
  const inner = width - cardInset(compact)
  const now = Date.now()
  const box = isSent ? undefined : view.answerBox

  const toList = (notice: string | undefined): Promise<unknown> =>
    setView($, v => {
      const { [d.id]: _gone, ...answerDrafts } = v.answerDrafts
      return { ...v, screen: 'list', decisionId: undefined, highlight: undefined, ring: undefined, compactPage: 0, isContextOpen: false, answerBox: undefined, answerDrafts, notice }
    })
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
  const handlers: Handlers = {
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
    talk: () => void (compact ? openThread() : focusTo($, 'ask-inline')),
    moreOptions: async () => {
      typing.typed = undefined
      const next = (layout.page + 1) % layout.pages
      const first = drawnOptions(d)[next * layout.pageSize]?.id ?? 1
      await setView($, v => ({ ...v, highlight: first, compactPage: next }))
      focusLater($, `opt:${first}`)
    },
    thread: () => void openThread(),
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
    back: () => void onBack($, onLeave),
    park: async () => {
      if (d.state === 'parked') {
        await unparkDecision($, d)
        onChanged()
      } else {
        await setView($, v => ({ ...v, isParking: true }))
        focusLater($, 'park')
      }
    },
    send: d.state === 'ready' && props.onSendThis ? props.onSendThis : onSend,
    hide: onHide,
  }
  const hints = decisionHints(
    {
      d,
      view,
      isFocused,
      readyCount,
      isPaged: layout.pages > 1,
      offPage: layout.offPage,
      hasMore: layout.hasMore,
      compact,
      canToggleDetail: layout.canToggleDetail,
    },
    handlers,
  )
  const note = answerNote(d)

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
    const room = Math.max(4, (isHighlighted ? inner : width) - 3 - numberWidth - tag.length - fresh.length - after.length)
    const label = truncateLine(o.label, room)
    const color = compact && isHighlighted ? 'claude' : undefined
    const row = (
      <Box key={`line:${o.id}`}>
        <Text color={color}>{`${ringMark(`opt:${o.id}`, view.ring, isFocused)}  `}</Text>
        <Button
          key={`opt:${o.id}`}
          hotkey={isSent ? undefined : digit}
          plain
          autoFocus={isHighlighted && box === undefined && !view.isParking ? true : undefined}
          onPress={() => void pressOption($, d, o.id, choose, layout.pageSize)}
        >
          {digit === undefined || isSent ? <Text color="suggestion">{`${o.id}: `}</Text> : ''}
          {chosen !== undefined && !isChosen ? <Text dimColor>{label}</Text> : <Text color={color}>{label}</Text>}
          {isRecommended ? <Text color="success">{tag}</Text> : ''}
          {isNew ? <Text color="warning">{fresh}</Text> : ''}
          {isChosen ? <Text dimColor>{after}</Text> : ''}
        </Button>
      </Box>
    )
    const noteRow = (room: number) =>
      isChosen && note !== undefined ? (
        <Box key={`note:${o.id}`} paddingLeft={3}>
          <Text color="success">{truncateLine(note, room - 3)}</Text>
        </Box>
      ) : null
    const boxRows =
      box !== undefined && box.option === o.id
        ? [
            <Input
              key="answer"
              autoFocus
              label={box.kind === 'text' ? 'Your answer ' : 'Only if '}
              value={view.answerDrafts[d.id] ?? ''}
              onInput={(text: string) => void setView($, v => ({ ...v, answerDrafts: { ...v.answerDrafts, [d.id]: text } }))}
              onSubmit={(text: string) => void saveBox(text)}
            />,
            ...wrapLines(BOX_LINE, width).map((line, index) => (
              <Text key={`answer-line:${index}`} dimColor>
                {line}
              </Text>
            )),
          ]
        : []
    if (!isHighlighted) {
      const detail = layout.isFull
        ? detailLines(d, o.id, width - 3).map((line, index) => (
            <Box key={`detail:${o.id}:${index}`} paddingLeft={3}>
              {line.color ? <Text color={line.color}>{line.text}</Text> : <Text dimColor>{line.text}</Text>}
            </Box>
          ))
        : []

      return [row, noteRow(width), ...detail, ...boxRows]
    }
    const lines = cardDetail(d, o.id, inner, compact, layout.isFull)

    return [
      Card(ui, compact, `card:${o.id}`, [
        row,
        noteRow(inner),
        ...lines.map((line, index) =>
          line.color ? (
            <Text key={`card:${o.id}:${index}`} color={line.color}>
              {compact ? `   ${line.text}` : line.text}
            </Text>
          ) : (
            <Text key={`card:${o.id}:${index}`} dimColor>
              {compact ? `   ${line.text}` : line.text}
            </Text>
          ),
        ),
      ]),
      ...boxRows,
    ]
  }

  const hintBlock = KeyHints(ui, hints, width, hintLinesMax(compact))
  const contextBlock = layout.context.map((line, index) => (
    <Text key={`context:${index}`} dimColor={compact}>
      {line}
    </Text>
  ))
  const talk = layout.conversation
  const talkBlock = talk ? (
    <Box key="talk" flexDirection="column">
      {layout.rules ? Rule(ui, width, 'rule:talk') : null}
      <Box key="talk:heading">
        <Text bold>Talk it through with Claude</Text>
        {talk.messages > 0 ? <Text dimColor>{` · ${talk.messages} ${talk.messages === 1 ? 'message' : 'messages'}`}</Text> : ''}
        {talk.unread > 0 ? <Text color="claude">{` · ● ${talk.unread} new`}</Text> : ''}
      </Box>
      {talk.reply ? <Text key="talk:who" dimColor>{`${talk.reply.who} · ${talk.reply.when}`}</Text> : null}
      {(talk.reply?.lines ?? []).map((line, index) => (
        <Box key={`talk:line:${index}`} paddingLeft={2}>
          <Text>{line}</Text>
        </Box>
      ))}
      {talk.earlier ? <Text key="talk:earlier" dimColor>{layout.pages > 1 ? talk.earlier : `${talk.earlier} · o: whole thread`}</Text> : null}
      {(talk.empty ?? []).map((line, index) => (
        <Text key={`talk:empty:${index}`} dimColor>
          {line}
        </Text>
      ))}
      {isReplying(view, d) ? <Text key="talk:replying" color="claude">{REPLYING}</Text> : null}
      <Input
        key="ask-inline"
        placeholder={ASK_PLACEHOLDER}
        value={view.drafts[d.id] ?? ''}
        onInput={(text: string) => void setView($, v => ({ ...v, drafts: { ...v.drafts, [d.id]: text } }))}
        onSubmit={async (text: string) => {
          if (text.trim() === '') {
            return
          }
          await askQuestion($, currentMode(), d.id, text.trim())
          onChanged()
        }}
      />
    </Box>
  ) : null

  return (
    <Box flexDirection="column">
      {Header(ui, d.title, isFocused, crumbFor(d, props.all ?? []), width)}
      {layout.keysOff.map((line, index) => (
        <Text key={`keys-off:${index}`} dimColor>
          {line}
        </Text>
      ))}
      {compact ? hintBlock : null}
      {compact && layout.rules ? Rule(ui, width, 'rule:top') : null}
      {!compact && layout.rules ? Rule(ui, width, 'rule:header') : null}
      {contextBlock}
      {!compact && layout.rules ? Rule(ui, width, 'rule:context') : null}
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
      {view.notice ? <Text dimColor>{truncateLine(view.notice, width)}</Text> : null}
      {talkBlock}
      {!compact && layout.rules ? Rule(ui, width, 'rule:options') : null}
      {compact ? null : hintBlock}
    </Box>
  )
}

async function onBack($: any, onLeave: () => void): Promise<void> {
  const next = await back($, await readView($))
  await setView($, () => ({ ...next, compactPage: 0, isContextOpen: false, ring: undefined }))
  onLeave()
}
