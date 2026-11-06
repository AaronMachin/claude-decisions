import type { PaneView } from '../../types'
import { sendTicked, readyDecisions } from '../send'
import { readAll } from '../store'
import { DecisionView, INITIAL_VIEW, PANE_ID, readView, setView } from './decision'
import { ListView, ReviewView, activeTab, openReview, statusText, tabsFor, truncate } from './list'

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

/** `/decisions`: open the pane, focused, and stop treating it as hidden. */
export async function openFocused($: any): Promise<{ text: string }> {
  await setView($, v => ({ ...v, isHidden: false }))
  const opened = await $.ui.open({ id: PANE_ID, title: 'Decisions', focus: true })

  return { text: opened.isPlaced ? 'Decisions pane opened.' : `Decisions pane not placed: ${opened.reason}` }
}

/** Claude added a decision: open the pane without the keys, unless the person hid it. */
export async function openForNewDecision($: any): Promise<void> {
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

/** The `ui.focus` hook: the person's up and down arrive here, so the highlight follows the ring. */
export async function followFocus($: any, element: string | undefined): Promise<void> {
  const match = /^opt:(\d+)$/.exec(element ?? '')
  if (match) {
    await setView($, v => ({ ...v, highlight: Number(match[1]) }))
  } else if (element === 'discuss') {
    await setView($, v => ({ ...v, highlight: undefined }))
  }
}

async function confirm($: any, ids: string[]): Promise<void> {
  const result = await sendTicked($, ids)
  await setView($, v => ({ ...v, screen: 'list', ticked: [] }))
  await changed($)
  void result.settled.then(async notice => {
    if (notice !== undefined) {
      await setView($, v => ({ ...v, notice }))
      await changed($)
    }
  })
}

function header(ui: any, width: number, isFocused: boolean, crumb?: string): any {
  const { Box, Text } = ui
  const state = isFocused ? 'keys on' : 'keys off'
  const pad = Math.max(1, width - 'Decisions'.length - state.length)

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>Decisions</Text>
        <Text>{' '.repeat(pad)}</Text>
        {isFocused ? <Text bold>{state}</Text> : <Text dimColor>{state}</Text>}
      </Box>
      {crumb ? <Text dimColor>{truncate(crumb, width)}</Text> : null}
    </Box>
  )
}

/** The `ui.render` hook for the pane: reads the files and the view, then draws the screen the view names. */
export async function renderPane($: any, e: any): Promise<any> {
  const ui = $.ui.resolve(e)
  const { Box, Text } = ui
  const width: number = e.props.bodyColumns
  const view: PaneView = await readView($)
  const { decisions, unreadable } = await readAll($)
  const tabs = tabsFor(decisions)
  const ready = readyDecisions(decisions)
  const common = {
    ui,
    width,
    onSend: () => void setView($, v => openReview(v, ready.map(d => d.id))),
    onHide: () => void hidePane($),
  }
  const top = header(ui, width, e.props.isFocused === true)
  const decision = view.screen === 'decision' ? decisions.find(d => d.id === view.decisionId) : undefined

  if (decision) {
    const crumb = `${decision.group ?? 'Other'} > ${decision.id}`

    return (
      <Box flexDirection="column">
        {header(ui, width, e.props.isFocused === true, crumb)}
        {DecisionView($, { ...common, d: decision, view, readyCount: ready.length, onChanged: () => void changed($) })}
      </Box>
    )
  }
  if (view.screen === 'review') {
    return (
      <Box flexDirection="column">
        {top}
        {ReviewView($, { ...common, ready, view, onConfirm: ids => void confirm($, ids) })}
      </Box>
    )
  }
  const tab = activeTab(tabs, view)

  return (
    <Box flexDirection="column">
      {top}
      {ListView($, { ...common, tabs, view: { ...INITIAL_VIEW, ...view, tab: tab?.key }, readyCount: ready.length, unreadable })}
      {view.notice ? <Text dimColor>{view.notice}</Text> : null}
    </Box>
  )
}
