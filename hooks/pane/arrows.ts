import type { PaneView } from '../../types'

type ScrollEvent = { origin: { kind: string }; by: number; pointer?: unknown }
type FocusEvent = { origin: { kind: string }; element?: string }
type View = Pick<PaneView, 'screen' | 'ring' | 'highlight'>

/** Where the ring goes back to when it is somewhere it shouldn't be: the highlighted option, else the first stop. */
function home(view: View, stops: string[]): string | undefined {
  const highlighted = view.highlight !== undefined ? `opt:${view.highlight}` : undefined

  return highlighted !== undefined && stops.includes(highlighted) ? highlighted : stops[0]
}

/**
 * While a pane has rows to scroll, Claude Code spends an arrow key on scrolling the window a row,
 * so on a long decision the ring stayed put or got lost. For an arrow (the person's, no pointer, one
 * row) on the decision screen, this is where the ring goes instead, along the stops: the options,
 * then the ask box. The list is walked the same way along its rows. Undefined lets the window scroll: up from the first option shows the context
 * above it, down from the last stop shows what is below, and the wheel and page keys scroll as
 * before (rows 293, 296).
 */
export function arrowTarget(e: ScrollEvent, view: View, stops: string[]): string | undefined {
  const isWalked = view.screen === 'decision' || view.screen === 'list'
  if (e.origin.kind !== 'person' || e.pointer !== undefined || Math.abs(e.by) !== 1 || !isWalked || stops.length === 0) {
    return undefined
  }
  const at = stops.indexOf(view.ring ?? '')
  if (at === -1) {
    // On the list a ring off the rows (the key line) lets the window scroll rather than jump to the top.
    return view.screen === 'decision' ? home(view, stops) : undefined
  }
  const next = at + Math.sign(e.by)

  return next >= 0 && next < stops.length ? stops[next] : undefined
}

export type FocusMove = { kind: 'allow' } | { kind: 'redirect'; element: string } | { kind: 'stay'; scrollTo: 'start' | 'end' }

/**
 * A ring move the person made (an arrow or Tab) on a decision that scrolls, off the stops: Claude
 * Code took it to a key on the key line that is scrolled out of view, so the ring vanished and every
 * arrow after it only scrolled. Off the first stop it stays and the top scrolls into view; off the
 * last it stays and the end does; from the middle it goes to the next stop; a ring already off the
 * stops comes home (row 296).
 */
export function focusMove(e: FocusEvent, view: View, stops: string[], isScrolling: boolean): FocusMove {
  if (e.origin.kind !== 'person' || !isScrolling || view.screen !== 'decision' || stops.length === 0 || stops.includes(e.element ?? '')) {
    return { kind: 'allow' }
  }
  const at = stops.indexOf(view.ring ?? '')
  if (at === -1) {
    const back = home(view, stops)
    return back ? { kind: 'redirect', element: back } : { kind: 'allow' }
  }
  if (at === 0) {
    return { kind: 'stay', scrollTo: 'start' }
  }
  if (at === stops.length - 1) {
    return { kind: 'stay', scrollTo: 'end' }
  }

  return { kind: 'redirect', element: stops[at + 1]! }
}

type Drawn = { stops: string[]; isScrolling: boolean; screen: 'decision' | 'list' }

let drawn: Drawn = { stops: [], isScrolling: false, screen: 'decision' }

/** The decision screen and the list note their stops (and the decision whether it is taller than the pane) as they draw (module memory, never state). */
export function noteStops(stops: string[], isScrolling: boolean, screen: Drawn['screen'] = 'decision'): void {
  drawn = { stops, isScrolling, screen }
}

export function drawnStops(): Drawn {
  return drawn
}
