import type { PaneView } from '../../types'
import type { Decision, StoreCtx } from '../store'
import { chooseAndReopen, focusLater, readView, ringMark, setView } from './decision'
import { truncate } from './list'
import { KeyHints, Rule, isCompact } from './look'
import type { Hint } from './look'

export { FIXED_OPTIONS, fixedOptionsFor } from '../kind-options'
export type { FixedOption } from '../kind-options'

export const RIGHT = 1
export const WRONG = 2

/** The assumptions the batch screen shows: open ones that need the person, and ready ones (dim, skipped by every key). */
export function batchRows(tabDecisions: Decision[]): Decision[] {
  return tabDecisions.filter(
    d => d.kind === 'assumption' && !d.isTask && ((d.section === 'needs-you' && (d.state === 'open' || d.state === 'live')) || d.state === 'ready'),
  )
}

export const isUnanswered = (d: Decision): boolean => d.state === 'open' || d.state === 'live'

/** `1` or `2` on the row the ring is on: highlights, saves nothing. A row already answered is skipped. */
export function markRow(marks: Record<string, number>, rows: Decision[], id: string | undefined, option: number): Record<string, number> {
  const row = rows.find(d => d.id === id)
  if (!row || !isUnanswered(row)) {
    return marks
  }

  return { ...marks, [row.id]: option }
}

/** `r`: Right on every row that has no answer and no mark. A row already marked Wrong stays Wrong. */
export function markRest(marks: Record<string, number>, rows: Decision[]): Record<string, number> {
  const next = { ...marks }
  for (const d of rows) {
    if (isUnanswered(d) && next[d.id] === undefined) {
      next[d.id] = RIGHT
    }
  }

  return next
}

/** The marks that still point at an unanswered row. */
export function liveMarks(marks: Record<string, number>, rows: Decision[]): Record<string, number> {
  return Object.fromEntries(Object.entries(marks).filter(([id]) => rows.some(d => d.id === id && isUnanswered(d))))
}

/** The row after `id` that has no answer, wrapping; the first one when `id` isn't there. */
export function nextUnanswered(rows: Decision[], id: string | undefined): Decision | undefined {
  const open = rows.filter(isUnanswered)
  const at = open.findIndex(d => d.id === id)

  return at === -1 ? open[0] : open.length > 1 ? open[(at + 1) % open.length] : undefined
}

/** Saves marks through the ordinary answer path, so they reach review and send, and reopen dependents. */
export async function confirmMarks(
  store: StoreCtx,
  rows: Decision[],
  marks: Record<string, number>,
): Promise<{ right: number; wrong: number; notice: string }> {
  let right = 0
  let wrong = 0
  const extra: string[] = []
  for (const d of rows.filter(isUnanswered)) {
    const option = marks[d.id]
    if (option === undefined) {
      continue
    }
    const done = await chooseAndReopen(store, d, option)
    if (done) {
      if (option === RIGHT) {
        right += 1
      } else {
        wrong += 1
      }
      if (done.notice) {
        extra.push(done.notice)
      }
    }
  }
  const total = right + wrong
  const head = `Answered ${total} assumption${total === 1 ? '' : 's'}: ${right} right, ${wrong} wrong.`

  return { right, wrong, notice: [head, ...extra].join(' ') }
}

/** One batch row: the id and title, with the mark at the right edge. */
export function batchRowText(d: Decision, mark: number | undefined, width: number): string {
  const answered = d.answer?.option
  const tag = d.state === 'ready' ? (answered === RIGHT ? '✓ right' : '✓ wrong') : mark === RIGHT ? 'right?' : mark === WRONG ? 'wrong?' : ''
  const room = Math.max(1, width - 2 - (tag === '' ? 0 : tag.length + 2))
  const left = truncate(`${d.id}  ${d.title}`, room)

  return tag === '' ? left : `${left.padEnd(room)}  ${tag}`
}

type BatchProps = {
  ui: { Box: any; Text: any; Button: any }
  rows: Decision[]
  view: PaneView
  width: number
  /** The pane's rows: under the compact threshold the keys go under the heading and the rows are paged. */
  paneRows?: number
  onChanged: () => void
  onLeave: () => void
  /** The pane has the keys, so the ring (and its `›`) is shown. */
  isFocused?: boolean
}

/** Rows the compact batch screen keeps for itself: the pane's header, the heading, the key line and the notice. */
const BATCH_COMPACT_FIXED = 4

/** The page of batch rows drawn: the one holding the ringed row, else the one `o` moved to. */
export function batchPage(rows: Decision[], ringed: string | undefined, size: number, compactPage: number): number {
  const pages = Math.max(1, Math.ceil(rows.length / Math.max(1, size)))
  const at = rows.findIndex(d => d.id === ringed)

  return at >= 0 ? Math.floor(at / Math.max(1, size)) : Math.min(Math.max(0, compactPage), pages - 1)
}

async function goToList($: any, notice: string | undefined, onChanged: () => void, onLeave: () => void): Promise<void> {
  await setView($, v => ({ ...v, screen: 'list', marks: {}, batchRow: undefined, notice }))
  onChanged()
  onLeave()
}

async function setMark($: any, rows: Decision[], option: number): Promise<void> {
  const view = await readView($)
  await setView($, v => ({ ...v, marks: markRow(v.marks, rows, view.batchRow ?? rows.find(isUnanswered)?.id, option) }))
}

