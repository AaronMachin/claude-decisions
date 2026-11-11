import type { PaneView } from '../../types'
import type { Decision } from '../store'
import { focusLater, openDecision, ringMark, setView } from './decision'
import { Card, KeyHints, Rule, cardFrame, cardInset, isCompact } from './look'
import type { Hint } from './look'
import { ago, hasUnread, unreadReplies } from './seen'
import type { Seen } from './seen'
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

  return [open > 0 ? `${open} open` : 'nothing needs you', ready > 0 ? `${ready} ready` : '', parked > 0 ? `${parked} parked` : '']
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

/** The review screen opens with every ready decision ticked, the ring on the first (its autoFocus) and on the first page. */
export function openReview(view: PaneView, readyIds: string[]): PaneView {
  return { ...view, screen: 'review', ticked: readyIds, notice: undefined, compactPage: 0, ring: readyIds[0] === undefined ? undefined : `tick:${readyIds[0]}` }
}

function chosenText(d: Decision): string {
  const o = d.options.find(x => x.id === d.answer?.option)

  return o ? `✓ ${o.id} ${o.label}` : '✓ discussed'
}

/** The right-hand part of a list row: wide panes say more. */
export function rowMeta(d: Decision, width: number): string {
  const isWide = width >= 70
  if (d.state === 'ready') {
    return isWide ? `${chosenText(d)} · ready to send` : `${chosenText(d)}  ready`
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
  const lookRows = compact ? -2 : 1 + cardFrame(false)

  const row = (d: Decision) => {
    const isUnread = isWaiting(d) && hasUnread(d, seen)
    const reply = isUnread && !compact ? unreadLine(d, seen) : undefined
    const second = reply === undefined ? secondLine(d, isParkedTab) : undefined
    const isRinged = isFocused && view.ring === `row:${d.id}`
    const room = width - 2 - (isRinged ? cardInset(compact) : 0)
    const tint = isRinged && compact ? 'claude' : undefined
    const body = [
      <Button key={`row:${d.id}`} plain autoFocus={d === first ? true : undefined} onPress={() => openDecision($, d, tab?.key)}>
        {mark(`row:${d.id}`)}
        {isUnread ? <Text color="claude">● </Text> : ''}
        {d.state === 'sent' ? <Text dimColor>{rowText(d, room - (isUnread ? 2 : 0))}</Text> : <Text color={tint} bold={isUnread || undefined}>{rowText(d, room - (isUnread ? 2 : 0))}</Text>}
      </Button>,
      reply !== undefined ? <Text key={`reply:${d.id}`} color="claude">{truncate(`     ${reply}`, room)}</Text> : null,
      second !== undefined ? <Text key={`second:${d.id}`} dimColor>{truncate(`     ${second}`, room)}</Text> : null,
    ]

    return isRinged ? Card(ui, compact, `box:${d.id}`, body) : (
      <Box key={`box:${d.id}`} flexDirection="column">
        {body}
      </Box>
    )
  }
  const heading = (name: string, count: number) => (
    <Text key={`heading:${name}`}>
      <Text bold>{name}</Text>
      <Text dimColor>{`  ${count}`}</Text>
    </Text>
  )
  const elsewhereRows = elsewhere ? 1 : 0
  const needsReserve = 13 + lookRows + elsewhereRows + (view.openSection !== undefined ? 5 : 0)
  const needsSize = pageSize(rows, needsReserve)
  const needsPaged = sections.needsYou.length > needsSize
  const needsPage = pageOf(sections.needsYou, view.openSection === undefined ? view.sectionPage : 0, needsSize)
  const needsShown = needsPaged ? needsPage.rows : sections.needsYou
  const needsYouLines = needsShown.reduce((n, d) => n + (secondLine(d, isParkedTab) === undefined && (compact || !hasUnread(d, seen)) ? 1 : 2), 0)
  const answeredShown = sections.answered.slice(0, answeredRoom(rows, needsYouLines, view.openSection !== undefined))
  const answeredHidden = sections.answered.length - answeredShown.length
  const fixedRows = 9 + lookRows + elsewhereRows + needsYouLines + (answeredShown.length === 0 ? 0 : answeredShown.length + 1 + (answeredHidden > 0 ? 1 : 0)) + (batch.length >= 2 ? 1 : 0)
  const size = pageSize(rows, fixedRows)
  const foldedHeading = (f: (typeof FOLDED)[number]) => {
    const all = tab ? foldedRows(tab, f.section) : []
    if (all.length === 0) {
      return null
    }
    const isOpen = view.openSection === f.section
    const page = pageOf(all, view.sectionPage, size)

    return (
      <Box key={`fold:${f.section}`} flexDirection="column">
        <Button
          key={`section:${f.section}`}
          plain
          autoFocus={first === undefined && !elsewhere && f === FOLDED.find(x => tab && foldedRows(tab, x.section).length > 0) ? true : undefined}
          onPress={() => setView($, v => toggleSection(v, f.section))}
        >
          {mark(`section:${f.section}`)}
          <Text dimColor>{`${isOpen ? '▾' : '▸'} ${f.name}  ${all.length}`}</Text>
        </Button>
        {isOpen ? page.rows.map(row) : null}
        {isOpen && (page.hasEarlier || page.hasNext) ? (
          <Box>
            {page.hasEarlier ? (
              <Button key="o" hotkey="o" plain onPress={() => setView($, v => movePage(v, -1, all.length, size))}>
                {'o earlier  '}
              </Button>
            ) : null}
            {page.hasNext ? (
              <Button key="n" hotkey="n" plain onPress={() => setView($, v => movePage(v, 1, all.length, size))}>
                {`n next ${Math.min(size, page.remaining)} more`}
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
        <Text key="idle" color="success">
          {truncate(readyCount > 0 ? `✓ Nothing needs you · ${readyCount} ready to send (s)` : '✓ Nothing needs you', width)}
        </Text>
      ) : isParkedTab ? null : heading('Needs you', sections.needsYou.length)}
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
      {sections.answered.length > 0 ? heading('Answered', sections.answered.length) : null}
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

/** The answers ready to send, each ticked; Confirm is last in the ring. Compact: keys under the heading, one line per tick, paged with `o`. Returns an element tree. */
export function ReviewView($: any, props: ReviewProps): any {
  const { ui, ready, view, width, onConfirm, onLeave } = props
  const { Box, Text, Button } = ui
  const ticked = ready.filter(d => view.ticked.includes(d.id)).map(d => d.id)
  const isFocused = props.isFocused === true
  const compact = isCompact(props.rows ?? 30)
  const back = () => {
    void setView($, v => ({ ...v, screen: 'list', compactPage: 0 }))
    onLeave()
  }
  const send = () => {
    if (ticked.length > 0) {
      onConfirm(ticked)
    }
  }
  const tick = (d: Decision) => () => setView($, v => ({ ...v, ticked: toggleTick(v.ticked, d.id) }))

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
