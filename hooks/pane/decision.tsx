import { atom, read, update } from 'claude-code'

import type { PaneView } from '../../types'
import { reopenDependents, reopenNotice } from '../dependents'
import { readOne, write } from '../store'
import type { Decision, StoreCtx } from '../store'

export const PANE_ID = 'decisions'
export const GAP_MS = 1000

export const INITIAL_VIEW: PaneView = {
  screen: 'list',
  ticked: [],
  isParking: false,
  parkDraft: '',
  isHidden: false,
  isAsking: false,
  isMarking: false,
  drafts: {},
  pending: [],
  threadSkip: 0,
  sectionPage: 0,
  marks: {},
}

// Change the tag when PaneView's fields change: it declines what an earlier version stored.
const viewAtom = atom({ plugin: 'decisions', key: 'view' } as const, INITIAL_VIEW, { shape: 'view-3' })

export type Typed = { digit: string; at: number } | undefined
export type Typing = { typed: Typed; option: number | undefined }

/** The digit keys' memory. It's a plain object because two quick keys run their handlers before the first await settles. */
export const typing: Typing = { typed: undefined, option: undefined }

/**
 * The option a digit highlights. A `1` followed by a digit within the gap reads as
 * `1x` when that option exists; anything else is the digit alone, `0` meaning 10.
 * Undefined when the option doesn't exist.
 */
export function highlightFor(
  digit: string,
  now: number,
  previous: Typed,
  optionCount: number,
  gapMs: number = GAP_MS,
): { option: number | undefined; typed: Typed } {
  const alone = Number(digit === '0' ? '10' : digit)
  const joined = previous !== undefined && previous.digit === '1' && now - previous.at <= gapMs ? Number('1' + digit) : 0

  if (joined >= 10 && joined <= optionCount) {
    return { option: joined, typed: { digit: 'joined', at: now } }
  }

  return { option: alone >= 1 && alone <= optionCount ? alone : undefined, typed: { digit, at: now } }
}

/**
 * Moves the focus ring for one digit. The state is written before the engine is
 * asked, because two quick keys don't wait for the first focus call to answer.
 */
export async function pressDigit(
  $: { ui: { focus: (args: { requestId: string; key: string }) => Promise<unknown> } },
  digit: string,
  now: number,
  optionCount: number,
  state: Typing = typing,
): Promise<number | undefined> {
  const result = highlightFor(digit, now, state.typed, optionCount)
  state.typed = result.typed
  state.option = result.option
  if (result.option === undefined) {
    return undefined
  }
  await $.ui.focus({ requestId: PANE_ID, key: `opt:${result.option}` })

  return result.option
}

/** `a`: highlights the recommended option. Nothing happens without one. */
export async function highlightRecommendation(
  $: { ui: { focus: (args: { requestId: string; key: string }) => Promise<unknown> } },
  d: Decision,
  state: Typing = typing,
): Promise<number | undefined> {
  const option = d.recommendation?.option
  if (option === undefined || !d.options.some(o => o.id === option)) {
    return undefined
  }
  state.option = option
  await $.ui.focus({ requestId: PANE_ID, key: `opt:${option}` })

  return option
}

/**
 * `b`: with a highlight, clears it (the ring goes back to Discuss); with none, goes
 * back to the list.
 */
export async function back(
  $: { ui: { focus: (args: { requestId: string; key: string }) => Promise<unknown> } },
  view: PaneView,
  state: Typing = typing,
): Promise<PaneView> {
  state.typed = undefined
  state.option = undefined
  if (view.highlight !== undefined) {
    await $.ui.focus({ requestId: PANE_ID, key: 'discuss' })

    return { ...view, highlight: undefined }
  }

  return { ...view, screen: 'list', decisionId: undefined, isParking: false, notice: undefined }
}

/** Records the answer and makes the decision ready. Refused (undefined) once it is sent, or for an option that isn't there. */
export async function chooseOption(store: StoreCtx, d: Decision, option: number): Promise<Decision | undefined> {
  if (d.state === 'sent' || !d.options.some(o => o.id === option)) {
    return undefined
  }
  const next: Decision = {
    ...((await readOne(store, d.id)) ?? d),
    state: 'ready',
    answer: { option, answeredAt: new Date().toISOString() },
  }
  await write(store, next)

  return next
}

/**
 * Chooses an option and, when it replaces a different earlier answer, reopens the
 * decisions that depend on this one. Returns the decision and the notice for the list.
 */
export async function chooseAndReopen(store: StoreCtx, d: Decision, option: number): Promise<{ decision: Decision; notice?: string } | undefined> {
  const previous = ((await readOne(store, d.id)) ?? d).answer
  const decision = await chooseOption(store, d, option)
  if (!decision) {
    return undefined
  }
  if (previous?.option === undefined || previous.option === option) {
    return { decision }
  }

  return { decision, notice: reopenNotice(d.id, await reopenDependents(store, decision, previous)) }
}

