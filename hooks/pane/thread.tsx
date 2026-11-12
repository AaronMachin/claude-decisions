import type { PaneView, PendingQuestion } from '../../types'
import { RUN, askQuestion, currentMode, resendToFork } from '../discuss'
import type { Decision, Revision, ThreadEntry } from '../store'
import { focusLater, focusTo, openingOption, setView } from './decision'
import { markSeen, when } from './seen'

export { when }
import { truncate } from './list'
import { Rule } from './look'
import { ChatEntry, chatRows } from './style'

const MODE_NAME = { main: 'main session', fork: 'fork', quick: 'quick model' } as const
const STATE_TEXT: Record<string, string> = {
  open: 'open',
  live: 'open, in discussion',
  ready: 'answered, ready to send',
  sent: 'answered and sent',
  parked: 'parked',
}
const FIXED_ROWS = 18

/** One thing a revision changed, as the thread draws it under its ↻ line (row 252, extra 3). */
export type RevisionChange =
  | { kind: 'added'; text: string }
  | { kind: 'recommendation'; text: string }
  | { kind: 'renamed'; text: string; old: string; number: number; label: string }

/** What changed from the version before a revision to the one after it: options added or renamed, the recommendation moving. */
export function revisionChanges(before: Revision['before'], after: Pick<Decision, 'options' | 'recommendation'>): RevisionChange[] {
  const added: RevisionChange[] = after.options
    .filter(o => !before.options.some(b => b.id === o.id))
    .map(o => ({ kind: 'added', text: `+ ${o.id}  ${o.label}` }))
  const renamed: RevisionChange[] = after.options.flatMap(o => {
    const was = before.options.find(b => b.id === o.id)
    return was && was.label !== o.label ? [{ kind: 'renamed' as const, text: `~ ${o.id}  ${was.label} → ${o.label}`, old: was.label, number: o.id, label: o.label }] : []
  })
  const from = before.recommendation?.option
  const to = after.recommendation?.option
  const moved: RevisionChange[] = from !== to && to !== undefined ? [{ kind: 'recommendation', text: `★ recommendation ${from ?? 'none'} → ${to}` }] : []

  return [...added, ...renamed, ...moved]
}

/** The version a revision led to: the next revision's `before`, or the decision as it is now. */
export function versionAfter(d: Decision, index: number): Pick<Decision, 'options' | 'recommendation'> {
  return d.revisions[index + 1]?.before ?? d
}

/** The changes under a ↻ line, or none when it is not one or nothing visible changed. */
export function changesOf(d: Decision, e: ThreadEntry): RevisionChange[] {
  const revision = e.revision === undefined ? undefined : d.revisions[e.revision]

  return revision === undefined ? [] : revisionChanges(revision.before, versionAfter(d, e.revision!))
}

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

/** Rows an entry takes: its chat line wrapped under itself, or one row for a ↻ line. */
export function rowsOf(e: ThreadEntry, width: number): number {
  if (e.revision !== undefined) {
    return 1
  }
  return chatRows(e, width)
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

/** The view after `b` on the thread, taken from the view as it is now so a reply that landed meanwhile isn't undone. */
export function leaveThread(view: PaneView): PaneView {
  return backFromThread(view).view
}

/** `b` on the thread: off an earlier version back to the thread; otherwise back to the decision. */
export function backFromThread(view: PaneView): { view: PaneView; focusAsk: boolean } {
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

async function goBack($: any, view: PaneView, d: Decision): Promise<void> {
  const next = backFromThread(view)
  // The thread was on screen, so what it showed counts as read.
  await markSeen($, d.id)
  await setView($, leaveThread)
  if (next.focusAsk) {
    await focusTo($, 'ask')
  } else if (next.view.screen === 'decision') {
    focusLater($, `opt:${view.highlight ?? openingOption(d)}`)
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
      {Rule(ui, width)}
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
      {Rule(ui, width)}
      <Button key="b" hotkey="b" plain onPress={() => goBack($, view, d)}>
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
  const visible = visibleEntries(d.thread, view.threadSkip, budget, width, e => pendingFor(e).length * 2 + changesOf(d, e).length)
  const { olderHidden, newerHidden } = visible
  const shown = visible.shown.length === 1 ? [clipToBudget(visible.shown[0]!, budget, width)] : visible.shown
  const draft = view.drafts[d.id] ?? ''

  return (
    <Box flexDirection="column">
      <Text bold>{d.title}</Text>
      <Text dimColor>{STATE_TEXT[d.state] ?? d.state}</Text>
      {Rule(ui, width)}
      {olderHidden > 0 ? <Text dimColor>{`${olderHidden} earlier ${olderHidden === 1 ? 'entry' : 'entries'} · o`}</Text> : null}
      {shown.map(e =>
        e.revision !== undefined ? (
          <Box key={`revision:${e.revision}`} flexDirection="column">
            <Button key={`rev:${e.revision}`} plain onPress={() => setView($, v => ({ ...v, revisionIndex: e.revision }))}>
              {truncate(e.text, width)}
            </Button>
            {changesOf(d, e).length > 0 ? (
              <Box key={`changes:${e.revision}`} flexDirection="column">
                {changesOf(d, e).map((c, index) =>
                  c.kind === 'renamed' ? (
                    <Text key={`change:${index}`}>
                      {`  ~ ${c.number}  `}
                      <Text strikethrough dimColor>
                        {c.old}
                      </Text>
                      {` → ${c.label}`}
                    </Text>
                  ) : (
                    <Text key={`change:${index}`} color={c.kind === 'added' ? 'success' : 'warning'}>
                      {`  ${c.text}`}
                    </Text>
                  ),
                )}
              </Box>
            ) : null}
          </Box>
        ) : (
          <Box key={`entry:${e.at}:${e.who}`} flexDirection="column">
            {ChatEntry(ui, e, width, `chat:${e.at}:${e.who}`)}
            {pendingFor(e).map(p => (
              <Box key={`note:${p.mode}`} paddingLeft={2} flexDirection="column">
                <Text dimColor>{noteFor(p, RUN)}</Text>
                {resendable === p ? <Text dimColor>f send it to the fork instead</Text> : null}
              </Box>
            ))}
          </Box>
        ),
      )}
      {d.thread.length === 0 ? <Text dimColor>No discussion yet. Ask a question below.</Text> : null}
      {newerHidden > 0 ? <Text dimColor>{`${newerHidden} newer ${newerHidden === 1 ? 'entry' : 'entries'} · n`}</Text> : null}
      {view.notice ? <Text dimColor>{view.notice}</Text> : null}
      {Rule(ui, width)}
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
      {Rule(ui, width)}
      {view.isAsking ? null : (
        <Box flexDirection="column">
          <Box>
            {resendable ? (
              <Button key="f" hotkey="f" plain onPress={() => resendToFork($)}>
                {'fork instead  '}
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
            <Button key="b" hotkey="b" plain onPress={() => goBack($, view, d)}>
              {'back  '}
            </Button>
            {readyCount > 0 ? (
              <Button key="s" hotkey="s" plain onPress={onSend}>
                {`send ${readyCount}  `}
              </Button>
            ) : null}
            <Button
              key="h"
              hotkey="h"
              plain
              onPress={async () => {
                await markSeen($, d.id)
                onHide()
              }}
            >
              {'hide  '}
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  )
}
