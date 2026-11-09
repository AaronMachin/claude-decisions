import { atom, read, update } from 'claude-code'

import type { PaneView } from '../../types'
import { reopenDependents, reopenNotice } from '../dependents'
import { focusKeyName } from '../focus-key'
import { readOne, write } from '../store'
import type { Decision, StoreCtx } from '../store'
import { Card, Header, KeyHints, Rule, capLines, cardFrame, cardInset, hintLineCount, isCompact, wrapLines } from './look'
import type { Hint } from './look'

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
}

// Change the tag when PaneView's fields change: it declines what an earlier version stored.
const viewAtom = atom({ plugin: 'decisions', key: 'view' } as const, INITIAL_VIEW, { shape: 'view-5' })

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

/**
 * `b`: with a highlight, clears it (the ring goes back to Discuss); with none, goes
 * back to the list.
 */
export async function back(
  $: { ui: { focus: (args: { requestId: string; key: string }) => Promise<unknown> } },
  view: PaneView,
  state: Typing = typing,
): Promise<PaneView> {
  state.typed = undefined
  state.option = undefined
  if (view.highlight !== undefined) {
    await $.ui.focus({ requestId: PANE_ID, key: 'discuss' })

    return { ...view, highlight: undefined, ring: 'discuss' }
  }

  return { ...view, screen: 'list', decisionId: undefined, isParking: false, notice: undefined }
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

/** "Blocks:" and "Depends on:" lines for one decision, given all of them. */
export function dependencyLines(d: Decision, all: Decision[]): string[] {
  const lines = d.blocks ? [`Blocks: ${d.blocks}`] : []
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

type Props = {
  ui: { Box: any; Text: any; Button: any; Input: any }
  d: Decision
  view: PaneView
  width: number
  /** The pane's rows (`scroll.bodyRows`): the options are paged so the hints stay in view. */
  rows?: number
  readyCount: number
  /** Every decision, so the screen can say what this one depends on. */
  all?: Decision[]
  /** Called after anything that changes a decision, so the status line and pane refresh. */
  onChanged: () => void
  /** Called when the pane has gone back to the list, so the ring can be put on its first row. */
  onLeave: () => void
  onSend: () => void
  onHide: () => void
  /** The pane has the keys, so the ring (and its `›`) is shown. */
  isFocused?: boolean
}

/** "Config file plan › d1 · open · Claude recommends 1": the dim line under the title. */
export function crumbFor(d: Decision): string {
  const recommends = d.recommendation === undefined ? [] : [`Claude recommends ${d.recommendation.option}`]

  return [`${d.group ?? 'Other'} › ${d.id}`, stateLine(d), ...recommends].join(' · ')
}

/** The lines `m` shows beyond the scenario: reopened, blocks and depends-on, parked reason, sources. */
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

type HintCtx = {
  d: Decision
  view: PaneView
  isFocused: boolean
  readyCount: number
  isPaged: boolean
  /** Options with a digit that are not on the page drawn. */
  offPage: number[]
  hasMore: boolean
}

type Handlers = {
  discuss: () => void
  recommend: () => void
  moreOptions: () => void
  digit: (option: number) => void
  more: () => void
  back: () => void
  park: () => void
  send: () => void
  hide: () => void
}

const NO_HANDLERS: Handlers = {
  discuss: () => {},
  recommend: () => {},
  moreOptions: () => {},
  digit: () => {},
  more: () => {},
  back: () => {},
  park: () => {},
  send: () => {},
  hide: () => {},
}

/** The decision screen's key hints: Discuss first (the ring starts there), then the keys. */
export function decisionHints(c: HintCtx, on: Handlers = NO_HANDLERS): Hint[] {
  const { d, view } = c
  const isSent = d.state === 'sent'
  const highlight = view.highlight
  const hints: Hint[] = []
  if (highlight !== undefined && !isSent) {
    hints.push({ id: 'enter-choose', keyText: 'enter', label: `choose ${highlight}` })
  }
  hints.push({
    id: 'discuss',
    keyText: highlight === undefined || isSent ? 'enter' : '',
    label: 'discuss',
    onPress: on.discuss,
    autoFocus: true,
    mark: ringMark('discuss', view.ring, c.isFocused),
  })
  if (!isSent && d.recommendation !== undefined) {
    hints.push({ id: 'a', keyText: 'a', label: 'recommended', hotkey: 'a', onPress: on.recommend })
  }
  if (c.isPaged && !isSent) {
    hints.push({ id: 'o', keyText: 'o', label: 'more options', hotkey: 'o', onPress: on.moreOptions })
  }
  if (!isSent) {
    for (const option of c.offPage) {
      const digit = digitOf(option)!
      hints.push({ id: `digit:${digit}`, keyText: digit, label: '', hotkey: digit, onPress: () => on.digit(option) })
    }
  }
  if (c.hasMore || view.isContextOpen) {
    hints.push({ id: 'm', keyText: 'm', label: view.isContextOpen ? 'less' : 'more', hotkey: 'm', onPress: on.more })
  }
  hints.push({ id: 'b', keyText: 'b', label: 'back', hotkey: 'b', onPress: on.back })
  if (!isSent) {
    hints.push({ id: 'p', keyText: 'p', label: d.state === 'parked' ? 'unpark' : 'park', hotkey: 'p', onPress: on.park })
  }
  if (c.readyCount > 0 && !isSent) {
    hints.push({ id: 's', keyText: 's', label: `send ${c.readyCount}`, hotkey: 's', onPress: on.send })
  }
  if (!isSent) {
    hints.push({ id: 'h', keyText: 'h', label: 'hide', hotkey: 'h', onPress: on.hide })
  }

  return hints
}

/** The lines under the highlighted option: its description and, on the recommended one, why. Compact: one line. */
export function cardLines(d: Decision, option: number, width: number, compact: boolean): string[] {
  const o = d.options.find(x => x.id === option)
  const why = d.recommendation?.option === option ? `Why: ${d.recommendation.reason}` : undefined
  if (compact) {
    const one = [o?.changes, why].filter(Boolean).join(' · ')

    return one === '' ? [] : [truncateLine(one, width - 3)]
  }

  return [...(o?.changes ? capLines(o.changes, width, 2).lines : []), ...(why ? capLines(why, width, 2).lines : [])]
}

function truncateLine(text: string, width: number): string {
  return text.length <= width ? text : text.slice(0, Math.max(0, width - 1)) + '…'
}

/** How the decision screen fits the pane: rules, context lines, the page of options, the hints. */
export type DecisionLayout = {
  compact: boolean
  rules: boolean
  /** Tall: the scenario lines (and with `m`, everything else). Compact: the one line above the options, or none while one is highlighted. */
  context: string[]
  hasMore: boolean
  page: number
  pageSize: number
  pages: number
  shown: Decision['options']
  offPage: number[]
  hints: Hint[]
  hintLines: number
  /** The keys-off line, or none while the pane has the keys. */
  keysOff: string[]
}

const KEYS_OFF_TALL = (key: string) => `Press the pane focus key (${key} unless you moved it) to use it with a draft kept, or run /decisions with an empty prompt.`

/** The line under the header while the prompt has the keys (row 149, shorter on a compact pane). */
export function keysOffLines(width: number, compact: boolean): string[] {
  const key = focusKeyName()

  return compact ? [truncateLine(`${key} to use the pane, your draft stays`, width)] : wrapLines(KEYS_OFF_TALL(key), width)
}

export function decisionLayout(d: Decision, view: PaneView, width: number, rows: number, isFocused: boolean, readyCount: number, all: Decision[] = []): DecisionLayout {
  const compact = isCompact(rows)
  const inner = width - cardInset(compact)
  const keysOff = isFocused ? [] : keysOffLines(width, compact)
  const scenario = wrapLines(d.scenario, width)
  const extras = contextExtras(d, all).flatMap(line => wrapLines(line, width))
  const fullContext = [...scenario, ...extras]
  const hasMore = view.isContextOpen || extras.length > 0 || scenario.length > (compact ? 1 : 3)
  // Compact, the highlighted option's line takes the place of the scenario's, so only the tall card is reserved.
  const reserveCard = compact ? 0 : d.options.reduce((most, o) => Math.max(most, cardLines(d, o.id, inner, compact).length), 0) + cardFrame(compact)
  const fixedBase =
    2 +
    keysOff.length +
    (d.kind === 'question' && !d.isTask && d.state !== 'sent' ? 1 : 0) +
    (view.notice ? 1 : 0) +
    (view.isParking ? 1 : 0)
  const hintsFor = (isPaged: boolean, offPage: number[]) => decisionHints({ d, view, isFocused, readyCount, isPaged, offPage, hasMore })
  const count = d.options.length
  const steps: { rules: boolean; contextCap: number }[] = compact
    ? [{ rules: true, contextCap: 1 }, { rules: false, contextCap: 1 }]
    : [{ rules: true, contextCap: 3 }, { rules: false, contextCap: 3 }, { rules: false, contextCap: 1 }]
  const fit = (step: { rules: boolean; contextCap: number }, hintLines: number) => {
    const ruleRows = step.rules ? (compact ? 1 : 3) : 0
    const without = fixedBase + hintLines + ruleRows + reserveCard
    const contextRows = view.isContextOpen
      ? Math.min(fullContext.length, Math.max(step.contextCap, rows - without - 1))
      : compact
        ? 1
        : Math.min(scenario.length, step.contextCap)

    return { room: rows - without - contextRows, contextRows, ruleRows }
  }
  const unpagedHints = hintsFor(false, [])
  const unpagedLines = hintLineCount(unpagedHints, width, 2)
  let chosen = steps.find(step => fit(step, unpagedLines).room >= count)
  let hints = unpagedHints
  let hintLines = unpagedLines
  let pageSize = Math.max(1, count)
  if (chosen === undefined) {
    chosen = steps[steps.length - 1]!
    const guess = Math.max(1, fit(chosen, hintLineCount(hintsFor(true, []), width, 2)).room)
    const pagedHints = (size: number, page: number) =>
      hintsFor(
        true,
        d.options.filter(o => digitOf(o.id) !== undefined && Math.floor((o.id - 1) / size) !== page).map(o => o.id),
      )
    const firstPage = pageFor(view, guess, count)
    hints = pagedHints(guess, firstPage)
    hintLines = hintLineCount(hints, width, 2)
    pageSize = Math.max(1, fit(chosen, hintLines).room)
    hints = pagedHints(pageSize, pageFor(view, pageSize, count))
    hintLines = hintLineCount(hints, width, 2)
    pageSize = Math.max(1, fit(chosen, hintLines).room)
  }
  const pages = Math.max(1, Math.ceil(count / pageSize))
  const page = pageFor(view, pageSize, count)
  const { contextRows } = fit(chosen, hintLines)
  const context = view.isContextOpen
    ? fullContext.slice(0, contextRows)
    : compact
      ? view.highlight === undefined
        ? [truncateLine(d.scenario.replace(/\s+/g, ' '), width)]
        : []
      : capLines(d.scenario, width, contextRows).lines

  return {
    compact,
    rules: chosen.rules,
    context,
    hasMore,
    page,
    pageSize,
    pages,
    shown: d.options.slice(page * pageSize, (page + 1) * pageSize),
    offPage: pages > 1 ? d.options.filter(o => digitOf(o.id) !== undefined && Math.floor((o.id - 1) / pageSize) !== page).map(o => o.id) : [],
    hints,
    hintLines,
    keysOff,
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

/**
 * A digit key or a press on an option. With the ring already on that option it is
 * confirmed (that is also how `enter` arrives); otherwise the digit is read through
 * `highlightFor`, so `1` then `2` is 12, and the option is highlighted.
 */
export async function pressOption($: any, d: Decision, option: number, choose: (option: number) => Promise<void>, pageSize: number): Promise<void> {
  const view = await readView($)
  if (view.ring === `opt:${option}`) {
    await choose(option)

    return
  }
  const digit = digitOf(option)
  const result = digit === undefined ? { option, typed: undefined } : highlightFor(digit, Date.now(), typing.typed, d.options.length)
  typing.typed = result.typed
  typing.option = result.option
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

/** One decision: header, context, the options with the highlighted one in a card, and the key hints. Returns an element tree. */
export function DecisionView($: any, props: Props): any {
  const { ui, d, view, width, readyCount, onChanged, onLeave, onSend, onHide } = props
  const { Box, Text, Button, Input } = ui
  const isFocused = props.isFocused === true
  const isSent = d.state === 'sent'
  const chosen = d.answer?.option
  const layout = decisionLayout(d, view, width, props.rows ?? 30, isFocused, readyCount, props.all ?? [])
  const { compact } = layout
  const inner = width - cardInset(compact)

  const choose = async (option: number) => {
    if (isSent) {
      return
    }
    const done = await chooseAndReopen($, d, option)
    if (done) {
      typing.typed = undefined
      typing.option = undefined
      await setView($, v => ({ ...v, screen: 'list', decisionId: undefined, highlight: undefined, ring: undefined, compactPage: 0, isContextOpen: false, notice: done.notice }))
      onChanged()
      onLeave()
    }
  }
  const handlers: Handlers = {
    discuss: async () => {
      await setView($, v => ({
        ...v,
        screen: 'thread',
        isAsking: (v.drafts[d.id] ?? '') !== '',
        isMarking: false,
        revisionIndex: undefined,
        threadSkip: 0,
        notice: undefined,
      }))
      focusLater($, (view.drafts[d.id] ?? '') !== '' ? 'ask-input' : 'ask')
    },
    recommend: async () => {
      const option = d.recommendation?.option
      if (option !== undefined && d.options.some(o => o.id === option)) {
        typing.option = option
        await highlightOption($, option, layout.pageSize, await readView($))
      }
    },
    moreOptions: async () => {
      typing.typed = undefined
      await setView($, v => ({ ...v, highlight: undefined, compactPage: (layout.page + 1) % layout.pages }))
      focusLater($, 'discuss')
    },
    digit: async (option: number) => {
      const digit = digitOf(option)!
      const result = highlightFor(digit, Date.now(), typing.typed, d.options.length)
      typing.typed = result.typed
      typing.option = result.option
      if (result.option !== undefined) {
        await highlightOption($, result.option, layout.pageSize, await readView($))
      }
    },
    more: () => void setView($, v => ({ ...v, isContextOpen: !v.isContextOpen })),
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
    send: onSend,
    hide: onHide,
  }
  const hints = decisionHints(
    { d, view, isFocused, readyCount, isPaged: layout.pages > 1, offPage: layout.offPage, hasMore: layout.hasMore },
    handlers,
  )

  const optionRow = (o: Decision['options'][number]) => {
    const isHighlighted = view.highlight === o.id
    const isChosen = chosen === o.id
    const isRecommended = d.recommendation?.option === o.id
    const digit = digitOf(o.id)
    const tag = isRecommended ? '  recommended' : ''
    const after = isChosen ? ' chosen' : ''
    const numberWidth = `${o.id}: `.length
    const room = Math.max(4, (isHighlighted ? inner : width) - 3 - numberWidth - tag.length - after.length)
    const label = truncateLine(o.label, room)
    const color = compact && isHighlighted ? 'claude' : undefined
    const row = (
      <Box key={`line:${o.id}`}>
        <Text color={color}>{`${ringMark(`opt:${o.id}`, view.ring, isFocused)}${isChosen ? '✓' : ' '} `}</Text>
        <Button key={`opt:${o.id}`} hotkey={isSent ? undefined : digit} plain onPress={() => void pressOption($, d, o.id, choose, layout.pageSize)}>
          {digit === undefined || isSent ? <Text color="suggestion">{`${o.id}: `}</Text> : ''}
          {chosen !== undefined && !isChosen ? <Text dimColor>{label}</Text> : <Text color={color}>{label}</Text>}
          {isRecommended ? <Text color="success">{tag}</Text> : ''}
          {isChosen ? <Text dimColor>{after}</Text> : ''}
        </Button>
      </Box>
    )
    if (!isHighlighted) {
      return row
    }
    const lines = cardLines(d, o.id, inner, compact)

    return Card(ui, compact, `card:${o.id}`, [
      row,
      ...lines.map((line, index) => (
        <Text key={`card:${o.id}:${index}`} dimColor>
          {compact ? `   ${line}` : line}
        </Text>
      )),
    ])
  }

  const hintBlock = KeyHints(ui, hints, width, 2)
  const contextBlock = layout.context.map((line, index) => (
    <Text key={`context:${index}`} dimColor={compact}>
      {line}
    </Text>
  ))

  return (
    <Box flexDirection="column">
      {Header(ui, d.title, isFocused, crumbFor(d), width)}
      {layout.keysOff.map((line, index) => (
        <Text key={`keys-off:${index}`} dimColor>
          {line}
        </Text>
      ))}
      {compact ? hintBlock : null}
      {compact && layout.rules ? Rule(ui, width, 'rule:top') : null}
      {!compact && layout.rules ? Rule(ui, width, 'rule:header') : null}
      {contextBlock}
      {d.kind === 'question' && !d.isTask && !isSent ? <Text dimColor>Type your answer in the discussion, then d and enter.</Text> : null}
      {!compact && layout.rules ? Rule(ui, width, 'rule:context') : null}
      {layout.shown.map(optionRow)}
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
      {!compact && layout.rules ? Rule(ui, width, 'rule:options') : null}
      {compact ? null : hintBlock}
    </Box>
  )
}

async function onBack($: any, onLeave: () => void): Promise<void> {
  const next = await back($, await readView($))
  await setView($, () => ({ ...next, ...(next.screen === 'list' ? { compactPage: 0, isContextOpen: false, ring: undefined } : {}) }))
  if (next.screen === 'list') {
    onLeave()
  }
}