export async function parkDecision(store: StoreCtx, d: Decision, reason: string): Promise<boolean> {
  if (reason.trim() === '') {
    return false
  }
  await write(store, { ...((await readOne(store, d.id)) ?? d), state: 'parked', parkedReason: reason.trim(), parkedAt: new Date().toISOString() })

  return true
}

export async function unparkDecision(store: StoreCtx, d: Decision): Promise<void> {
  const { parkedReason: _gone, parkedAt: _also, ...rest } = (await readOne(store, d.id)) ?? d
  await write(store, { ...rest, state: 'open' })
}

const STATE_TEXT: Record<string, string> = {
  open: 'open',
  live: 'open, in discussion',
  ready: 'answered, ready to send',
  sent: 'answered and sent',
  parked: 'parked',
}

/** The state line: the kind first for every kind but choice ("finding, open"). */
export function stateLine(d: Decision): string {
  const state = STATE_TEXT[d.state] ?? d.state
  const kind = d.isTask ? 'to do' : d.kind === 'choice' ? undefined : d.kind

  return kind ? `${kind}, ${state}` : state
}

function answerText(d: Decision): string {
  const option = d.options.find(o => o.id === d.answer?.option)

  return option ? `${option.id} ${option.label}` : (d.answer?.text ?? 'no answer')
}

/** The line under a reopened decision, only while it is open or live. */
export function reopenedLine(d: Decision): string | undefined {
  if (d.reopenedBy === undefined || (d.state !== 'open' && d.state !== 'live')) {
    return undefined
  }
  const was = d.reopenedBy.was
  const option = d.options.find(o => o.id === was?.option)
  const had = was ? ` You had answered ${option ? `${option.id} ${option.label}` : (was.text ?? 'it')}.` : ''

  return `Reopened because ${d.reopenedBy.id} changed.${had}`
}

/** "Blocks:" and "Depends on:" lines for one decision, given all of them. */
export function dependencyLines(d: Decision, all: Decision[]): string[] {
  const lines = d.blocks ? [`Blocks: ${d.blocks}`] : []
  for (const id of d.dependsOn) {
    const other = all.find(x => x.id === id)
    if (!other) {
      continue
    }
    const status =
      other.state === 'ready' || other.state === 'sent' ? `answered ${answerText(other)}` : other.state === 'parked' ? 'parked' : 'not answered yet'
    lines.push(`Depends on: ${other.id}, ${other.title} (${status})`)
  }

  return lines
}

type Props = {
  ui: { Box: any; Text: any; Button: any; Input: any }
  d: Decision
  view: PaneView
  width: number
  readyCount: number
  /** Every decision, so the screen can say what this one depends on. */
  all?: Decision[]
  /** Called after anything that changes a decision, so the status line and pane refresh. */
  onChanged: () => void
  /** Called when the pane has gone back to the list, so the ring can be put on its first row. */
  onLeave: () => void
  onSend: () => void
  onHide: () => void
}

/** The only places the pane's state is read and written: the scan follows `$` into function declarations, and a state reference only where it's written. */
export function setView($: any, change: (v: PaneView) => PaneView): Promise<unknown> {
  return update($, viewAtom, change)
}

/** Moves the ring to a key once the next draw has put it on screen. */
export function focusLater($: any, key: string): void {
  $.clock.after(80, () => {
    void $.ui.focus({ requestId: PANE_ID, key }).catch(() => undefined)
  })
}

export function readView($: any): Promise<PaneView> {
  return read($, viewAtom)
}

