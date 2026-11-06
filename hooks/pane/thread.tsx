import type { PaneView, PendingQuestion } from '../../types'
import { RUN, askMain, askQuestion, currentMode, markAnswered, resendToFork } from '../discuss'
import type { Decision, ThreadEntry } from '../store'
import { PANE_ID, focusLater, setView } from './decision'
import { truncate } from './list'

const WHO: Record<ThreadEntry['who'], string> = { person: 'you', claude: 'Claude', fork: 'Fork', quick: 'Quick model' }
const MODE_NAME = { main: 'main session', fork: 'fork', quick: 'quick model' } as const
const STATE_TEXT: Record<string, string> = {
  open: 'open',
  live: 'open, in discussion',
  ready: 'answered, ready to send',
  sent: 'answered and sent',
  parked: 'parked',
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const FIXED_ROWS = 18

/** The dim line under a question that has no reply yet. */
export function noteFor(p: PendingQuestion, run: string): string {
  if (p.run !== run) {
    return 'no reply: the pane was reloaded'
  }
  if (p.status === 'failed') {
    return `no reply: ${p.reason ?? 'unknown reason'}`
  }
  if (p.status === 'queued') {
    return 'queued, Claude is mid-step'
  }
  if (p.status === 'waiting') {
    return 'sent, waiting for Claude'
  }

  return p.mode === 'main' ? 'Claude is answering' : p.mode === 'fork' ? 'asking the fork' : 'asking the quick model'
}

/** True when `f` can send this question to the fork. */
export function isResendable(p: PendingQuestion, run: string): boolean {
  return p.status === 'queued' || p.status === 'failed' || p.run !== run
}

/** `10:42` for today, `4 Nov 10:42` for any other day. */
export function when(at: string, now: Date = new Date()): string {
  const t = new Date(at)
  if (Number.isNaN(t.getTime())) {
    return ''
  }
  const hm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
  const isToday = t.getFullYear() === now.getFullYear() && t.getMonth() === now.getMonth() && t.getDate() === now.getDate()

  return isToday ? hm : `${t.getDate()} ${MONTHS[t.getMonth()]} ${hm}`
}

/** Rows an entry takes: its label and wrapped text, or one row for a ↻ line. */
export function rowsOf(e: ThreadEntry, width: number): number {
  if (e.revision !== undefined) {
    return 1
  }
  const wrap = Math.max(1, width - 2)

  // Words wrap early, so count about 15% more than the characters alone say.
  return 1 + e.text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil((line.length * 1.15) / wrap)), 0)
}

/** An entry cut with `…` so it fits in `budget` rows; the same entry when it already does. */
export function clipToBudget(e: ThreadEntry, budget: number, width: number): ThreadEntry {
  if (rowsOf(e, width) <= budget) {
    return e
  }
  const room = Math.max(1, Math.floor(((budget - 1) * Math.max(1, width - 2)) / 1.15) - 1)

  return { ...e, text: `${e.text.slice(0, room)}…` }
}

/**
 * The newest entries that fit the row budget, counting back from `skip` entries
 * before the end. At least one entry always shows.
 */
export function visibleEntries(
  thread: ThreadEntry[],
  skip: number,
  rowBudget: number,
  width: number,
  extra: (e: ThreadEntry) => number = () => 0,
): { shown: ThreadEntry[]; olderHidden: number; newerHidden: number } {
  const end = Math.max(0, thread.length - Math.max(0, skip))
  let start = end
  let used = 0
  while (start > 0) {
    const cost = rowsOf(thread[start - 1]!, width) + extra(thread[start - 1]!)
    if (used + cost > rowBudget && start < end) {
      break
    }
    used += cost
    start -= 1
  }

  return { shown: thread.slice(start, end), olderHidden: start, newerHidden: thread.length - end }
}

/** `d`: the ring goes to Mark answered, and `enter` then presses it. */
export async function focusMark($: { ui: { focus: (a: { requestId: string; key: string }) => Promise<unknown> } }): Promise<void> {
  await $.ui.focus({ requestId: PANE_ID, key: 'mark' })
}

/** The view after `b` on the thread, taken from the view as it is now so a reply that landed meanwhile isn't undone. */
export function leaveThread(view: PaneView): PaneView {
  return backFromThread(view).view
}

