/** The pieces of the pane's look (row 170) every screen shares: rules, key hints, the header, the card. */

/** Below this many rows (`scroll.bodyRows`) the pane draws the compact layout (row 161). */
export const COMPACT_BELOW = 14

export function isCompact(rows: number): boolean {
  return rows < COMPACT_BELOW
}

/** A thin dim rule the width of the pane. */
export function Rule(ui: { Text: any }, width: number, key?: string): any {
  const { Text } = ui

  return (
    <Text key={key} color="subtle">
      {'─'.repeat(Math.max(1, width))}
    </Text>
  )
}

/**
 * One key hint. With a `hotkey` and `onPress` it is a plain Button, which the engine
 * draws as `k: label` with the key in its accent colour; without a hotkey but with
 * `onPress`, a Button drawn the same way by hand; without `onPress`, text.
 */
export type Hint = {
  /** The element key. */
  id: string
  /** What the person presses, as drawn: "b", "enter", "5". */
  keyText: string
  /** Dropped first when the hints don't fit in their lines. */
  label: string
  hotkey?: string
  onPress?: () => void
  autoFocus?: boolean
  /** `›` while the ring is on it; drawn before the hint. */
  mark?: string
  /**
   * Keeps its label when the hints don't fit: the others lose theirs from the end of the line first, so the keys
   * that matter most stay named. Without any hint marked, the labels all go together, as they always have.
   */
  keepLabel?: boolean
}

const GAP = 2

/**
 * Columns a hint takes as drawn: the engine draws a hotkey Button as `k: label` (`k: ` even
 * with no label), a hint without a hotkey is `k: label` by hand, or the label alone with no key.
 */
function hintWidth(hint: Hint, withLabel: boolean): number {
  const label = withLabel ? hint.label : ''
  const mark = (hint.mark ?? '').length
  if (hint.onPress && hint.hotkey) {
    return mark + hint.keyText.length + 2 + label.length + padOf(hint, label)
  }
  if (hint.keyText === '') {
    return mark + (label === '' ? hint.label : label).length + GAP
  }

  return mark + hint.keyText.length + 1 + (label === '' ? 0 : 1 + label.length) + padOf(hint, label)
}

/**
 * Spaces after a hint. A bare hotkey key packs tight: the engine already draws it as `k: `, space included, so a
 * run of them reads `4: 5: 6:`. A bare key drawn by hand (`enter:`) keeps one space; a labelled one keeps the gap.
 */
function padOf(hint: Hint, label: string): number {
  if (label !== '' || hint.keyText === '') {
    return GAP
  }

  return hint.onPress && hint.hotkey ? 0 : 1
}

/** The hints split into lines of at most `width` columns; `withLabel` says which keep their label. */
export function hintRows(hints: Hint[], width: number, withLabel: boolean | ((hint: Hint) => boolean)): Hint[][] {
  const labelled = typeof withLabel === 'function' ? withLabel : () => withLabel
  const rows: Hint[][] = []
  // One column spare: a line that only just fits is wrapped by the terminal, not cut.
  const room = width - 1
  let used = 0
  for (const hint of hints) {
    const cost = hintWidth(hint, labelled(hint))
    if (rows.length === 0 || used + cost > room) {
      rows.push([hint])
      used = cost
    } else {
      rows[rows.length - 1]!.push(hint)
      used += cost
    }
  }

  return rows
}

/**
 * How the hints are laid out: with their labels when they fit in `maxLines`. Otherwise, when some hints keep their
 * label, the others lose theirs from the end until the line fits; failing that, or with none marked, the keys alone.
 */
export function hintLayout(hints: Hint[], width: number, maxLines: number): { rows: Hint[][]; withLabel: boolean; labelled: Set<string> } {
  const all = new Set(hints.map(h => h.id))
  const full = hintRows(hints, width, true)
  if (full.length <= maxLines) {
    return { rows: full, withLabel: true, labelled: all }
  }
  if (hints.some(h => h.keepLabel)) {
    const labelled = new Set(all)
    for (const hint of [...hints].reverse()) {
      if (hint.keepLabel || hint.label === '') {
        continue
      }
      labelled.delete(hint.id)
      const rows = hintRows(hints, width, h => labelled.has(h.id))
      if (rows.length <= maxLines) {
        return { rows, withLabel: false, labelled }
      }
    }
  }

  return { rows: hintRows(hints, width, false), withLabel: false, labelled: new Set() }
}

/** The lines the hints take, for the row budget. */
export function hintLineCount(hints: Hint[], width: number, maxLines: number): number {
  return hints.length === 0 ? 0 : hintLayout(hints, width, maxLines).rows.length
}

