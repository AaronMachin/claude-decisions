import { focusKeyName } from './focus-key'
import { counts, truncate } from './pane/list'
import { PANE_ID, readView } from './pane/decision'
import { openFocused } from './pane/render'
import { readAll } from './store'

/** The band's one line: how many decisions wait and how to reach them without losing the draft. */
export function bandText(waiting: number, isPlaced: boolean, key: string): string {
  const what = `${waiting} decision${waiting === 1 ? '' : 's'} waiting`

  return isPlaced ? `${what} · ${key} to answer, your draft stays` : `${what} · ${key} then enter to open, your draft stays`
}

let lastPaneFocus: boolean | undefined

/** Called by the pane's render hook; asks for a redraw only when the pane gained or lost the keys, so the band follows. */
export function notePaneFocus($: any, isFocused: boolean): void {
  if (lastPaneFocus !== undefined && lastPaneFocus !== isFocused) {
    $.ui.invalidate('ui.render')
  }
  lastPaneFocus = isFocused
}

type BandState = { waiting: number; isPlaced: boolean } | undefined

async function bandState($: any): Promise<BandState> {
  const view = await readView($)
  if (view.isHidden) {
    return undefined
  }
  const { decisions } = await readAll($)
  const waiting = counts(decisions).open
  if (waiting === 0) {
    return undefined
  }
  const pane = (await $.ui.panes()).find((p: { id: string }) => p.id === PANE_ID)
  if (pane?.isFocused) {
    return undefined
  }

  return { waiting, isPlaced: pane?.isPlaced === true }
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
  const text = bandText(state.waiting, state.isPlaced, focusKeyName())
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
