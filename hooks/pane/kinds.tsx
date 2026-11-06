import type { PaneView } from '../../types'
import type { Decision, StoreCtx } from '../store'
import { chooseAndReopen, focusLater, readView, setView } from './decision'
import { truncate } from './list'

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
  onChanged: () => void
  onLeave: () => void
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
  await setView($, v => ({ ...v, marks: Object.fromEntries(Object.entries(v.marks).filter(([k]) => k !== id)) }))
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

/** The assumptions batch: every row with its mark, `1` and `2` on the ringed row, `r` for the rest, `Confirm` to save. Returns an element tree. */
export function BatchView($: any, props: BatchProps): any {
  const { ui, rows, view, width } = props
  const { Box, Text, Button } = ui
  const marks = liveMarks(view.marks, rows)
  const count = Object.keys(marks).length
  const first = rows.find(isUnanswered)

  return (
    <Box flexDirection="column">
      <Text bold>{`Check ${rows.filter(isUnanswered).length} assumptions`}</Text>
      {rows.map(d => (
        <Button
          key={`batch:${d.id}`}
          plain
          autoFocus={d === first ? true : undefined}
          onPress={async () => {
            if (marks[d.id] !== undefined && isUnanswered(d)) {
              await confirmOne($, rows, d.id, props)
            } else if (isUnanswered(d)) {
              await setView($, v => ({ ...v, screen: 'decision', decisionId: d.id, highlight: undefined, isParking: false, notice: undefined }))
              focusLater($, 'discuss')
            }
          }}
        >
          {d.state === 'ready' ? <Text dimColor>{batchRowText(d, undefined, width)}</Text> : batchRowText(d, marks[d.id], width)}
        </Button>
      ))}
      <Text dimColor>{'-'.repeat(Math.max(1, width))}</Text>
      {count > 0 ? (
        <Button key="confirm" variant="primary" onPress={() => confirmAll($, rows, props)}>
          {`Confirm ${count}`}
        </Button>
      ) : null}
      <Box>
        <Button key="1" hotkey="1" plain onPress={() => setMark($, rows, RIGHT)}>
          {'1 right  '}
        </Button>
        <Button key="2" hotkey="2" plain onPress={() => setMark($, rows, WRONG)}>
          {'2 wrong  '}
        </Button>
        <Button
          key="r"
          hotkey="r"
          plain
          onPress={async () => {
            await setView($, v => ({ ...v, marks: markRest(liveMarks(v.marks, rows), rows) }))
            focusLater($, 'confirm')
          }}
        >
          {'r rest right  '}
        </Button>
        <Button key="b" hotkey="b" plain onPress={() => backFromBatch($, rows, props)}>
          back
        </Button>
      </Box>
    </Box>
  )
}
