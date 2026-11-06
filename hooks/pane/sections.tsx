import type { PaneView } from '../../types'
import type { Decision } from '../store'
import type { Tab } from './list'

export const isWaiting = (d: Decision) => d.state === 'open' || d.state === 'live'

/**
 * The groups inside a tab. "Needs you" is open and live decisions whose section is
 * needs-you; "Claude's call" and "Already decided" are the open ones Claude put
 * there; "Answered" is ready and sent in any section. Parked decisions are the
 * Parked tab's rows.
 */
export function sectionsFor(tab: Tab): {
  needsYou: Decision[]
  claudesCall: Decision[]
  alreadyDecided: Decision[]
  answered: Decision[]
  parked: Decision[]
} {
  return {
    needsYou: tab.decisions.filter(d => isWaiting(d) && d.section === 'needs-you'),
    claudesCall: tab.decisions.filter(d => isWaiting(d) && d.section === 'claudes-call'),
    alreadyDecided: tab.decisions.filter(d => isWaiting(d) && d.section === 'already-decided'),
    answered: tab.decisions.filter(d => d.state === 'ready' || d.state === 'sent'),
    parked: tab.decisions.filter(d => d.state === 'parked'),
  }
}

export type FoldedSection = 'claudes-call' | 'already-decided'

export const FOLDED: { section: FoldedSection; name: string }[] = [
  { section: 'claudes-call', name: "Claude's call" },
  { section: 'already-decided', name: 'Already decided' },
]

/** The decisions in a folded section of a tab. */
export function foldedRows(tab: Tab, section: FoldedSection): Decision[] {
  const groups = sectionsFor(tab)

  return section === 'claudes-call' ? groups.claudesCall : groups.alreadyDecided
}

/** `enter` on a heading: opens that section and folds the other, or folds it when it is the open one. The page goes back to the first. */
export function toggleSection(view: PaneView, section: FoldedSection): PaneView {
  return { ...view, openSection: view.openSection === section ? undefined : section, sectionPage: 0 }
}

/** A tab change folds both sections. */
export function foldAll(view: PaneView): PaneView {
  return { ...view, openSection: undefined, sectionPage: 0 }
}

/** The rows an open section may show: what the pane has left once the fixed rows are counted, never fewer than 4. */
export function pageSize(bodyRows: number, fixedRows: number): number {
  return Math.max(4, bodyRows - fixedRows)
}

export type Page = { rows: Decision[]; page: number; hasEarlier: boolean; hasNext: boolean; remaining: number }

/** One page of an open section; a page past either end is clamped. */
export function pageOf(rows: Decision[], page: number, size: number): Page {
  const last = Math.max(0, Math.ceil(rows.length / size) - 1)
  const at = Math.min(Math.max(0, page), last)

  return {
    rows: rows.slice(at * size, (at + 1) * size),
    page: at,
    hasEarlier: at > 0,
    hasNext: at < last,
    remaining: Math.max(0, rows.length - (at + 1) * size),
  }
}

/** `n`: toward the end. `o`: toward the start. Both stay inside the pages there are. */
export function movePage(view: PaneView, by: 1 | -1, total: number, size: number): PaneView {
  const last = Math.max(0, Math.ceil(total / size) - 1)

  return { ...view, sectionPage: Math.min(Math.max(0, view.sectionPage + by), last) }
}

/** The open assumptions in "Needs you", which the batch screen goes through. */
export function assumptionsIn(tab: Tab): Decision[] {
  return sectionsFor(tab).needsYou.filter(d => d.kind === 'assumption')
}

/** Where the ring starts on the list: the first waiting decision, else a folded heading, else the first answered row. */
export function firstKey(tab: Tab | undefined): string | undefined {
  if (!tab) {
    return undefined
  }
  const groups = sectionsFor(tab)
  const first = groups.needsYou[0] ?? groups.parked[0]
  if (first) {
    return `row:${first.id}`
  }
  for (const f of FOLDED) {
    if (foldedRows(tab, f.section).length > 0) {
      return `section:${f.section}`
    }
  }

  return groups.answered[0] ? `row:${groups.answered[0].id}` : undefined
}
