/** The Session page (rows 253, 255 to 257): what this session is about, where it has got to, its plan and its links. */

import type { PaneView } from '../../types'
import { checkPrStates, readSession } from '../session'
import type { PlanItem, PlanStep, SessionLink, SessionRecord } from '../session'
import type { StoreCtx } from '../store'
import { focusLater, readView, setView } from './decision'
import { KeyHints, Rule, isCompact, wrapLines } from './look'
import type { Hint } from './look'
import { ago } from './seen'
import { colourProps } from './style'

export const REFRESH_PROMPT = 'Refresh the session record with decisions_session: title, summary, now line and plan, from where the work is now.'

/** What `r` sends (row 256). */
export function refreshPrompt(): string {
  return REFRESH_PROMPT
}

/** One plan line as drawn: its mark and colour, its number (`1`, `2.1`), the text and a note for the right. */
export type PlanLine = { key: string; depth: 0 | 1; mark: string; colour: string; number: string; text: string; note?: string }

const MARK: Record<PlanStep['status'], { mark: string; colour: string }> = {
  done: { mark: '✓', colour: 'success' },
  active: { mark: '▶', colour: 'claude' },
  todo: { mark: '·', colour: 'dim' },
}

const INDENT = 5

function cutTo(text: string, room: number): string {
  return text.length <= room ? text : `${text.slice(0, Math.max(0, room - 1))}…`
}

/** The plan as lines: numbered `1` and `2.1`, `✓ ▶ ·`, a note (or what it waits on) cut at the right; with `foldDone`, done items at each level become one `✓ N done` line. */
export function planLines(plan: PlanItem[], width: number, foldDone: boolean): PlanLine[] {
  const lines: PlanLine[] = []
  const level = (items: PlanStep[] | PlanItem[], depth: 0 | 1, prefix: string) => {
    const done = items.filter(i => i.status === 'done').length
    let folded = false
    items.forEach((item, index) => {
      const number = `${prefix}${index + 1}`
      if (foldDone && item.status === 'done') {
        if (!folded) {
          lines.push({ key: `fold:${number}`, depth, mark: '✓', colour: 'success', number: '', text: `${done} done` })
          folded = true
        }
        return
      }
      const lead = depth * INDENT + `${MARK[item.status].mark} ${number}  `.length
      const text = cutTo(item.text, Math.max(8, width - lead))
      const rawNote = item.note ?? (item.waitsOn && item.waitsOn.length > 0 ? `waits on ${item.waitsOn.join(' · ')}` : undefined)
      const room = width - lead - text.length - 2
      const note = rawNote === undefined || room < 2 ? undefined : cutTo(rawNote, room)
      lines.push({ key: `plan:${number}`, depth, ...MARK[item.status], number, text, ...(note !== undefined ? { note } : {}) })
      const steps = depth === 0 ? (item as PlanItem).steps : undefined
      if (steps && steps.length > 0) {
        level(steps, 1, `${number}.`)
      }
    })
  }
  level(plan, 0, '')

  return lines
}

/** What the page says about a refresh: while Claude is asked, and after a turn that ended with no update, until a key (row 256). */
export function refreshLine(refresh: PaneView['sessionRefresh'], record: SessionRecord | undefined): string | undefined {
  if (refresh === undefined) {
    return undefined
  }
  if (record !== undefined && record.updatedAt > refresh.askedAt) {
    return undefined
  }

  if (refresh.status === 'failed') {
    return "Couldn't ask Claude to refresh"
  }

  return refresh.status === 'asked' ? '✻ asked Claude to refresh' : "Claude didn't update it"
}

/** How long an unanswered refresh holds `r` back when no refresh turn is running (row 286). */
export const REFRESH_STALE_MS = 2 * 60_000

/** Whether `r` sends the refresh prompt: not while one is out and fresh, or while its turn runs; again after a failure or once it's gone stale. */
export function canRefresh(refresh: PaneView['sessionRefresh'], now: Date, isTurnRunning: boolean): boolean {
  if (refresh?.status !== 'asked') {
    return true
  }

  return !isTurnRunning && now.getTime() - Date.parse(refresh.askedAt) > REFRESH_STALE_MS
}

let refreshTurn: string | undefined

/** Whether the refresh prompt's turn has started and not ended. */
export function isRefreshTurnRunning(): boolean {
  return refreshTurn !== undefined
}