/** `b` on the thread: off Mark answered the ring returns to Ask; otherwise back to the decision. */
export function backFromThread(view: PaneView): { view: PaneView; focusAsk: boolean } {
  if (view.isMarking) {
    return { view: { ...view, isMarking: false }, focusAsk: true }
  }
  if (view.revisionIndex !== undefined) {
    return { view: { ...view, revisionIndex: undefined }, focusAsk: false }
  }

  return {
    view: { ...view, screen: 'decision', isAsking: false, isMarking: false, threadSkip: 0, notice: undefined },
    focusAsk: false,
  }
}

type Props = {
  ui: { Box: any; Text: any; Button: any; Input: any }
  d: Decision
  view: PaneView
  width: number
  /** Rows the pane's window gives the body. */
  rows: number
  readyCount: number
  onChanged: () => void
  onLeave: () => void
  onSend: () => void
  onHide: () => void
}

async function goBack($: any, view: PaneView): Promise<void> {
  const next = backFromThread(view)
  await setView($, leaveThread)
  if (next.focusAsk) {
    await $.ui.focus({ requestId: PANE_ID, key: 'ask' }).catch(() => undefined)
  } else if (next.view.screen === 'decision') {
    focusLater($, 'discuss')
  }
}

/** The earlier version a `↻` line opened: read-only, no option Buttons. */
function EarlierVersion($: any, props: Props, index: number): any {
  const { ui, d, view, width } = props
  const { Box, Text, Button } = ui
  const revision = d.revisions[index]
  if (!revision) {
    return <Text dimColor>That version is no longer there.</Text>
  }
  const before = revision.before

  return (
    <Box flexDirection="column">
      <Text dimColor>{`Before: ${revision.summary}`}</Text>
      <Text dimColor>{`(${when(revision.at)})`}</Text>
      <Text dimColor>{'-'.repeat(Math.max(1, width))}</Text>
      <Text bold>{before.title}</Text>
      <Text> </Text>
      <Text>{before.scenario}</Text>
      <Text> </Text>
      {before.options.map(o => (
        <Box key={`old:${o.id}`} flexDirection="column">
          <Text>
            {`  ${o.id}  ${o.label}`}
            {before.recommendation?.option === o.id ? <Text dimColor> (recommended)</Text> : ''}
          </Text>
          {o.changes ? (
            <Box paddingLeft={5}>
              <Text dimColor>{o.changes}</Text>
            </Box>
          ) : null}
        </Box>
      ))}
      {before.recommendation ? <Text>{`Why ${before.recommendation.option}: ${before.recommendation.reason}`}</Text> : null}
      <Text dimColor>{'-'.repeat(Math.max(1, width))}</Text>
      <Button key="b" hotkey="b" plain onPress={() => goBack($, view)}>
        {'back to the discussion'}
      </Button>
    </Box>
  )
}