function hintElement(ui: { Text: any; Button: any }, hint: Hint, withLabel: boolean): any {
  const { Text, Button } = ui
  const label = withLabel && hint.label !== '' ? hint.label : ''
  const pad = ' '.repeat(padOf(hint, label))
  if (hint.onPress && hint.hotkey) {
    return (
      <Button key={hint.id} hotkey={hint.hotkey} plain autoFocus={hint.autoFocus} onPress={hint.onPress}>
        <Text dimColor>{label}</Text>
        {pad}
      </Button>
    )
  }
  const body = [
    hint.keyText === '' ? '' : <Text key="k" color="suggestion">{`${hint.keyText}:`}</Text>,
    label === '' ? '' : <Text key="l" dimColor>{` ${label}`}</Text>,
    pad,
  ]
  if (hint.onPress) {
    return (
      <Button key={hint.id} plain autoFocus={hint.autoFocus} onPress={hint.onPress}>
        {body}
      </Button>
    )
  }

  return <Text key={hint.id}>{body}</Text>
}

/** The key hints, at most `maxLines` lines; past that the labels go and the keys stay. */
export function KeyHints(ui: { Box: any; Text: any; Button: any }, hints: Hint[], width: number, maxLines = 2): any {
  const { Box, Text } = ui
  if (hints.length === 0) {
    return null
  }
  const { rows, labelled } = hintLayout(hints, width, maxLines)

  return (
    <Box key="hints" flexDirection="column">
      {rows.map((row, index) => (
        <Box key={`hints:${index}`}>
          {row.map(hint => [hint.mark ? <Text key={`mark:${hint.id}`}>{hint.mark}</Text> : null, hintElement(ui, hint, labelled.has(hint.id))])}
        </Box>
      ))}
    </Box>
  )
}

/**
 * The header: the title in bold with the keys state at the right of the same line, then the crumb, dim.
 * The keys state stops HEADER_RIGHT_GAP columns short of the edge: the pane's close mark sits over the last ones.
 */
/** Columns left clear at the header's right edge, where the engine draws the pane's close mark. */
export const HEADER_RIGHT_GAP = 3

export function Header(ui: { Box: any; Text: any }, title: string, isFocused: boolean, crumb: string | undefined, width: number): any {
  const { Box, Text } = ui
  const state = isFocused ? 'keys on' : 'keys off'
  const usable = width - HEADER_RIGHT_GAP
  const room = Math.max(1, usable - state.length - 1)
  const shown = cut(title, room)

  return (
    <Box key="header" flexDirection="column">
      <Box>
        <Text bold>{shown}</Text>
        <Text>{' '.repeat(Math.max(1, usable - shown.length - state.length))}</Text>
        {isFocused ? <Text bold>{state}</Text> : <Text dimColor>{state}</Text>}
      </Box>
      {crumb ? <Text dimColor>{cut(crumb, width)}</Text> : null}
    </Box>
  )
}

/** The highlighted row's frame: a rounded border in the `claude` colour; compact, no border (the row is tinted and starts `›`). */
export function Card(ui: { Box: any }, compact: boolean, key: string, children: any): any {
  const { Box } = ui
  if (compact) {
    return (
      <Box key={key} flexDirection="column">
        {children}
      </Box>
    )
  }

  return (
    <Box key={key} flexDirection="column" borderStyle="round" borderColor="claude" paddingX={1}>
      {children}
    </Box>
  )
}

/** Rows a card adds around what it holds. */
export function cardFrame(compact: boolean): number {
  return compact ? 0 : 2
}

/** Columns a card takes from its contents: the border and one cell of padding each side. */
export function cardInset(compact: boolean): number {
  return compact ? 0 : 4
}

function cut(text: string, width: number): string {
  return text.length <= width ? text : text.slice(0, Math.max(0, width - 1)) + '…'
}

/** Text broken into lines of at most `width` columns, at spaces where it can be. */
export function wrapLines(text: string, width: number): string[] {
  const room = Math.max(1, width)
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(w => w !== '')) {
      let rest = word
      while (rest.length > room) {
        if (line !== '') {
          lines.push(line)
          line = ''
        }
        lines.push(rest.slice(0, room))
        rest = rest.slice(room)
      }
      if (line === '') {
        line = rest
      } else if (line.length + 1 + rest.length <= room) {
        line += ' ' + rest
      } else {
        lines.push(line)
        line = rest
      }
    }
    lines.push(line)
  }

  return lines.filter((l, i) => l !== '' || i < lines.length - 1)
}

/** At most `lines` lines of `text`, the last cut with `…` when more was left out. */
export function capLines(text: string, width: number, lines: number): { lines: string[]; isCut: boolean } {
  const all = wrapLines(text, width)
  if (all.length <= lines) {
    return { lines: all, isCut: false }
  }
  const kept = all.slice(0, Math.max(1, lines))
  const last = kept.length - 1
  const line = kept[last]!
  kept[last] = line.length >= width ? line.slice(0, Math.max(0, width - 1)) + '…' : line + '…'

  return { lines: kept, isCut: true }
}