/** `/clear` or `/resume`: the refresh turn belongs to the session that went, so its end is never taken for this one's. */
export function forgetRefreshTurn(): void {
  refreshTurn = undefined
}

/** On `/clear` or `/resume`: forget the refresh turn and drop a refresh still out, so the page doesn't stay on asked (row 286). */
export async function dropRefresh($: any): Promise<void> {
  forgetRefreshTurn()
  await setView($, v => (v.sessionRefresh === undefined ? v : { ...v, sessionRefresh: undefined }))
}

/**
 * The turn hooks' part for a refresh: `start` claims the turn whose text is the refresh prompt; `complete` answers
 * whether the claimed turn ended. A subagent's turn is never it.
 */
export function noteRefreshTurn(e: { text?: string; turnId: string; agentId?: string }, phase: 'start' | 'complete'): boolean {
  if (e.agentId !== undefined) {
    return false
  }
  if (phase === 'start') {
    if ((e.text ?? '').includes(REFRESH_PROMPT)) {
      refreshTurn = e.turnId
      return true
    }
    return false
  }
  if (refreshTurn !== undefined && refreshTurn === e.turnId) {
    refreshTurn = undefined
    return true
  }

  return false
}

/** The refresh turn ended: if the record didn't change since it was asked, the page says so. */
export async function refreshTurnEnded($: any): Promise<void> {
  const view = await readView($)
  if (view.sessionRefresh?.status !== 'asked') {
    return
  }
  const record = await readSession($)
  await setView($, v => ({ ...v, sessionRefresh: record !== undefined && record.updatedAt > view.sessionRefresh!.askedAt ? undefined : { ...view.sessionRefresh!, status: 'no-update' } }))
  $.ui.invalidate('ui.render')
}

/** The pull request check the page's open handler runs (row 257): never from the draw. */
export async function checkOnOpen($: StoreCtx): Promise<SessionRecord | undefined> {
  const record = await readSession($)

  return record === undefined ? undefined : checkPrStates($, record).catch(() => record)
}

/** Opens the Session page and checks pull request states due a check. */
export async function openSessionPage($: any): Promise<void> {
  await setView($, v => ({ ...v, screen: 'session', sessionLinksOpen: false, notice: undefined }))
  await checkOnOpen($)
  $.ui.invalidate('ui.render')
}

/** `✓ merged · checked 2m ago` for a PR link, `artifact` for a page. */
export function linkState(link: SessionLink, now: Date = new Date()): { text: string; colour?: string } {
  if (link.kind !== 'pr') {
    return { text: link.kind === 'artifact' ? 'artifact' : '', colour: 'dim' }
  }
  const checked = link.checkedAt ? ` · checked ${ago(link.checkedAt, now)}` : ''
  if (link.state === 'merged') {
    return { text: `✓ merged${checked}`, colour: 'success' }
  }

  return { text: `${link.state ?? 'open'}${checked}`, colour: link.state === 'closed' ? 'dim' : undefined }
}

type Props = {
  ui: { Box: any; Text: any; Button: any; Link?: any }
  record: SessionRecord | undefined
  view: PaneView
  width: number
  rows: number
  isFocused: boolean
  onLeave: () => void
  onHide: () => void
  /** Sends the refresh prompt; the screen calls it once per `r`. */
  onRefresh?: () => void
}