/** One decision: its text, numbered options, and the keys under a rule. Returns an element tree. */
export function DecisionView($: any, props: Props): any {
  const { ui, d, view, width, readyCount, onChanged, onLeave, onSend, onHide } = props
  const { Box, Text, Button, Input } = ui
  const isSent = d.state === 'sent'
  const chosen = d.answer?.option
  const digits = Array.from({ length: Math.min(d.options.length, 10) }, (_, i) => (i + 1 === 10 ? '0' : String(i + 1)))

  const choose = async (option: number) => {
    const chosen = await chooseAndReopen($, d, option)
    if (chosen) {
      typing.typed = undefined
      typing.option = undefined
      await setView($, v => ({ ...v, screen: 'list', decisionId: undefined, highlight: undefined, notice: chosen.notice }))
      onChanged()
      onLeave()
    }
  }

  return (
    <Box flexDirection="column">
      <Text bold>{d.title}</Text>
      <Text dimColor>{stateLine(d)}</Text>
      {reopenedLine(d) ? <Text bold>{reopenedLine(d)}</Text> : null}
      <Text> </Text>
      <Text>{d.scenario}</Text>
      {dependencyLines(d, props.all ?? []).map(line => (
        <Text key={`dep:${line}`} dimColor>
          {line}
        </Text>
      ))}
      {d.kind === 'question' && !d.isTask && d.state !== 'sent' ? <Text dimColor>Type your answer in the discussion, then d and enter.</Text> : null}
      <Text> </Text>
      {d.options.map(o => {
        const isChosen = chosen === o.id
        const isRecommended = d.recommendation?.option === o.id
        const label = `${isChosen ? '✓' : ' '} ${o.id}  ${o.label}`

        return (
          <Box key={`box:${o.id}`} flexDirection="column">
            <Button key={`opt:${o.id}`} plain onPress={() => choose(o.id)}>
              {chosen !== undefined && !isChosen ? <Text dimColor>{label}</Text> : label}
              {isRecommended ? <Text dimColor> (recommended)</Text> : ''}
              {isChosen ? <Text dimColor> chosen</Text> : ''}
            </Button>
            {o.changes ? (
              <Box paddingLeft={5}>
                <Text dimColor>{o.changes}</Text>
              </Box>
            ) : null}
          </Box>
        )
      })}
      <Button
        key="discuss"
        autoFocus
        onPress={async () => {
          await setView($, v => ({
            ...v,
            screen: 'thread',
            isAsking: (v.drafts[d.id] ?? '') !== '',
            isMarking: false,
            revisionIndex: undefined,
            threadSkip: 0,
            notice: undefined,
          }))
          focusLater($, (view.drafts[d.id] ?? '') !== '' ? 'ask-input' : 'ask')
        }}
      >
        Discuss
      </Button>
      {view.notice ? <Text dimColor>{view.notice}</Text> : null}
      {d.recommendation ? (
        <Text>{`Why ${d.recommendation.option}: ${d.recommendation.reason}`}</Text>
      ) : null}
      {d.state === 'parked' && d.parkedReason ? <Text dimColor>{`Parked: ${d.parkedReason}`}</Text> : null}
      {d.sources.length > 0 ? <Text dimColor>{`Sources: ${d.sources.map(s => `${s.label} (${s.path})`).join(', ')}`}</Text> : null}
      <Text> </Text>
      <Text dimColor>{'-'.repeat(Math.max(1, width))}</Text>
      {view.isParking ? (
        <Input
          key="park"
          autoFocus
          label="Why park it "
          placeholder="a few words, empty cancels"
          value={view.parkDraft}
          onInput={(text: string) => void setView($, v => ({ ...v, parkDraft: text }))}
          onSubmit={async (text: string) => {
            const isParked = await parkDecision($, d, text)
            await setView($, v => ({
              ...v,
              isParking: false,
              parkDraft: '',
              notice: undefined,
              ...(isParked ? { screen: 'list' as const, decisionId: undefined } : {}),
            }))
            if (isParked) {
              onChanged()
              onLeave()
            }
          }}
        />
      ) : null}
      <Box>
        {isSent
          ? null
          : digits.map(k => (
              <Button
                key={`digit:${k}`}
                hotkey={k}
                plain
                onPress={async () => {
                  const option = await pressDigit($, k, Date.now(), d.options.length)
                  if (option !== undefined) {
                    await setView($, v => ({ ...v, highlight: option }))
                  }
                }}
              >
                {`${k}  `}
              </Button>
            ))}
      </Box>
      {isSent || digits.length === 0 ? null : (
        <Text dimColor>{`Type a number${d.recommendation === undefined ? '' : ' or a'}, then enter to confirm.`}</Text>
      )}
      <Box>
        {isSent || d.recommendation === undefined ? null : (
          <Button
            key="a"
            hotkey="a"
            plain
            onPress={async () => {
              const option = await highlightRecommendation($, d)
              if (option !== undefined) {
                await setView($, v => ({ ...v, highlight: option }))
              }
            }}
          >
            {'recommended  '}
          </Button>
        )}
        <Button key="b" hotkey="b" plain onPress={() => onBack($, onLeave)}>
          {'back  '}
        </Button>
        {isSent ? null : (
          <Button
            key="p"
            hotkey="p"
            plain
            onPress={async () => {
              if (d.state === 'parked') {
                await unparkDecision($, d)
                onChanged()
              } else {
                await setView($, v => ({ ...v, isParking: true }))
                focusLater($, 'park')
              }
            }}
          >
            {d.state === 'parked' ? 'unpark  ' : 'park  '}
          </Button>
        )}
        {readyCount > 0 && !isSent ? (
          <Button key="s" hotkey="s" plain onPress={onSend}>
            {`send ${readyCount}  `}
          </Button>
        ) : null}
        {isSent ? null : (
          <Button key="h" hotkey="h" plain onPress={onHide}>
            {'hide  '}
          </Button>
        )}
      </Box>
    </Box>
  )
}

async function onBack($: any, onLeave: () => void): Promise<void> {
  const next = await back($, await readView($))
  await setView($, () => next)
  if (next.screen === 'list') {
    onLeave()
  }
}
