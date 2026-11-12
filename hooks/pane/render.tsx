import type { PaneView } from '../../types'
import { notePaneFocus } from '../band'
import { sendTicked, readyDecisions } from '../send'
import { readAll } from '../store'
import { DecisionView, INITIAL_VIEW, PANE_ID, cancelHeldDigit, focusLater, focusTo, openingOption, readView, setView } from './decision'
import { Header, isCompact } from './look'
import { ThreadView } from './thread'
import type { Tab } from './list'
import { ListView, ReviewView, activeTab, newestOpenTab, openReview, statusText, tabsFor, waitingElsewhere } from './list'
import { foldAll, sectionsFor } from './sections'
import { freezeOrder, frozenOrder, readSeen, thawOrder, visitSeenAt } from './seen'
import type { Seen } from './seen'
import { BatchView, batchRows } from './kinds'
import { REFRESH_PROMPT, SessionView } from './session-tab'
import { readSession } from '../session'
import { firstKey } from './sections'

/** Sets the status line from what's in the store. */
export async function refreshStatus($: any): Promise<void> {
  const { decisions } = await readAll($)
  $.ui.status(statusText(decisions))
}

/** Something about the decisions changed: refresh the status line and redraw. */
export async function changed($: any): Promise<void> {
  await refreshStatus($)
  $.ui.invalidate('ui.render')
}

/** Puts the list on the tab holding the newest decision that waits for the person; `onlyIfIdle` leaves a tab that has some of its own. */
async function showNewestOpenTab($: any, onlyIfIdle: boolean): Promise<void> {
  const tabs = tabsFor((await readAll($)).decisions)
  const target = newestOpenTab(tabs)
  if (target === undefined) {
    return
  }
  await setView($, v => (onlyIfIdle && waitingElsewhere(tabs, activeTab(tabs, v)) === undefined ? v : { ...foldAll(v), tab: target.key }))
}

/** Whether the pane has the keys now; false when the engine can't say. */
async function isPaneFocused($: any): Promise<boolean> {
  const panes: { id: string; isFocused?: boolean }[] = await $.ui.panes().catch(() => [])

  return panes.some(p => p.id === PANE_ID && p.isFocused === true)
}

/** `/decisions`: open the pane, focused, on a tab with something to answer, and stop treating it as hidden. */
export async function openFocused($: any): Promise<{ text: string }> {
  await setView($, v => ({ ...v, isHidden: false }))
  await showNewestOpenTab($, true).catch(() => undefined)
  const opened = await $.ui.open({ id: PANE_ID, title: 'Decisions', focus: true })

  return { text: opened.isPlaced ? 'Decisions pane opened.' : `Decisions pane not placed: ${opened.reason}` }
}

/** Claude added a decision: open the pane without the keys, on the new decision's tab while the person isn't using the pane, unless they hid it. */
export async function openForNewDecision($: any): Promise<void> {
  if (!(await isPaneFocused($))) {
    await showNewestOpenTab($, false).catch(() => undefined)
  }
  const view = await readView($)
  if (!view.isHidden) {
    await $.ui.open({ id: PANE_ID, title: 'Decisions' })
  }
  await changed($)
}

export async function hidePane($: any): Promise<void> {
  await setView($, v => ({ ...v, isHidden: true }))
  await $.ui.close({ id: PANE_ID })
}

/** The person's moves onto the tab strip are kept off, so up from the first row stays on the list (row 167). */
export function isTabKey(element: string | undefined): boolean {
  return /^tab:/.test(element ?? '')
}

/** The `ui.focus` hook, once the ring has moved: records where it is for the `›`, and the highlight follows it. */
export async function followFocus($: any, element: string | undefined): Promise<void> {
  if (element !== 'opt:1') {
    cancelHeldDigit()
  }
  await setView($, v => ({ ...v, ring: element }))
  const batch = /^batch:(.+)$/.exec(element ?? '')
  const match = /^opt:(\d+)$/.exec(element ?? '')
  if (batch) {
    await setView($, v => ({ ...v, batchRow: batch[1] }))
  } else if (match) {
    await setView($, v => ({ ...v, highlight: Number(match[1]) }))
  }
}

/**
 * After the pane returns to the list, the ring would otherwise land on whichever row
 * the engine picks. Put it on the first row of the open tab once the list is drawn.
 */
export function leaveToList($: any): void {
  $.clock.after(80, () => {
    void focusFirstRow($)
  })
}

/**
 * Where the ring belongs when the pane gets the keys (decision 224): the answer box or the highlighted option on a decision, the
 * list's own ring while its row is still drawn, else the first row of the open tab. A tab change while the prompt
 * had the keys can't move the ring (the engine refuses focus calls then), so without this it is left on a row that went.
 */
export function ringTarget(view: PaneView, tabs: Tab[], seen: Seen = {}, frozen?: string[]): string | undefined {
  if (view.screen === 'decision') {
    if (view.answerBox !== undefined) {
      return 'answer'
    }
    const d = tabs.flatMap(t => t.decisions).find(x => x.id === view.decisionId)

    return `opt:${view.highlight ?? (d ? openingOption(d) : 1)}`
  }
  if (view.screen === 'review' && view.decisionId !== undefined) {
    return 'confirm'
  }
  if (view.screen !== 'list') {
    return undefined
  }
  const current = activeTab(tabs, view)
  const ringed = /^row:(.+)$/.exec(view.ring ?? '')?.[1]
  if (ringed !== undefined && current?.decisions.some(d => d.id === ringed)) {
    return view.ring
  }

  return waitingElsewhere(tabs, current) ? 'goto-waiting' : firstKey(current, seen, frozen)
}

