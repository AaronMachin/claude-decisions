import { focusKeyName } from './focus-key'
import { counts, truncate } from './pane/list'
import { PANE_ID, readView } from './pane/decision'
import { openFocused } from './pane/render'
import { readAll } from './store'
import { hasUnread, newestUnread, readSeen } from './pane/seen'

/** The band's one line: any new reply first, then how many decisions wait and how to reach them without losing the draft. */
export function bandText(waiting: number, isPlaced: boolean, key: string, unread?: { count: number; id: string }): string {
  const lead = unread && unread.count > 0 ? `● ${unread.count} new repl${unread.count === 1 ? 'y' : 'ies'} on ${unread.id} · ` : ''
  if (waiting === 0) {
    return `${lead}${key}${isPlaced ? '' : ' then enter'} to read it`
  }
  const what = `${waiting} decision${waiting === 1 ? '' : 's'} waiting`

  return isPlaced ? `${lead}${what} · ${key} to answer, your draft stays` : `${lead}${what} · ${key} then enter to open, your draft stays`
}

/** Hidden keeps the band quiet about waiting decisions, but a new reply always shows (decision 223). Never while the pane has the keys. */
export function isBandShown(s: { isHidden: boolean; isFocused: boolean; waiting: number; unread: number }): boolean {
  if (s.isFocused) {
    return false
  }

  return s.unread > 0 || (!s.isHidden && s.waiting > 0)
}

let lastPaneFocus: boolean | undefined

/**
 * Called by the pane's render hook; asks for a redraw only when the pane gained or lost the keys, so the band follows.
 * Returns 'gained' or 'lost' on a change, for the pane's own work when the keys arrive or leave.
 */
export function notePaneFocus($: any, isFocused: boolean): 'gained' | 'lost' | undefined {
  const was = lastPaneFocus
  lastPaneFocus = isFocused
  if (was !== undefined && was !== isFocused) {
    $.ui.invalidate('ui.render')
  }
  if (isFocused && was !== true) {
    return 'gained'
  }

  return !isFocused && was === true ? 'lost' : undefined
}

type BandState = { waiting: number; isPlaced: boolean; unread?: { count: number; id: string } } | undefined

async function bandState($: any): Promise<BandState> {
  const view = await readView($)
  const { decisions } = await readAll($)
  const seen = await readSeen($)
  const waiting = counts(decisions).open
  const unreadOnes = decisions.filter(d => (d.state === 'open' || d.state === 'live') && hasUnread(d, seen))
  const pane = (await $.ui.panes()).find((p: { id: string }) => p.id === PANE_ID)
  if (!isBandShown({ isHidden: view.isHidden, isFocused: pane?.isFocused === true, waiting: view.isHidden ? 0 : waiting, unread: unreadOnes.length })) {
    return undefined
  }
  const newest = newestUnread(unreadOnes, seen)

  return {
    waiting: view.isHidden ? 0 : waiting,
    isPlaced: pane?.isPlaced === true && !view.isHidden,
    unread: newest ? { count: unreadOnes.length, id: newest.id } : undefined,
  }
}

/**
 * The `ui.render` hook for the band above the prompt: shown while decisions wait and
 * the prompt has the keys. Anything it can't read leaves the band to the engine.
 */
export async function renderBand($: any, e: any, next: (e: any) => any): Promise<any> {
  if (e.props.hasSurvey) {
    return next(e)
  }
  let state: BandState
  try {
    state = await bandState($)
  } catch {
    return next(e)
  }
  if (state === undefined) {
    return next(e)
  }
  const { Box, Text, Button } = $.ui.resolve(e)
  const text = bandText(state.waiting, state.isPlaced, focusKeyName(), state.unread)
  if (state.isPlaced) {
    return <Text dimColor>{truncate(text, e.props.bodyColumns)}</Text>
  }

  return (
    <Box>
      <Text dimColor>{truncate(text, Math.max(1, e.props.bodyColumns - 8))}</Text>
      <Text> </Text>
      <Button key="open-decisions" plain autoFocus onPress={() => void openFocused($)}>
        open
      </Button>
    </Box>
  )
}