/** The Session page. Compact: the title, the now line and the plan with done folded; links behind `o`. */
export function SessionView($: any, props: Props): any {
  const { ui, record, view, width, rows, onLeave, onHide } = props
  const { Box, Text } = ui
  const compact = isCompact(rows)
  const foldDone = compact || view.isDoneFolded === true
  const now = new Date()
  const clearRefresh = () => (view.sessionRefresh?.status === 'no-update' || view.sessionRefresh?.status === 'failed' ? setView($, v => ({ ...v, sessionRefresh: undefined })) : Promise.resolve())
  const hints: Hint[] = [
    {
      id: 'r',
      keyText: 'r',
      label: 'refresh',
      hotkey: 'r',
      onPress: async () => {
        const current = await readView($)
        if (!canRefresh(current.sessionRefresh, new Date(), isRefreshTurnRunning())) {
          return
        }
        await setView($, v => ({ ...v, sessionRefresh: { askedAt: new Date().toISOString(), status: 'asked' } }))
        props.onRefresh?.()
      },
    },
    ...(compact
      ? [{ id: 'o', keyText: 'o', label: view.sessionLinksOpen ? 'plan' : 'links', hotkey: 'o', onPress: () => void clearRefresh().then(() => setView($, v => ({ ...v, sessionLinksOpen: !v.sessionLinksOpen }))) }]
      : [{ id: 'm', keyText: 'm', label: foldDone ? 'show done' : 'fold done', hotkey: 'm', onPress: () => void clearRefresh().then(() => setView($, v => ({ ...v, isDoneFolded: !v.isDoneFolded }))) }]),
    {
      id: 'b',
      keyText: 'b',
      label: 'back',
      hotkey: 'b',
      // The ring starts on back, never on r: a second enter must not send the refresh prompt.
      autoFocus: true,
      onPress: async () => {
        await setView($, v => ({ ...v, screen: 'list', sessionLinksOpen: false, sessionRefresh: v.sessionRefresh?.status === 'asked' ? v.sessionRefresh : undefined }))
        onLeave()
      },
    },
    { id: 'h', keyText: 'h', label: 'hide', hotkey: 'h', onPress: onHide },
  ]
  if (record === undefined) {
    return (
      <Box flexDirection="column">
        <Text dimColor>No session record yet. Claude writes one with decisions_session, or r asks it to.</Text>
        {KeyHints(ui, hints, width, 1)}
      </Box>
    )
  }
  const nowLine = record.now ? `▶ now  ${record.now.text}${record.now.waitsOn && record.now.waitsOn.length > 0 ? ` · waits on ${record.now.waitsOn.join(', ')}` : ''}` : undefined
  const refresh = refreshLine(view.sessionRefresh, record)
  const plan = planLines(record.plan, width, foldDone)
  const showLinks = record.links.length > 0 && (!compact || view.sessionLinksOpen === true)
  const showPlan = !compact || view.sessionLinksOpen !== true
  const planRow = (line: PlanLine) => (
    <Box key={line.key}>
      <Text>{' '.repeat(line.depth * INDENT)}</Text>
      <Text {...colourProps(line.colour)}>{line.mark}</Text>
      <Text>{line.number === '' ? ` ${line.text}` : ` ${line.number}  ${line.text}`}</Text>
      {line.note !== undefined ? <Text dimColor>{`${' '.repeat(Math.max(2, width - line.depth * INDENT - 1 - (line.number === '' ? 1 : line.number.length + 3) - line.text.length - line.note.length))}${line.note}`}</Text> : null}
    </Box>
  )
  const linkRow = (link: SessionLink, index: number) => {
    const state = linkState(link, now)

    return (
      <Box key={`link:${index}`}>
        {ui.Link ? <ui.Link href={link.url}>{link.label}</ui.Link> : <Text>{link.label}</Text>}
        {state.text !== '' ? <Text {...colourProps(state.colour)}>{`  ${state.text}`}</Text> : null}
      </Box>
    )
  }
  const updated = `updated ${ago(record.updatedAt, now)} by ${record.updatedBy === 'claude' ? 'Claude' : 'the pane'}`

  return (
    <Box flexDirection="column">
      <Text bold>{record.title ?? 'This session'}</Text>
      {compact
        ? null
        : wrapLines(record.summary ?? '', width)
            .filter(line => line !== '')
            .map((line, index) => (
              <Text key={`summary:${index}`} dimColor>
                {line}
              </Text>
            ))}
      {nowLine ? <Text key="now">{nowLine}</Text> : null}
      {refresh ? <Text key="refresh" color={refresh.startsWith('✻') ? 'claude' : undefined} dimColor={!refresh.startsWith('✻') || undefined}>{refresh}</Text> : null}
      {showPlan && plan.length > 0 ? (compact ? null : <Text key="plan-heading" bold>Plan</Text>) : null}
      {showPlan ? plan.map(planRow) : null}
      {showLinks ? (compact ? null : <Text key="links-heading" bold>Links</Text>) : null}
      {showLinks ? record.links.map(linkRow) : null}
      {compact ? null : <Text key="updated" dimColor>{updated}</Text>}
      {compact ? null : Rule(ui, width, 'rule:session-keys')}
      {KeyHints(ui, hints, width, compact ? 1 : 2)}
    </Box>
  )
}

/** Puts the ring on the page's back key once it is drawn. */
export function focusSessionPage($: any): void {
  focusLater($, 'b')
}
