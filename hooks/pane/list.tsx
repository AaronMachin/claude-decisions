import type { PaneView } from '../../types'
import type { Decision } from '../store'
import { focusLater, openDecision, readView, ringMark, setView } from './decision'
import { previewLines } from '../send'
import { SETTLED_TEXT } from '../discuss'
import { KeyHints, Rule, capLines, isCompact, wrapLines } from './look'
import type { Hint } from './look'
import { ago, hasUnread, unreadReplies, when } from './seen'
import type { Seen } from './seen'
import { Bar, SELECTED_BG, barColour, colourProps } from './style'
import { FOLDED, answeredRoom, assumptionsIn, firstKey, foldAll, foldedRows, isWaiting, movePage, pageOf, pageSize, sectionsFor, toggleSection } from './sections'

/** `hasUnread`: a decision in it has a reply from Claude the person hasn't opened (its chip ends ●). */
export type Tab = { key: string; label: string; decisions: Decision[]; hasUnread?: boolean }

const HIDDEN: Decision['state'][] = ['superseded', 'withdrawn']

/**
 * One tab per group in the order each first appeared, then "Other" (no group),
 * then "For you to do" (tasks, wherever they came from), then "Parked". A parked
 * decision shows only in "Parked".
 */
export function tabsFor(all: Decision[], seen: Seen = {}): Tab[] {
  const groups = new Map<string, Tab>()
  const other: Decision[] = []
  const parked: Decision[] = []
  const tasks: Decision[] = []

  for (const d of [...all].sort((a, b) => a.number - b.number)) {
    if (HIDDEN.includes(d.state)) {
      continue
    }
    if (d.state === 'parked') {
      parked.push(d)
    } else if (d.isTask === true) {
      tasks.push(d)
    } else if (d.group === undefined || d.group.trim() === '') {
      other.push(d)
    } else {
      const tab = groups.get(d.group) ?? { key: `g:${d.group}`, label: d.group, decisions: [] }
      tab.decisions.push(d)
      groups.set(d.group, tab)
    }
  }
  const tabs = [...groups.values()]
  if (other.length > 0) {
    tabs.push({ key: 'other', label: 'Other', decisions: other })
  }
  if (tasks.length > 0) {
    tabs.push({ key: 'todo', label: 'For you to do', decisions: tasks })
  }
  if (parked.length > 0) {
    tabs.push({ key: 'parked', label: 'Parked', decisions: parked })
  }

  return tabs.map(t => ({ ...t, hasUnread: t.decisions.some(d => isWaiting(d) && hasUnread(d, seen)) }))
}

export { sectionsFor }

export function counts(all: Decision[]): { open: number; ready: number; parked: number } {
  return {
    open: all.filter(d => isWaiting(d) && d.section === 'needs-you').length,
    ready: all.filter(d => d.state === 'ready').length,
    parked: all.filter(d => d.state === 'parked').length,
  }
}

/** The status line: undefined (cleared) when nothing is open, ready or parked; "nothing needs you" leads when only ready or parked ones are left. The engine already puts the mod's name in front. */
export function statusText(all: Decision[]): string | undefined {
  const { open, ready, parked } = counts(all)
  if (open + ready + parked === 0) {
    return undefined
  }

  return [open > 0 ? `${open} open` : 'nothing needs you', ready > 0 ? `${ready} not sent` : '', parked > 0 ? `${parked} parked` : '']
    .filter(Boolean)
    .join(' · ')
}

/** The key of the tab after `current`, wrapping; the first when `current` isn't there. */
export function nextTab(tabs: Tab[], current: string | undefined): string | undefined {
  if (tabs.length === 0) {
    return undefined
  }
  const index = tabs.findIndex(t => t.key === current)

  return tabs[(index + 1) % tabs.length]?.key
}

/**
 * The tabs that fit in one row, always including the open one, and whether any are
 * cut off at either end (drawn as `‹` and `›`).
 */
export function visibleTabs(tabs: Tab[], activeKey: string | undefined, width: number): { shown: Tab[]; hasLeft: boolean; hasRight: boolean } {
  const cost = (t: Tab) => tabChipText(t).length + 1
  if (tabs.reduce((sum, t) => sum + cost(t), 0) <= width) {
    return { shown: tabs, hasLeft: false, hasRight: false }
  }
  let from = Math.max(0, tabs.findIndex(t => t.key === activeKey))
  let to = from
  let used = cost(tabs[from]!) + 2
  for (;;) {
    const right = tabs[to + 1]
    const left = tabs[from - 1]
    if (right && used + cost(right) <= width) {
      to += 1
      used += cost(right)
    } else if (left && used + cost(left) <= width) {
      from -= 1
      used += cost(left)
    } else {
      break
    }
  }

  return { shown: tabs.slice(from, to + 1), hasLeft: from > 0, hasRight: to < tabs.length - 1 }
}