async function confirmOne($: any, rows: Decision[], id: string, props: BatchProps): Promise<void> {
  const view = await readView($)
  const mark = view.marks[id]
  if (mark === undefined) {
    return
  }
  const result = await confirmMarks($, rows, { [id]: mark })
  const next = nextUnanswered(rows, id)
  await setView($, v => ({
    ...v,
    marks: Object.fromEntries(Object.entries(v.marks).filter(([k]) => k !== id)),
    notice: result.notice,
    ...(next === undefined ? {} : { batchRow: next.id }),
  }))
  props.onChanged()
  if (next === undefined) {
    await goToList($, result.notice, props.onChanged, props.onLeave)
  } else {
    focusLater($, `batch:${next.id}`)
  }
}

async function confirmAll($: any, rows: Decision[], props: BatchProps): Promise<void> {
  const view = await readView($)
  const result = await confirmMarks($, rows, liveMarks(view.marks, rows))
  await goToList($, result.notice, props.onChanged, props.onLeave)
}

async function backFromBatch($: any, rows: Decision[], props: BatchProps): Promise<void> {
  const view = await readView($)
  if (Object.keys(liveMarks(view.marks, rows)).length > 0) {
    await setView($, v => ({ ...v, marks: {} }))

    return
  }
  await goToList($, undefined, props.onChanged, props.onLeave)
}

/** The assumptions batch: every row with its mark, `1` and `2` on the ringed row, `r` for the rest, `Confirm` to save. Compact: keys under the heading, rows paged with `o`. Returns an element tree. */
export function BatchView($: any, props: BatchProps): any {
  const { ui, rows, view, width } = props
  const { Box, Text, Button } = ui
  const marks = liveMarks(view.marks, rows)
  const count = Object.keys(marks).length
  const first = rows.find(isUnanswered)
  const paneRows = props.paneRows ?? 30
  const compact = isCompact(paneRows)
  const size = compact ? Math.max(1, paneRows - BATCH_COMPACT_FIXED) : Math.max(1, rows.length)
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const page = batchPage(rows, view.batchRow, size, view.compactPage)
  const shown = rows.slice(page * size, (page + 1) * size)
  const firstShown = shown.find(isUnanswered)

  const row = (d: Decision) => (
    <Button
      key={`batch:${d.id}`}
      plain
      autoFocus={d === (compact ? firstShown : first) ? true : undefined}
      onPress={async () => {
        if (marks[d.id] !== undefined && isUnanswered(d)) {
          await confirmOne($, rows, d.id, props)
        } else if (isUnanswered(d)) {
          await setView($, v => ({ ...v, screen: 'decision', decisionId: d.id, highlight: undefined, isParking: false, notice: undefined }))
          focusLater($, 'discuss')
        }
      }}
    >
      {`${ringMark(`batch:${d.id}`, view.ring, props.isFocused === true)} `}
      {d.state === 'ready' ? <Text dimColor>{batchRowText(d, undefined, width - 2)}</Text> : batchRowText(d, marks[d.id], width - 2)}
    </Button>
  )
  const hints: Hint[] = [
    { id: '1', keyText: '1', label: 'right', hotkey: '1', onPress: () => void setMark($, rows, RIGHT) },
    { id: '2', keyText: '2', label: 'wrong', hotkey: '2', onPress: () => void setMark($, rows, WRONG) },
    {
      id: 'r',
      keyText: 'r',
      label: 'rest right',
      hotkey: 'r',
      onPress: async () => {
        await setView($, v => ({ ...v, marks: markRest(liveMarks(v.marks, rows), rows) }))
        focusLater($, 'confirm')
      },
    },
    ...(compact && pages > 1
      ? [
          {
            id: 'o',
            keyText: 'o',
            label: 'more',
            hotkey: 'o',
            onPress: () => {
              const next = (page + 1) % pages
              const target = rows.slice(next * size, (next + 1) * size).find(isUnanswered) ?? rows[next * size]
              void setView($, v => ({ ...v, compactPage: next, batchRow: target?.id }))
              if (target) {
                focusLater($, `batch:${target.id}`)
              }
            },
          },
        ]
      : []),
    { id: 'b', keyText: 'b', label: 'back', hotkey: 'b', onPress: () => void backFromBatch($, rows, props) },
  ]
  const confirmButton =
    count > 0 ? (
      <Button key="confirm" variant="primary" onPress={() => confirmAll($, rows, props)}>
        {`Confirm ${count}`}
      </Button>
    ) : null

  if (compact) {
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold>{`Check ${rows.filter(isUnanswered).length} assumptions  `}</Text>
          {confirmButton}
        </Box>
        {KeyHints(ui, hints, width, 1)}
        {shown.map(row)}
        {view.notice ? <Text dimColor>{truncate(view.notice, width)}</Text> : null}
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Text bold>{`Check ${rows.filter(isUnanswered).length} assumptions`}</Text>
      {rows.map(row)}
      {Rule(ui, width, 'rule:batch')}
      {view.notice ? <Text dimColor>{view.notice}</Text> : null}
      {confirmButton}
      {KeyHints(ui, hints, width, 2)}
    </Box>
  )
}
