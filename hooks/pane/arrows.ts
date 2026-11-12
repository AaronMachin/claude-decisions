import type { PaneView } from '../../types'

type ScrollEvent = { origin: { kind: string }; by: number; pointer?: unknown }

/**
 * While a pane has rows to scroll, Claude Code spends an arrow key on scrolling the window a row,
 * so on a long decision the ring never left the option it was on. For an arrow (the person's, no
 * pointer, one row) with the ring on an option, this is the option the ring should move to
 * instead; undefined lets the window scroll as before: the wheel, page keys, past the first or
 * last option, off the decision screen (row 293).
 */
export function arrowTarget(e: ScrollEvent, view: Pick<PaneView, 'screen' | 'ring'>, optionCount: number): string | undefined {
  if (e.origin.kind !== 'person' || e.pointer !== undefined || Math.abs(e.by) !== 1 || view.screen !== 'decision') {
    return undefined
  }
  const current = /^opt:(\d+)$/.exec(view.ring ?? '')
  if (!current) {
    return undefined
  }
  const next = Number(current[1]) + Math.sign(e.by)

  return next >= 1 && next <= optionCount ? `opt:${next}` : undefined
}