/** The decisions in a tab that wait for the person: open or live, in Needs you. */
export function openCount(t: Tab): number {
  return t.decisions.filter(d => isWaiting(d) && d.section === 'needs-you').length
}

/** The tab holding the newest decision that waits for the person, or none. */
export function newestOpenTab(tabs: Tab[]): Tab | undefined {
  let best: { tab: Tab; number: number } | undefined
  for (const tab of tabs) {
    for (const d of tab.decisions) {
      if (isWaiting(d) && d.section === 'needs-you' && (best === undefined || d.number > best.number)) {
        best = { tab, number: d.number }
      }
    }
  }

  return best?.tab
}

/** The longest a tab's name is drawn before it is cut. */
export const TAB_LABEL_MAX = 24

/** A tab as a chip: its name, cut at 24 columns, and how many wait for the person when any do, with a space either side. */
export function tabChipText(t: Tab): string {
  const open = openCount(t)

  return ` ${truncate(t.label, TAB_LABEL_MAX)}${open > 0 ? ` ${open}` : ''}${t.hasUnread ? ' ●' : ''} `
}

/** The open tab: the one the view names, else the one holding the newest decision that waits, else the first. */
export function activeTab(tabs: Tab[], view: PaneView): Tab | undefined {
  return tabs.find(t => t.key === view.tab) ?? newestOpenTab(tabs) ?? tabs[0]
}

/** When the open tab has nothing waiting but another has: that tab and its count, for "2 waiting in <tab>". */
export function waitingElsewhere(tabs: Tab[], current: Tab | undefined): { tab: Tab; count: number } | undefined {
  if (current !== undefined && openCount(current) > 0) {
    return undefined
  }
  const tab = newestOpenTab(tabs)

  return tab === undefined || tab.key === current?.key ? undefined : { tab, count: openCount(tab) }
}

export function truncate(text: string, width: number): string {
  return text.length <= width ? text : text.slice(0, Math.max(0, width - 1)) + '…'
}

/** Ticks or unticks one id. */
export function toggleTick(ticked: string[], id: string): string[] {
  return ticked.includes(id) ? ticked.filter(t => t !== id) : [...ticked, id]
}

/**
 * The review screen opens with every ready decision ticked, the ring on the first (its autoFocus) and on the first page.
 * With `only`, it is the preview for that one decision (221): only it is ticked, `decisionId` keeps which, and the ring is on send.
 */
export function openReview(view: PaneView, readyIds: string[], only?: string): PaneView {
  if (only !== undefined) {
    return { ...view, screen: 'review', decisionId: only, ticked: [only], answerBox: undefined, notice: undefined, compactPage: 0, ring: 'confirm', isLastOne: false }
  }

  return { ...view, screen: 'review', decisionId: undefined, ticked: readyIds, notice: undefined, compactPage: 0, ring: readyIds[0] === undefined ? undefined : `tick:${readyIds[0]}`, isLastOne: false }
}

/** The person answered the last waiting decision (row 270): the Send screen with every ready answer ticked and the ring on send. */
export function openLastOne(view: PaneView, readyIds: string[]): PaneView {
  return { ...openReview(view, readyIds), decisionId: undefined, highlight: undefined, answerBox: undefined, ring: 'confirm', isLastOne: true }
}

function chosenText(d: Decision): string {
  const o = d.options.find(x => x.id === d.answer?.option)

  if (o) {
    return `✓ ${o.id} ${o.label}`
  }

  return d.answer?.text !== undefined && d.answer.text !== SETTLED_TEXT ? '✓ Something else' : '✓ discussed'
}

