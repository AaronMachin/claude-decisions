import type { PaneView } from '../../types'
import type { Decision } from '../store'
import { setView } from './decision'

export type Tab = { key: string; label: string; decisions: Decision[] }

const HIDDEN: Decision['state'][] = ['superseded', 'withdrawn']

/**
 * One tab per group in the order each first appeared, then "Other" (no group),
 * then "Parked". A parked decision shows only in "Parked".
 */
export function tabsFor(all: Decision[]): Tab[] {
  const groups = new Map<string, Tab>()
  const other: Decision[] = []
  const parked: Decision[] = []

  for (const d of [...all].sort((a, b) => a.number - b.number)) {
    if (HIDDEN.includes(d.state)) {
      continue
    }
    if (d.state === 'parked') {
      parked.push(d)
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
  if (parked.length > 0) {
    tabs.push({ key: 'parked', label: 'Parked', decisions: parked })
  }

  return tabs
}

/** "Needs you" is open and live decisions, "Answered" is ready and sent. Parked decisions are the Parked tab's rows. */
export function sectionsFor(tab: Tab): { needsYou: Decision[]; answered: Decision[]; parked: Decision[] } {
  return {
    needsYou: tab.decisions.filter(d => d.state === 'open' || d.state === 'live'),
    answered: tab.decisions.filter(d => d.state === 'ready' || d.state === 'sent'),
    parked: tab.decisions.filter(d => d.state === 'parked'),
  }
}

export function counts(all: Decision[]): { open: number; ready: number; parked: number } {
  return {
    open: all.filter(d => d.state === 'open' || d.state === 'live').length,
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

  return o ? `✓ ${o.id} ${o.label}` : '✓'
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
    return d.parkedReason ?? 'parked'
  }

  return isWide ? `${d.options.length} options · ${d.state}` : ''
}

/** One row, padded so the meta sits at the right edge. */
export function rowText(d: Decision, width: number): string {
  const meta = rowMeta(d, width)
  const left = `${d.id}  ${d.title}`
  const room = Math.max(1, width - 2 - (meta === '' ? 0 : meta.length + 2))

  return meta === '' ? truncate(left, width - 2) : `${truncate(left, room).padEnd(room)}  ${meta}`
}

type ListProps = {
  ui: { Box: any; Text: any; Button: any }
  tabs: Tab[]
  view: PaneView
  width: number
  readyCount: number
  unreadable: number
  onSend: () => void
  onHide: () => void
}

function openDecision($: any, id: string): Promise<unknown> {
  return setView($, v => ({ ...v, screen: 'decision', decisionId: id, highlight: undefined, isParking: false, notice: undefined }))
}

/** The tab row and the open tab's decisions. Returns an element tree. */
export function ListView($: any, props: ListProps): any {
  const { ui, tabs, view, width, readyCount, unreadable, onSend, onHide } = props
  const { Box, Text, Button } = ui
  const tab = activeTab(tabs, view)
  const sections = tab ? sectionsFor(tab) : { needsYou: [], answered: [], parked: [] }
  const first = sections.needsYou[0] ?? sections.parked[0] ?? sections.answered[0]

  const row = (d: Decision) => (
    <Button key={`row:${d.id}`} plain autoFocus={d === first ? true : undefined} onPress={() => openDecision($, d.id)}>
      {d.state === 'sent' ? <Text dimColor>{rowText(d, width)}</Text> : rowText(d, width)}
    </Button>
  )

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
        {tabs.map(t => (
          <Button
            key={`tab:${t.key}`}
            plain
            onPress={() => setView($, v => ({ ...v, tab: t.key }))}
          >
            {t.key === tab?.key ? <Text bold>{`${truncate(t.label, 14)} `}</Text> : <Text dimColor>{`${truncate(t.label, 14)} `}</Text>}
          </Button>
        ))}
      </Box>
      <Text dimColor>{'-'.repeat(Math.max(1, width))}</Text>
      {sections.needsYou.length > 0 ? <Text bold>{`Needs you (${sections.needsYou.length})`}</Text> : null}
      {sections.needsYou.map(row)}
      {sections.parked.length > 0 ? <Text bold>{`Parked (${sections.parked.length})`}</Text> : null}
      {sections.parked.map(row)}
      {sections.answered.length > 0 ? <Text bold>{`Answered (${sections.answered.length})`}</Text> : null}
      {sections.answered.map(row)}
      {unreadable > 0 ? <Text dimColor>{`${unreadable} decision file${unreadable === 1 ? '' : 's'} couldn't be read`}</Text> : null}
      <Text> </Text>
      <Box>
        <Button key="t" hotkey="t" plain onPress={() => setView($, v => ({ ...v, tab: nextTab(tabs, tab?.key) }))}>
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
            {truncate(`${ticked.includes(d.id) ? '[x]' : '[ ]'} ${d.id}  ${d.title}`, width - 2)}
          </Button>
          <Text dimColor>{truncate(`      ${chosenText(d).replace('✓ ', '')}`, width - 2)}</Text>
        </Box>
      ))}
      <Text> </Text>
      <Text dimColor>{`${ready.length} ready, ${ticked.length} ticked. Nothing is sent until you confirm.`}</Text>
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