/** One decision's discussion: the thread, the box to ask in, and the keys under a rule. */
export function ThreadView($: any, props: Props): any {
  const { ui, d, view, width, rows, readyCount, onChanged, onLeave, onSend, onHide } = props
  if (view.revisionIndex !== undefined) {
    return EarlierVersion($, props, view.revisionIndex)
  }
  const { Box, Text, Button, Input } = ui
  const mine = view.pending.filter(p => p.decisionId === d.id)
  const pendingFor = (e: ThreadEntry) => mine.filter(p => p.asked === e.at)
  const resendable = mine.find(p => isResendable(p, RUN))
  const budget = Math.max(4, rows - FIXED_ROWS)
  const visible = visibleEntries(d.thread, view.threadSkip, budget, width, e => pendingFor(e).length * 2)
  const { olderHidden, newerHidden } = visible
  const shown = visible.shown.length === 1 ? [clipToBudget(visible.shown[0]!, budget, width)] : visible.shown
  const lastReply = d.thread.findLast(e => e.who !== 'person' && e.revision === undefined)
  const canAskMain = lastReply?.who === 'fork' || lastReply?.who === 'quick'
  const canMark = ['open', 'live', 'parked'].includes(d.state)
  const draft = view.drafts[d.id] ?? ''

  const mark = async () => {
    if (await markAnswered($, d.id)) {
      await setView($, v => ({ ...v, screen: 'list', decisionId: undefined, isMarking: false, isAsking: false, threadSkip: 0, notice: undefined }))
      onChanged()
      onLeave()
    }
  }

  return (
    <Box flexDirection="column">
      <Text bold>{d.title}</Text>
      <Text dimColor>{STATE_TEXT[d.state] ?? d.state}</Text>
      <Text dimColor>{'-'.repeat(Math.max(1, width))}</Text>
      {olderHidden > 0 ? <Text dimColor>{`${olderHidden} earlier ${olderHidden === 1 ? 'entry' : 'entries'} · o`}</Text> : null}
      {shown.map(e =>
        e.revision !== undefined ? (
          <Button key={`rev:${e.revision}`} plain onPress={() => setView($, v => ({ ...v, revisionIndex: e.revision }))}>
            {truncate(e.text, width)}
          </Button>
        ) : (
          <Box key={`entry:${e.at}:${e.who}`} flexDirection="column">
            <Text dimColor>{`${WHO[e.who]} · ${when(e.at)}`}</Text>
            <Box paddingLeft={2}>
              <Text>{e.text}</Text>
            </Box>
            {pendingFor(e).map(p => (
              <Box key={`note:${p.mode}`} paddingLeft={2} flexDirection="column">
                <Text dimColor>{noteFor(p, RUN)}</Text>
                {resendable === p ? <Text dimColor>f send it to the fork instead</Text> : null}
              </Box>
            ))}
          </Box>
        ),
      )}
      {newerHidden > 0 ? <Text dimColor>{`${newerHidden} newer ${newerHidden === 1 ? 'entry' : 'entries'} · n`}</Text> : null}
      {view.notice ? <Text dimColor>{view.notice}</Text> : null}
      <Text dimColor>{'-'.repeat(Math.max(1, width))}</Text>
      <Text dimColor>{`Replies from: ${MODE_NAME[currentMode()]}`}</Text>
      {view.isAsking ? (
        <Input
          key="ask-input"
          autoFocus
          label="Ask "
          placeholder="enter sends, empty enter cancels"
          value={draft}
          onInput={(text: string) => void setView($, v => ({ ...v, drafts: { ...v.drafts, [d.id]: text } }))}
          onSubmit={async (text: string) => {
            if (text.trim() === '') {
              await setView($, v => {
                const { [d.id]: _gone, ...drafts } = v.drafts
                return { ...v, isAsking: false, drafts }
              })
            } else {
              await askQuestion($, currentMode(), d.id, text.trim())
            }
            focusLater($, 'ask')
            onChanged()
          }}
        />
      ) : (
        <Button
          key="ask"
          autoFocus
          onPress={async () => {
            await setView($, v => ({ ...v, isAsking: true }))
            focusLater($, 'ask-input')
          }}
        >
          Ask a question
        </Button>
      )}
      {canMark && !view.isAsking ? (
        <Button key="mark" onPress={mark}>
          Mark answered
        </Button>
      ) : null}
      <Text dimColor>{'-'.repeat(Math.max(1, width))}</Text>
      {view.isAsking ? null : (
        <Box flexDirection="column">
          <Box>
            {canMark ? (
              <Button
                key="d"
                hotkey="d"
                plain
                onPress={async () => {
                  await setView($, v => ({ ...v, isMarking: true }))
                  await focusMark($)
                }}
              >
                {'done  '}
              </Button>
            ) : null}
            {resendable ? (
              <Button key="f" hotkey="f" plain onPress={() => resendToFork($)}>
                {'fork instead  '}
              </Button>
            ) : null}
            {canAskMain ? (
              <Button key="m" hotkey="m" plain onPress={() => askMain($)}>
                {'ask main session  '}
              </Button>
            ) : null}
          </Box>
          <Box>
            {olderHidden > 0 ? (
              <Button key="o" hotkey="o" plain onPress={() => setView($, v => ({ ...v, threadSkip: v.threadSkip + 1 }))}>
                {'older  '}
              </Button>
            ) : null}
            {newerHidden > 0 ? (
              <Button key="n" hotkey="n" plain onPress={() => setView($, v => ({ ...v, threadSkip: Math.max(0, v.threadSkip - 1) }))}>
                {'newer  '}
              </Button>
            ) : null}
            <Button key="b" hotkey="b" plain onPress={() => goBack($, view)}>
              {'back  '}
            </Button>
            {readyCount > 0 ? (
              <Button key="s" hotkey="s" plain onPress={onSend}>
                {`send ${readyCount}  `}
              </Button>
            ) : null}
            <Button key="h" hotkey="h" plain onPress={onHide}>
              {'hide  '}
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  )
}
