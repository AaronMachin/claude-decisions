import type { PaneView } from '../../types'
import type { Decision } from '../store'
import { focusLater, ringMark, setView } from './decision'
import { FOLDED, answeredRoom, assumptionsIn, foldAll, foldedRows, isWaiting, movePage, pageOf, pageSize, sectionsFor, toggleSection } from './sections'

export type Tab = { key: string; label: string; decisions: Decision[] }

const HIDDEN: Decision['state'][] = ['superseded', 'withdrawn']

/**
 * One tab per group in the order each first appeared, then "Other" (no group),
 * then "For you to do" (tasks, wherever they came from), then "Parked". A parked
 * decision shows only in "Parked".
 */
export function tabsFor(all: Decision[]): Tab[] {
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

  return tabs
}

export { sectionsFor }

export function counts(all: Decision[]): { open: number; ready: number; parked: number } {
  return {
    open: all.filter(d => isWaiting(d) && d.section === 'needs-you').length,
    ready: all.filter(d => d.state === 'ready').length,
    parked: all.filter(d => d.state === 'parked').length,
  }
}

/** The status line: undefined (cleared) when nothing is open, ready or parked. */
export function statusText(all: Decision[]): string | undefined {
  const { open, ready, parked } = counts(all)
  if (open + ready + parked === 0) {
    return undefined
  }

  return ['Decisions: ' + `${open} open`, ready > 0 ? `${ready} ready` : '', parked > 0 ? `${parked} parked` : '']
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
  const cost = (t: Tab) => truncate(t.label, 14).length + 1
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

export function activeTab(tabs: Tab[], view: PaneView): Tab | undefined {
  return tabs.find(t => t.key === view.tab) ?? tabs[0]
}

export function truncate(text: string, width: number): string {
  return text.length <= width ? text : text.slice(0, Math.max(0, width - 1)) + '…'
}

/** Ticks or unticks one id. */
export function toggleTick(ticked: string[], id: string): string[] {
  return ticked.includes(id) ? ticked.filter(t => t !== id) : [...ticked, id]
}

/** The review screen opens with every ready decision ticked. */
export function openReview(view: PaneView, readyIds: string[]): PaneView {
  return { ...view, screen: 'review', ticked: readyIds, notice: undefined }
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
  onSend: () => void
  onHide: () => void
}

/** Opens a decision with the ring on Discuss, so `enter` alone opens the discussion (D3) and never picks an option the ring happened to land on. */
async function openDecision($: any, id: string): Promise<void> {
  await setView($, v => ({ ...v, screen: 'decision', decisionId: id, highlight: undefined, isParking: false, notice: undefined }))
  focusLater($, 'discuss')
}

/** The tab row and the open tab's decisions. Returns an element tree. */
export function ListView($: any, props: ListProps): any {
  const { ui, tabs, view, width, readyCount, unreadable, onSend, onHide } = props
  const rows = props.rows ?? 30
  const { Box, Text, Button } = ui
  const tab = activeTab(tabs, view)
  const sections = tab ? sectionsFor(tab) : { needsYou: [], claudesCall: [], alreadyDecided: [], answered: [], parked: [] }
  const first = sections.needsYou[0] ?? sections.parked[0] ?? (sections.claudesCall.length + sections.alreadyDecided.length > 0 ? undefined : sections.answered[0])
  const isParkedTab = tab?.key === 'parked'
  const batch = tab && !isParkedTab ? assumptionsIn(tab) : []
  const tabRow = visibleTabs(tabs, tab?.key, width)
  const mark = (key: string) => `${ringMark(key, view.ring, props.isFocused === true)} `

  const row = (d: Decision) => {
    const second = secondLine(d, isParkedTab)

    return (
      <Box key={`box:${d.id}`} flexDirection="column">
        <Button key={`row:${d.id}`} plain autoFocus={d === first ? true : undefined} onPress={() => openDecision($, d.id)}>
          {mark(`row:${d.id}`)}
          {d.state === 'sent' ? <Text dimColor>{rowText(d, width - 2)}</Text> : rowText(d, width - 2)}
        </Button>
        {second !== undefined ? <Text dimColor>{truncate(`     ${second}`, width - 2)}</Text> : null}
      </Box>
    )
  }
  const needsReserve = 13 + (view.openSection !== undefined ? 5 : 0)
  const needsSize = pageSize(rows, needsReserve)
  const needsPaged = sections.needsYou.length > needsSize
  const needsPage = pageOf(sections.needsYou, view.openSection === undefined ? view.sectionPage : 0, needsSize)
  const needsShown = needsPaged ? needsPage.rows : sections.needsYou
  const needsYouLines = needsShown.reduce((n, d) => n + (secondLine(d, isParkedTab) === undefined ? 1 : 2), 0)
  const answeredShown = sections.answered.slice(0, answeredRoom(rows, needsYouLines, view.openSection !== undefined))
  const answeredHidden = sections.answered.length - answeredShown.length
  const fixedRows = 9 + needsYouLines + (answeredShown.length === 0 ? 0 : answeredShown.length + 1 + (answeredHidden > 0 ? 1 : 0)) + (batch.length >= 2 ? 1 : 0)
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
          autoFocus={first === undefined && f === FOLDED.find(x => tab && foldedRows(tab, x.section).length > 0) ? true : undefined}
          onPress={() => setView($, v => toggleSection(v, f.section))}
        >
          {mark(`section:${f.section}`)}
          <Text bold>{`${isOpen ? '▾' : '▸'} ${f.name} (${all.length})`}</Text>
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

  if (tabs.length === 0) {
    return (
      <Box flexDirection="column">
        <Text dimColor>No decisions yet. Claude adds them here when it needs you.</Text>
        <Button key="h" hotkey="h" plain onPress={onHide}>
          hide
        </Button>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Box>
        {tabRow.hasLeft ? <Text dimColor>‹ </Text> : null}
        {tabRow.shown.map(t => (
          <Button
            key={`tab:${t.key}`}
            plain
            onPress={() => setView($, v => ({ ...foldAll(v), tab: t.key }))}
          >
            {t.key === tab?.key ? <Text bold>{`${truncate(t.label, 14)} `}</Text> : <Text dimColor>{`${truncate(t.label, 14)} `}</Text>}
          </Button>
        ))}
        {tabRow.hasRight ? <Text dimColor>›</Text> : null}
      </Box>
      <Text dimColor>{'-'.repeat(Math.max(1, width))}</Text>
      {isParkedTab ? null : <Text bold>{`Needs you (${sections.needsYou.length})`}</Text>}
      {batch.length >= 2 ? (
        <Button
          key="batch"
          plain
          onPress={async () => {
            await setView($, v => ({ ...v, screen: 'batch', marks: {}, batchRow: undefined, notice: undefined }))
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
      {sections.parked.length > 0 ? <Text bold>{`Parked (${sections.parked.length})`}</Text> : null}
      {sections.parked.map(row)}
      {sections.answered.length > 0 ? <Text bold>{`Answered (${sections.answered.length})`}</Text> : null}
      {answeredShown.map(row)}
      {answeredHidden > 0 ? <Text dimColor>{`     ${answeredHidden} more answered`}</Text> : null}
      {unreadable > 0 ? <Text dimColor>{`${unreadable} decision file${unreadable === 1 ? '' : 's'} couldn't be read`}</Text> : null}
      <Text> </Text>
      <Box>
        <Button key="t" hotkey="t" plain onPress={() => setView($, v => ({ ...foldAll(v), tab: nextTab(tabs, tab?.key) }))}>
          {'next tab  '}
        </Button>
        {readyCount > 0 ? (
          <Button key="s" hotkey="s" plain onPress={onSend}>
            {`send ${readyCount}  `}
          </Button>
        ) : null}
        <Button key="h" hotkey="h" plain onPress={onHide}>
          hide
        </Button>
      </Box>
    </Box>
  )
}

type ReviewProps = {
  ui: { Box: any; Text: any; Button: any }
  ready: Decision[]
  view: PaneView
  width: number
  /** Called with the ticked ids, only when at least one is ticked. */
  onConfirm: (ids: string[]) => void
  /** Called when the screen goes back to the list. */
  onLeave: () => void
  /** The pane has the keys, so the ring (and its `›`) is shown. */
  isFocused?: boolean
}

/** The answers ready to send, each ticked; Confirm is last in the ring. Returns an element tree. */
export function ReviewView($: any, props: ReviewProps): any {
  const { ui, ready, view, width, onConfirm, onLeave } = props
  const { Box, Text, Button } = ui
  const ticked = ready.filter(d => view.ticked.includes(d.id)).map(d => d.id)

  return (
    <Box flexDirection="column">
      <Text bold>Send answers</Text>
      <Text dimColor>{'-'.repeat(Math.max(1, width))}</Text>
      {ready.map((d, index) => (
        <Box key={`box:${d.id}`} flexDirection="column">
          <Button
            key={`tick:${d.id}`}
            plain
            autoFocus={index === 0 ? true : undefined}
            onPress={() => setView($, v => ({ ...v, ticked: toggleTick(v.ticked, d.id) }))}
          >
            {`${ringMark(`tick:${d.id}`, view.ring, props.isFocused === true)} ` + truncate(`${ticked.includes(d.id) ? '[x]' : '[ ]'} ${d.id}  ${d.title}`, width - 4)}
          </Button>
          <Text dimColor>{truncate(`      ${chosenText(d).replace('✓ ', '')}`, width - 2)}</Text>
        </Box>
      ))}
      <Text> </Text>
      <Text dimColor>{`${ready.length} ready, ${ticked.length} ticked. Nothing is sent until you confirm. Enter ticks or unticks a row, c sends.`}</Text>
      <Box>
        <Button key="b" hotkey="b" plain onPress={() => {
            void setView($, v => ({ ...v, screen: 'list' }))
            onLeave()
          }}
        >
          {'back  '}
        </Button>
        <Button
          key="confirm"
          hotkey="c"
          variant="primary"
          onPress={() => {
            if (ticked.length > 0) {
              onConfirm(ticked)
            }
          }}
        >
          {`send ${ticked.length}`}
        </Button>
      </Box>
    </Box>
  )
}
