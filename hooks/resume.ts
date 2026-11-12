import { carryOver, readFor } from './session'
import { readEvery, write } from './store'
import type { Decision, StoreCtx } from './store'

type Message = { role: string; text?: string; toolUses?: { tool: string; input?: Record<string, unknown>; result?: unknown; text?: string }[] }

const DECISIONS_TOOL = /(^|__)decisions_(add|update|answer|session|list)$/
const PROMPT_LINE = /^(?:On )?[Dd]ecision d?(\d+) ·/gm
const ID = /\bd(\d+)\b/g

/**
 * The decision ids a conversation touched: the ids in the decisions tools' inputs and results, and
 * the `Decision dN ·` / `On decision N ·` lines of the pane's own prompts. Anything else that
 * happens to say `d12` (a Bash result, Claude's prose) is left out.
 */
export function idsInConversation(messages: Message[]): Set<string> {
  const ids = new Set<string>()
  for (const m of messages) {
    for (const use of m.toolUses ?? []) {
      if (!DECISIONS_TOOL.test(use.tool)) {
        continue
      }
      const text = [typeof use.input?.id === 'string' ? use.input.id : '', typeof use.result === 'string' ? use.result : '', use.text ?? ''].join(' ')
      for (const match of text.matchAll(ID)) {
        ids.add(`d${match[1]}`)
      }
    }
    if (m.role === 'user') {
      for (const match of (m.text ?? '').matchAll(PROMPT_LINE)) {
        ids.add(`d${match[1]}`)
      }
    }
  }

  return ids
}

/** The other sessions those ids are stored under: the session a resumed conversation came from. */
export function sessionsToAdopt(ids: Set<string>, all: Decision[], current: string): string[] {
  const sessions = all.filter(d => ids.has(d.id) && d.session !== undefined && d.session !== '' && d.session !== current).map(d => d.session as string)

  return [...new Set(sessions)]
}

/** Moves every decision of those sessions, and the newest of their session records, to this session (row 291). */
export async function adoptSessions($: StoreCtx, from: string[]): Promise<void> {
  const to = await $.session.id()
  const all = await readEvery($)
  for (const d of all) {
    if (d.session !== undefined && from.includes(d.session) && d.session !== to) {
      await write($, { ...d, session: to, movedFrom: d.session })
    }
  }
  const records = (await Promise.all(from.map(async id => ({ id, record: await readFor($, id) })))).filter(r => r.record !== undefined)
  const newest = records.sort((a, b) => (b.record!.updatedAt > a.record!.updatedAt ? 1 : -1))[0]
  if (newest) {
    await carryOver($, newest.id, to)
  }
}

/**
 * After a resume in a new process the conversation has a new session id, and Claude Code doesn't
 * say which one it resumed. The conversation itself does: the decisions it added, changed or was
 * sent. Adopts the sessions those were stored under, and returns them; a fresh session adopts none.
 */
export async function followResume($: StoreCtx & { session: { messages: () => Promise<unknown[]> } }): Promise<string[]> {
  let messages: Message[] = []
  try {
    messages = ((await $.session.messages()) ?? []) as Message[]
  } catch {
    messages = []
  }
  const ids = idsInConversation(messages)
  if (ids.size === 0) {
    return []
  }
  const from = sessionsToAdopt(ids, await readEvery($), await $.session.id())
  if (from.length > 0) {
    await adoptSessions($, from)
  }

  return from
}

export type OtherSession = { session: string; title: string; waiting: number; at: string }

const WAITING = new Set(['open', 'live', 'ready'])

/** Other sessions in this repository with decisions not yet sent, newest first, at most three: what an empty pane offers to carry on from. */
export async function otherSessions($: StoreCtx): Promise<OtherSession[]> {
  const current = await $.session.id()
  const by = new Map<string, Decision[]>()
  for (const d of await readEvery($)) {
    if (d.session === undefined || d.session === '' || d.session === current) {
      continue
    }
    by.set(d.session, [...(by.get(d.session) ?? []), d])
  }
  const out: OtherSession[] = []
  for (const [session, ds] of by) {
    const waiting = ds.filter(d => WAITING.has(d.state))
    if (waiting.length === 0) {
      continue
    }
    const newest = [...ds].sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1))[0]!
    const title = (await readFor($, session))?.title ?? newest.group ?? 'Another session'
    out.push({ session, title, waiting: waiting.length, at: newest.updatedAt })
  }

  return out.sort((a, b) => (b.at > a.at ? 1 : -1)).slice(0, 3)
}