/** The right-hand part of a list row: wide panes say more. */
export function rowMeta(d: Decision, width: number): string {
  const isWide = width >= 70
  if (d.state === 'ready') {
    return isWide ? `${chosenText(d)} · not sent yet` : `${chosenText(d)}  not sent`
  }
  if (d.state === 'sent') {
    return isWide ? `${chosenText(d)} · sent` : `${chosenText(d)}  sent`
  }
  if (d.state === 'parked') {
    return ''
  }
  const what = d.kind === 'question' ? 'question' : `${d.options.length} options`

  return isWide ? [what, d.state, d.blocks ? 'blocking' : ''].filter(Boolean).join(' · ') : ''
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "6 Nov" (the person's local day) from a stored time, or undefined when it is not a date. */
export function parkedOn(at: string): string | undefined {
  const date = new Date(at)

  return Number.isNaN(date.getTime()) ? undefined : `${date.getDate()} ${MONTHS[date.getMonth()]}`
}

/** The dim line under a parked or reopened row, or undefined. The Parked tab adds the group, since it holds every group's parked decisions. */
export function secondLine(d: Decision, isParkedTab: boolean): string | undefined {
  if (d.state === 'parked') {
    const reason = d.parkedReason ?? 'parked'
    const on = d.parkedAt === undefined ? undefined : parkedOn(d.parkedAt)
    const when = on === undefined ? '' : ` · parked ${on}`

    return isParkedTab ? `${d.group ?? 'Other'} · ${reason}${when}` : `parked: ${reason}${when}`
  }
  if (d.reopenedBy !== undefined && isWaiting(d)) {
    return `reopened because ${d.reopenedBy.id} changed`
  }

  return undefined
}

/** The line under a row with an unread reply: who, how long ago, and the first line of the newest one. */
export function unreadLine(d: Decision, seen: Seen, now: Date = new Date()): string | undefined {
  const last = unreadReplies(d, seen[d.id]).at(-1)
  if (last === undefined) {
    return undefined
  }

  return `${last.who} · ${ago(last.at, now)}: ${last.text.split('\n')[0]}`
}

/** The answer in the person's words: `1 Red · only if in stock`, `Something else: …`, or `discussed`. */
export function answerWords(d: Decision): string {
  const o = d.options.find(x => x.id === d.answer?.option)
  if (o) {
    return d.answer?.condition !== undefined ? `${o.id} ${o.label} · only if ${d.answer.condition}` : `${o.id} ${o.label}`
  }
  if (d.answer?.text === undefined) {
    return ''
  }

  return d.answer.text === SETTLED_TEXT ? 'discussed' : `${SOMETHING_ELSE_WORDS}: ${d.answer.text}`
}

const SOMETHING_ELSE_WORDS = 'Something else'

/**
 * A row's second line on a tall pane (row 251): the unread reply in `claude`; a parked or reopened row's own line;
 * a sent row's `↗ sent 12:04 · <answer>`; else the kind, how long ago it was asked and, once answered, the answer.
 */
export function rowSecondLine(d: Decision, seen: Seen, now: Date = new Date(), isParkedTab = false): { text: string; colour?: string } {
  const reply = isWaiting(d) && hasUnread(d, seen) ? unreadLine(d, seen, now) : undefined
  if (reply !== undefined) {
    return { text: reply, colour: 'claude' }
  }
  const own = secondLine(d, isParkedTab)
  if (own !== undefined) {
    return { text: own }
  }
  const answer = answerWords(d)
  if (d.state === 'sent') {
    return { text: [`↗ sent${d.sentAt ? ` ${when(d.sentAt, now)}` : ''}`, answer].filter(Boolean).join(' · ') }
  }
  const age = ago(d.createdAt, now)

  return { text: [d.isTask ? 'to do' : d.kind, age === '' ? '' : `asked ${age}`, d.state === 'ready' ? answer : ''].filter(Boolean).join(' · ') }
}

/** Up to three of the latest sent decisions, newest first, for the all-clear (row 252, extra 6). */
export function allClear(all: Decision[]): Decision[] {
  return all
    .filter(d => d.state === 'sent' && d.sentAt !== undefined)
    .map((d, index) => ({ d, index }))
    .sort((a, b) => (a.d.sentAt === b.d.sentAt ? a.index - b.index : a.d.sentAt! < b.d.sentAt! ? 1 : -1))
    .slice(0, 3)
    .map(x => x.d)
}

/** `Last sent 12:04 · 2 answers`: the newest send and how many answers went with it. */
export function lastSentLine(all: Decision[]): string | undefined {
  const latest = allClear(all)[0]
  if (latest === undefined) {
    return undefined
  }
  const count = all.filter(d => d.state === 'sent' && d.sentAt === latest.sentAt).length

  return `Last sent ${when(latest.sentAt!)} · ${count} ${count === 1 ? 'answer' : 'answers'}`
}

/** The title lines a tall row draws: the id and title wrapped onto at most two lines, cut with `…` past that (row 258). */
export function titleLines(d: Decision, room: number): string[] {
  return capLines(`${d.id} ${d.title}`, room, 2).lines
}

/** The receipt on a sent decision: the first line of what Claude did next (row 252, extra 4). */
export function receiptOf(d: Decision): string | undefined {
  return d.state === 'sent' ? d.thread.findLast(e => e.who === 'receipt')?.text : undefined
}

/** Lines a row takes: one on a compact pane; tall, its title lines, the second line and a sent row's receipt. */
export function rowLines(d: Decision, width: number, compact: boolean): number {
  return compact ? 1 : titleLines(d, width - 5).length + 1 + (receiptOf(d) !== undefined ? 1 : 0)
}

/** One row, padded so the meta sits at the right edge. The meta is left out when the title wouldn't fit whole beside it (row 168). */
export function rowText(d: Decision, width: number): string {
  const meta = rowMeta(d, width)
  const left = `${d.id}  ${d.title}`
  const room = width - 2 - (meta === '' ? 0 : meta.length + 2)

  return meta === '' || left.length > room ? truncate(left, width - 2) : `${left.padEnd(room)}  ${meta}`
}

type ListProps = {
  ui: { Box: any; Text: any; Button: any }
  tabs: Tab[]
  view: PaneView
  width: number
  readyCount: number
  unreadable: number
  /** The pane's rows (`scroll.bodyRows`), so an open section can be paged to fit. */
  rows?: number
  /** The pane has the keys, so the ring (and its `›`) is shown. */
  isFocused?: boolean
  /** When each decision was last opened, for the ● and the reply line. */
  seen?: Seen
  /** The order to keep while the pane has the keys. */
  frozen?: string[]
  onSend: () => void
  onHide: () => void
}

/** Changes tab and, once it is drawn, puts the ring on its first row, so the ring is never left on a row that went. */
async function showTab($: any, tabs: Tab[], key: string | undefined): Promise<void> {
  await setView($, v => ({ ...foldAll(v), tab: key }))
  const target = tabs.find(t => t.key === key)
  const first = waitingElsewhere(tabs, target) ? 'goto-waiting' : firstKey(target)
  if (first) {
    focusLater($, first)
  }
}

/** The tab row and the open tab's decisions. Returns an element tree. */
export function ListView($: any, props: ListProps): any {
  const { ui, tabs, view, width, readyCount, unreadable, onSend, onHide } = props
  const rows = props.rows ?? 30
  const { Box, Text, Button } = ui
  const tab = activeTab(tabs, view)
  const seen = props.seen ?? {}
  const sections = tab ? sectionsFor(tab, seen, props.frozen) : { needsYou: [], claudesCall: [], alreadyDecided: [], answered: [], parked: [] }
  const elsewhere = waitingElsewhere(tabs, tab)
  const isIdle = newestOpenTab(tabs) === undefined
  const first = elsewhere
    ? undefined
    : (sections.needsYou[0] ?? sections.parked[0] ?? (sections.claudesCall.length + sections.alreadyDecided.length > 0 ? undefined : sections.answered[0]))
  const isParkedTab = tab?.key === 'parked'
  const batch = tab && !isParkedTab ? assumptionsIn(tab) : []
  const tabRow = visibleTabs(tabs, tab?.key, width)
  const isFocused = props.isFocused === true
  const compact = isCompact(rows)
  const mark = (key: string) => `${ringMark(key, view.ring, isFocused)} `
  // Tall, the look adds a rule above the tabs and the ringed row is a card two rows taller. Compact, the rules
  // and the blank line before the keys go, so the list fits 9 rows.
  // Tall, the look adds a rule above the tabs. Compact, the rules and the blank line before the keys go, so the list fits 9 rows.
  const lookRows = compact ? -2 : 1

  const row = (d: Decision) => {
    const isUnread = isWaiting(d) && hasUnread(d, seen)
    const isRinged = isFocused && view.ring === `row:${d.id}`
    const look = { ...(d.state === 'sent' ? { dimColor: true } : {}), ...(isRinged ? { backgroundColor: SELECTED_BG } : {}), bold: isUnread || undefined }
    // The bar, the ring's mark and a space come before the text.
    const room = width - 3 - (isUnread ? 2 : 0)
    const dot = isUnread ? <Text color="claude">● </Text> : ''
    if (compact) {
      return (
        <Box key={`box:${d.id}`}>
          {Bar(ui, barColour(d), `bar:${d.id}`)}
          <Button key={`row:${d.id}`} plain autoFocus={d === first ? true : undefined} onPress={() => openDecision($, d, tab?.key)}>
            {mark(`row:${d.id}`)}
            {dot}
            <Text {...look}>{rowText(d, room + 2)}</Text>
          </Button>
        </Box>
      )
    }
    const lines = titleLines(d, room)
    const firstLine = lines[0] ?? d.id
    const second = rowSecondLine(d, seen, new Date(), isParkedTab)

    return (
      <Box key={`box:${d.id}`} flexDirection="column">
        <Box key={`line:${d.id}`}>
          {Bar(ui, barColour(d), `bar:${d.id}`)}
          <Button key={`row:${d.id}`} plain autoFocus={d === first ? true : undefined} onPress={() => openDecision($, d, tab?.key)}>
            {mark(`row:${d.id}`)}
            {dot}
            <Text {...look}>
              <Text bold>{d.id}</Text>
              {firstLine.slice(d.id.length)}
            </Text>
          </Button>
        </Box>
        {lines.slice(1).map((line, index) => (
          <Box key={`more:${d.id}:${index}`}>
            {Bar(ui, barColour(d))}
            <Text {...look}>{`  ${isUnread ? '  ' : ''}${line}`}</Text>
          </Box>
        ))}
        <Box key={`under:${d.id}`}>
          {Bar(ui, barColour(d))}
          <Text key={`second:${d.id}`} {...colourProps(second.colour ?? 'dim')}>
            {truncate(`  ${second.text}`, width - 1)}
          </Text>
        </Box>
        {receiptOf(d) !== undefined ? (
          <Box key={`receipt:${d.id}`}>
            {Bar(ui, barColour(d))}
            <Text dimColor>{truncate(`  claude: ${receiptOf(d)}`, width - 1)}</Text>
          </Box>
        ) : null}
      </Box>
    )
  }
  const heading = (name: string, count: number, markText?: string, markColour?: string) => (
    <Text key={`heading:${name}`}>
      {markText ? <Text color={markColour}>{`${markText} `}</Text> : ''}
      <Text bold>{name}</Text>
      <Text dimColor>{` · ${count}`}</Text>
    </Text>
  )
  const lines = (d: Decision) => rowLines(d, width, compact)
  const recent = isIdle ? allClear(tabs.flatMap(t => t.decisions)) : []
  const recentIds = new Set(recent.map(d => d.id))
  const answeredRows = sections.answered.filter(d => !recentIds.has(d.id))
  const lastSent = isIdle ? lastSentLine(tabs.flatMap(t => t.decisions)) : undefined
  const clearRows = isIdle ? (lastSent ? 1 : 0) + recent.reduce((n, d) => n + lines(d), 0) + 1 : 0
  // Tall rows take two lines or three, so a page holds rows by their tallest.
  const perRow = (list: Decision[]) => (compact ? 1 : Math.max(2, ...list.map(lines)))
  const elsewhereRows = elsewhere ? 1 : 0
  const needsReserve = 13 + lookRows + elsewhereRows + clearRows + (view.openSection !== undefined ? 5 : 0)
  const needsSize = Math.max(1, Math.floor(pageSize(rows, needsReserve) / perRow(sections.needsYou)))
  const needsPaged = sections.needsYou.length > needsSize
  const needsPage = pageOf(sections.needsYou, view.openSection === undefined ? view.sectionPage : 0, needsSize)
  const needsShown = needsPaged ? needsPage.rows : sections.needsYou
  const needsYouLines = needsShown.reduce((n, d) => n + lines(d), 0) + clearRows
  const answeredRoomLines = answeredRoom(rows, needsYouLines, view.openSection !== undefined)
  const answeredShown: Decision[] = []
  for (let used = 0, i = 0; i < answeredRows.length && (answeredShown.length === 0 || used + lines(answeredRows[i]!) <= answeredRoomLines); i++) {
    if (used + lines(answeredRows[i]!) > answeredRoomLines && answeredShown.length === 0 && !compact && answeredRoomLines < 2) {
      break
    }
    answeredShown.push(answeredRows[i]!)
    used += lines(answeredRows[i]!)
  }
  const answeredHidden = answeredRows.length - answeredShown.length
  const answeredLines = answeredShown.reduce((n, d) => n + lines(d), 0)
  const fixedRows = 9 + lookRows + elsewhereRows + needsYouLines + (answeredShown.length === 0 ? 0 : answeredLines + 1 + (answeredHidden > 0 ? 1 : 0)) + (batch.length >= 2 ? 1 : 0)
  const size = (list: Decision[]) => Math.max(1, Math.floor(pageSize(rows, fixedRows) / perRow(list)))
  const foldedHeading = (f: (typeof FOLDED)[number]) => {
    const all = tab ? foldedRows(tab, f.section) : []
    if (all.length === 0) {
      return null
    }
    const isOpen = view.openSection === f.section
    const sized = size(all)
    const page = pageOf(all, view.sectionPage, sized)

    return (
      <Box key={`fold:${f.section}`} flexDirection="column">
        <Button
          key={`section:${f.section}`}
          plain
          autoFocus={first === undefined && !elsewhere && f === FOLDED.find(x => tab && foldedRows(tab, x.section).length > 0) ? true : undefined}
          onPress={() => setView($, v => toggleSection(v, f.section))}
        >
          {mark(`section:${f.section}`)}
          <Text dimColor>{`${isOpen ? '▾' : '▸'} ${f.name} · ${all.length}`}</Text>
        </Button>
        {isOpen ? page.rows.map(row) : null}
        {isOpen && (page.hasEarlier || page.hasNext) ? (
          <Box>
            {page.hasEarlier ? (
              <Button key="o" hotkey="o" plain onPress={() => setView($, v => movePage(v, -1, all.length, sized))}>
                {'o earlier  '}
              </Button>
            ) : null}
            {page.hasNext ? (
              <Button key="n" hotkey="n" plain onPress={() => setView($, v => movePage(v, 1, all.length, sized))}>
                {`n next ${Math.min(sized, page.remaining)} more`}
              </Button>
            ) : null}
          </Box>
        ) : null}
      </Box>
    )
  }

  const hints: Hint[] = [
    { id: 't', keyText: 't', label: 'next tab', hotkey: 't', onPress: () => void showTab($, tabs, nextTab(tabs, tab?.key)) },
    ...(readyCount > 0 ? [{ id: 's', keyText: 's', label: `send ${readyCount}`, hotkey: 's', onPress: onSend }] : []),
    { id: 'h', keyText: 'h', label: 'hide', hotkey: 'h', onPress: onHide },
  ]

  if (tabs.length === 0) {
    return (
      <Box flexDirection="column">
        <Text dimColor>No decisions yet. Claude adds them here when it needs you.</Text>
        {KeyHints(ui, hints.filter(hint => hint.id === 'h'), width, 1)}
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      {compact ? null : Rule(ui, width, 'rule:tabs')}
      <Box>
        {tabRow.hasLeft ? <Text dimColor>‹ </Text> : null}
        {tabRow.shown.map(t => (
          <Button
            key={`tab:${t.key}`}
            plain
            onPress={() => void showTab($, tabs, t.key)}
          >
            {t.key === tab?.key ? (
              <Text backgroundColor="claude" color="inverseText" bold>
                {tabChipText(t)}
              </Text>
            ) : (
              <Text backgroundColor="subtle" color="text">
                {tabChipText(t)}
              </Text>
            )}
            {' '}
          </Button>
        ))}
        {tabRow.hasRight ? <Text dimColor>›</Text> : null}
      </Box>
      {compact ? null : Rule(ui, width, 'rule:sections')}
      {isIdle ? (
        readyCount > 0 ? (
          // Until they are sent nothing says done (row 270).
          <Text key="idle" color="warning">
            {truncate(`${readyCount} answer${readyCount === 1 ? '' : 's'} not sent yet · s sends them`, width)}
          </Text>
        ) : (
          <Text key="idle" color="success">
            {truncate('✓ Nothing needs you', width)}
          </Text>
        )
      ) : isParkedTab ? null : heading('Needs you', sections.needsYou.length, '◆')}
      {lastSent ? <Text key="last-sent" dimColor>{truncate(lastSent, width)}</Text> : null}
      {recent.map(row)}
      {isIdle ? <Text key="land-here" dimColor>New decisions land here.</Text> : null}
      {elsewhere ? (
        <Button key="goto-waiting" plain autoFocus onPress={() => void showTab($, tabs, elsewhere.tab.key)}>
          {mark('goto-waiting')}
          <Text color="claude">{truncate(`${elsewhere.count} waiting in ${elsewhere.tab.label} · enter`, width - 2)}</Text>
        </Button>
      ) : null}
      {batch.length >= 2 ? (
        <Button
          key="batch"
          plain
          onPress={async () => {
            await setView($, v => ({ ...v, screen: 'batch', marks: {}, batchRow: undefined, compactPage: 0, ring: `batch:${batch[0]!.id}`, notice: undefined }))
            focusLater($, `batch:${batch[0]!.id}`)
          }}
        >
          {`${mark('batch')}Check ${batch.length} assumptions together (enter)`}
        </Button>
      ) : null}
      {needsShown.map(row)}
      {needsPaged && view.openSection === undefined && (needsPage.hasEarlier || needsPage.hasNext) ? (
        <Box>
          {needsPage.hasEarlier ? (
            <Button key="o" hotkey="o" plain onPress={() => setView($, v => movePage(v, -1, sections.needsYou.length, needsSize))}>
              {'o earlier  '}
            </Button>
          ) : null}
          {needsPage.hasNext ? (
            <Button key="n" hotkey="n" plain onPress={() => setView($, v => movePage(v, 1, sections.needsYou.length, needsSize))}>
              {`n next ${Math.min(needsSize, needsPage.remaining)} more`}
            </Button>
          ) : null}
        </Box>
      ) : null}
      {needsPaged && view.openSection !== undefined ? (
        <Text dimColor>{truncate(`     ${sections.needsYou.length - needsShown.length} more need you: fold the open section to page them`, width - 2)}</Text>
      ) : null}
      {FOLDED.map(foldedHeading)}
      {sections.parked.length > 0 ? heading('Parked', sections.parked.length) : null}
      {sections.parked.map(row)}
      {answeredRows.length > 0 ? heading('Answered', answeredRows.length, '✓', 'success') : null}
      {answeredShown.map(row)}
      {answeredHidden > 0 ? <Text dimColor>{`     ${answeredHidden} more answered`}</Text> : null}
      {unreadable > 0 ? <Text dimColor>{`${unreadable} decision file${unreadable === 1 ? '' : 's'} couldn't be read`}</Text> : null}
      {compact ? null : Rule(ui, width, 'rule:keys')}
      {KeyHints(ui, hints, width, 1)}
    </Box>
  )
}

type ReviewProps = {
  ui: { Box: any; Text: any; Button: any }
  ready: Decision[]
  view: PaneView
  width: number
  /** The pane's rows: under the compact threshold the keys go under the heading and the ticks are paged. */
  rows?: number
  /** Called with the ticked ids, only when at least one is ticked. */
  onConfirm: (ids: string[]) => void
  /** Called when the screen goes back to the list. */
  onLeave: () => void
  /** The pane has the keys, so the ring (and its `›`) is shown. */
  isFocused?: boolean
}

/** Rows the compact Send screen keeps for itself: the pane's header, its heading and the key line. */
const REVIEW_COMPACT_FIXED = 3

/** "1 other answer stays ready and isn't sent.", or nothing when no other is ready. */
export function othersLine(others: number): string | undefined {
  if (others === 0) {
    return undefined
  }

  return others === 1 ? "1 other answer stays ready and isn't sent." : `${others} other answers stay ready and aren't sent.`
}

/**
 * The Send screen for one answered decision (221): exactly the block Claude gets, what stays behind, and
 * send or back. The block is cut with `…` to fit the pane.
 */
function SendOneView($: any, props: ReviewProps, d: Decision): any {
  const { ui, ready, view, width, onConfirm } = props
  const { Box, Text, Button } = ui
  const isFocused = props.isFocused === true
  const rows = props.rows ?? 30
  const compact = isCompact(rows)
  const others = othersLine(ready.filter(x => x.id !== d.id).length)
  const otherLines = others ? wrapLines(others, width) : []
  // Pane header, title, "Exactly what" and the keys; tall adds two rules and the keys' own line.
  const fixed = (compact ? 4 : 7) + (isFocused ? 0 : 1) + otherLines.length
  const lines = previewLines(d).flatMap(line => wrapLines(line, width))
  const room = Math.max(1, rows - fixed)
  const shown = lines.length <= room ? lines : [...lines.slice(0, room - 1), `${truncate(lines[room - 1] ?? '', width - 1)}…`]
  const back = async () => {
    await setView($, v => ({ ...v, screen: 'decision', ticked: [], compactPage: 0, ring: v.highlight === undefined ? undefined : `opt:${v.highlight}` }))
    const v = await readView($)
    if (v.highlight !== undefined) {
      focusLater($, `opt:${v.highlight}`)
    }
  }

  return (
    <Box flexDirection="column">
      <Text bold>{truncate('Send this decision to Claude', width)}</Text>
      {compact ? null : Rule(ui, width, 'rule:send')}
      <Text>Exactly what Claude gets:</Text>
      {shown.map((line, index) => (
        <Text key={`preview:${index}`} dimColor>
          {line}
        </Text>
      ))}
      {otherLines.map((line, index) => (
        <Text key={`others:${index}`}>{line}</Text>
      ))}
      {compact ? null : Rule(ui, width, 'rule:send-keys')}
      <Box>
        <Button key="confirm" variant="primary" autoFocus onPress={() => onConfirm([d.id])}>
          {`${ringMark('confirm', view.ring, isFocused)}enter: send it  `}
        </Button>
        <Button key="b" hotkey="b" plain onPress={() => void back()}>
          {'back'}
        </Button>
      </Box>
    </Box>
  )
}

/** The answers ready to send, each ticked; Confirm is last in the ring. Compact: keys under the heading, one line per tick, paged with `o`. Returns an element tree. */
export function ReviewView($: any, props: ReviewProps): any {
  const { ui, ready, view, width, onConfirm, onLeave } = props
  const one = view.decisionId === undefined ? undefined : ready.find(d => d.id === view.decisionId)
  if (one) {
    return SendOneView($, props, one)
  }
  const { Box, Text, Button } = ui
  const ticked = ready.filter(d => view.ticked.includes(d.id)).map(d => d.id)
  const isFocused = props.isFocused === true
  const compact = isCompact(props.rows ?? 30)
  const back = () => {
    void setView($, v => ({ ...v, screen: 'list', compactPage: 0, isLastOne: false }))
    onLeave()
  }
  const send = () => {
    if (ticked.length > 0) {
      onConfirm(ticked)
    }
  }
  const tick = (d: Decision) => () => setView($, v => ({ ...v, ticked: toggleTick(v.ticked, d.id) }))

  if (view.isLastOne === true) {
    const count = ticked.length
    // Send is drawn first and has the ring, so enter sends; b holds them. Nothing is sent without enter.
    return (
      <Box flexDirection="column">
        <Text bold>That was the last one.</Text>
        <Text>{`enter sends ${count} answer${count === 1 ? '' : 's'} to Claude, b to hold them.`}</Text>
        <Button key="confirm" variant="primary" autoFocus onPress={send}>
          {`${ringMark('confirm', view.ring, isFocused)}enter: send ${count}  `}
        </Button>
        {ready.map(d => (
          <Button key={`tick:${d.id}`} plain onPress={tick(d)}>
            {`${ringMark(`tick:${d.id}`, view.ring, isFocused)} ` + truncate(`${ticked.includes(d.id) ? '[x]' : '[ ]'} ${d.id}  ${d.title} · ${chosenText(d).replace('✓ ', '')}`, width - 2)}
          </Button>
        ))}
        <Button key="b" hotkey="b" plain onPress={back}>
          {'hold them'}
        </Button>
      </Box>
    )
  }

  if (compact) {
    const size = Math.max(1, (props.rows ?? 30) - REVIEW_COMPACT_FIXED - (isFocused ? 0 : 1))
    const pages = Math.max(1, Math.ceil(ready.length / size))
    const page = Math.min(Math.max(0, view.compactPage), pages - 1)
    const shown = ready.slice(page * size, (page + 1) * size)
    const hints: Hint[] = [
      { id: 'enter-tick', keyText: 'enter', label: 'tick' },
      ...(pages > 1 ? [{ id: 'o', keyText: 'o', label: 'more', hotkey: 'o', onPress: () => {
        const next = (page + 1) % pages
        const target = ready[next * size]
        void setView($, v => ({ ...v, compactPage: next, ring: undefined }))
        if (target) {
          focusLater($, `tick:${target.id}`)
        }
      } }] : []),
      { id: 'b', keyText: 'b', label: 'back', hotkey: 'b', onPress: back },
      { id: 'confirm', keyText: 'c', label: `send ${ticked.length}`, hotkey: 'c', onPress: send },
    ]

    return (
      <Box flexDirection="column">
        <Text bold>{truncate(`Send answers · ${ready.length} ready, ${ticked.length} ticked`, width)}</Text>
        {KeyHints(ui, hints, width, 1)}
        {shown.map((d, index) => (
          <Button key={`tick:${d.id}`} plain autoFocus={index === 0 ? true : undefined} onPress={tick(d)}>
            {`${ringMark(`tick:${d.id}`, view.ring, isFocused)} ` +
              truncate(`${ticked.includes(d.id) ? '[x]' : '[ ]'} ${d.id}  ${d.title} · ${chosenText(d).replace('✓ ', '')}`, width - 2)}
          </Button>
        ))}
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Text bold>Send answers</Text>
      {Rule(ui, width, 'rule:send')}
      {ready.map((d, index) => (
        <Box key={`box:${d.id}`} flexDirection="column">
          <Button key={`tick:${d.id}`} plain autoFocus={index === 0 ? true : undefined} onPress={tick(d)}>
            {`${ringMark(`tick:${d.id}`, view.ring, isFocused)} ` + truncate(`${ticked.includes(d.id) ? '[x]' : '[ ]'} ${d.id}  ${d.title}`, width - 4)}
          </Button>
          <Text dimColor>{truncate(`      ${chosenText(d).replace('✓ ', '')}`, width - 2)}</Text>
        </Box>
      ))}
      {Rule(ui, width, 'rule:send-keys')}
      <Text dimColor>{`${ready.length} ready, ${ticked.length} ticked. Nothing is sent until you confirm. Enter ticks or unticks a row, c sends.`}</Text>
      <Box>
        <Button key="b" hotkey="b" plain onPress={back}>
          {'back  '}
        </Button>
        <Button key="confirm" hotkey="c" variant="primary" onPress={send}>
          {`send ${ticked.length}`}
        </Button>
      </Box>
    </Box>
  )
}