async function focusFirstRow($: any): Promise<void> {
  const tabs = tabsFor((await readAll($)).decisions)
  const current = activeTab(tabs, await readView($))
  const key = waitingElsewhere(tabs, current) ? 'goto-waiting' : firstKey(current)
  if (key) {
    await focusTo($, key)
  }
}

async function confirm($: any, ids: string[]): Promise<void> {
  const result = await sendTicked($, ids)
  await setView($, v => ({ ...v, screen: 'list', decisionId: undefined, ticked: [] }))
  await changed($)
  leaveToList($)
  void result.settled.then(async notice => {
    if (notice !== undefined) {
      await setView($, v => ({ ...v, notice }))
      await changed($)
    }
  })
}

function header(ui: any, width: number, isFocused: boolean, crumb: string | undefined, rows: number): any {
  const { Box, Text } = ui

  return (
    <Box key="top" flexDirection="column">
      {Header(ui, 'Decisions', isFocused, crumb, width)}
    </Box>
  )
}

/** The `ui.render` hook for the pane: reads the files and the view, then draws the screen the view names. */
export async function renderPane($: any, e: any): Promise<any> {
  const keys = notePaneFocus($, e.props.isFocused === true)
  const ui = $.ui.resolve(e)
  const { Box, Text } = ui
  const width: number = e.props.bodyColumns
  const view: PaneView = await readView($)
  const { decisions, unreadable } = await readAll($)
  const seen = await readSeen($)
  const tabs = tabsFor(decisions, seen)
  if (keys === 'gained') {
    freezeOrder(tabs.flatMap(t => sectionsFor(t, seen).needsYou.map(d => d.id)))
    const target = ringTarget(view, tabs, seen, frozenOrder())
    if (target !== undefined) {
      focusLater($, target)
    }
  } else if (keys === 'lost') {
    thawOrder()
  }
  const ready = readyDecisions(decisions)
  const common = {
    ui,
    width,
    isFocused: e.props.isFocused === true,
    onSend: () => void setView($, v => openReview(v, ready.map(d => d.id))),
    onHide: () => void hidePane($),
  }
  const rows: number = e.props.scroll?.bodyRows ?? 30
  const top = header(ui, width, e.props.isFocused === true, undefined, rows)
  const decision = view.screen === 'decision' || view.screen === 'thread' ? decisions.find(d => d.id === view.decisionId) : undefined

  if (decision && view.screen === 'thread') {
    const crumb = `${decision.group ?? 'Other'} › ${decision.id} › ${view.revisionIndex === undefined ? 'discussion' : 'earlier version'}`

    return (
      <Box flexDirection="column">
        {header(ui, width, e.props.isFocused === true, crumb, rows)}
        {ThreadView($, {
          ...common,
          d: decision,
          view,
          rows: e.props.scroll?.bodyRows ?? 30,
          readyCount: ready.length,
          onChanged: () => void changed($),
          onLeave: () => leaveToList($),
        })}
      </Box>
    )
  }
  if (decision) {
    return DecisionView($, {
      ...common,
      d: decision,
      all: decisions,
      seenAt: visitSeenAt(decision.id, seen),
      cwd: await $.session.cwd().catch(() => ''),
      scrollOffset: e.props.scroll?.offset ?? 0,
      onSendThis: async () => {
        await setView($, v => openReview(v, ready.map(d => d.id), decision.id))
        focusLater($, 'confirm')
      },
      view,
      rows: e.props.scroll?.bodyRows ?? 30,
      readyCount: ready.length,
      onChanged: () => void changed($),
      onLeave: () => leaveToList($),
    })
  }
  if (view.screen === 'batch') {
    const batchTab = activeTab(tabs, view)
    const batchList = batchRows(batchTab?.decisions ?? [])

    return (
      <Box flexDirection="column">
        {header(ui, width, e.props.isFocused === true, `${batchTab?.label ?? 'Other'} › assumptions`, rows)}
        {BatchView($, { ...common, rows: batchList, paneRows: rows, view, onChanged: () => void changed($), onLeave: () => leaveToList($) })}
      </Box>
    )
  }
  if (view.screen === 'session') {
    return (
      <Box flexDirection="column">
        {header(ui, width, e.props.isFocused === true, 'Session', rows)}
        {SessionView($, {
          ...common,
          record: await readSession($),
          view,
          rows,
          isFocused: e.props.isFocused === true,
          onLeave: () => leaveToList($),
          onRefresh: () => void $.prompt.submit({ text: REFRESH_PROMPT }).catch(() => undefined),
        })}
      </Box>
    )
  }
  if (view.screen === 'review') {
    return (
      <Box flexDirection="column">
        {top}
        {ReviewView($, { ...common, ready, view, rows, onConfirm: ids => void confirm($, ids), onLeave: () => leaveToList($) })}
      </Box>
    )
  }
  const tab = activeTab(tabs, view)

  return (
    <Box flexDirection="column">
      {top}
      {ListView($, { ...common, tabs, view: { ...INITIAL_VIEW, ...view, tab: tab?.key }, readyCount: ready.length, unreadable, rows: e.props.scroll?.bodyRows, seen, frozen: frozenOrder() })}
      {view.notice ? <Text dimColor>{view.notice}</Text> : null}
    </Box>
  )
}
