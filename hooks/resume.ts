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

/**
 * `activeAt` is when the session's conversation was last written, set only when that was within
 * `RECENTLY_ACTIVE_MS`: the session may still be open in another tab, so the pane hides it behind a
 * row rather than offering it (row 300).
 */
export type OtherSession = { session: string; title: string; waiting: number; at: string; activeAt?: string }

const WAITING = new Set(['open', 'live', 'ready'])

/** A conversation written to within this long may still be open in another tab (row 300). */
export const RECENTLY_ACTIVE_MS = 30 * 60_000

type StatCtx = StoreCtx & { fs: StoreCtx['fs'] & { stat: (path: string) => Promise<{ mtimeMs: number }> } }

/** Where each session's transcript was found, so a redraw stats one file rather than searching again. */
const transcriptPaths = new Map<string, string>()
/** Sessions whose transcript wasn't found, and when that was, so a search isn't repeated on every redraw. */
const notFoundAt = new Map<string, number>()
const SEARCH_AGAIN_MS = 60_000

/** Claude Code's folder name for a working directory under `projects`: every character but a letter or digit becomes `-`. */
export function projectFolder(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-')
}

/**
 * When a session's conversation was last written, from its transcript file's modified time, or
 * undefined when the file can't be found. The transcript is `<id>.jsonl` in Claude Code's
 * `projects` folder, under this working directory's folder or, for a session started in another
 * worktree, another one.
 */
export async function transcriptWrittenAt($: StatCtx, session: string, now = Date.now()): Promise<number | undefined> {
  const at = async (path: string) => {
    try {
      return (await $.fs.stat(path)).mtimeMs
    } catch {
      return undefined
    }
  }
  const known = transcriptPaths.get(session)
  if (known !== undefined) {
    const written = await at(known)
    if (written !== undefined) {
      return written
    }
    transcriptPaths.delete(session)
  }
  if (now - (notFoundAt.get(session) ?? -Infinity) < SEARCH_AGAIN_MS) {
    return undefined
  }
  const config = (await $.env.get('CLAUDE_CONFIG_DIR').catch(() => undefined)) || `${(await $.env.get('HOME')) ?? ''}/.claude`
  const projects = `${config.replace(/\/+$/, '')}/projects`
  const own = projectFolder(await $.session.cwd())
  let folders: string[] = [own]
  try {
    folders = [own, ...(await $.fs.list(projects)).map(entry => entry.name).filter(name => name !== own)]
  } catch {
    // No projects folder to search; the guess above is all there is.
  }
  for (const folder of folders) {
    const path = `${projects}/${folder}/${session}.jsonl`
    const written = await at(path)
    if (written !== undefined) {
      transcriptPaths.set(session, path)
      notFoundAt.delete(session)

      return written
    }
  }
  notFoundAt.set(session, now)

  return undefined
}

/** Forgets where transcripts were found; for tests. */
export function forgetTranscripts(): void {
  transcriptPaths.clear()
  notFoundAt.clear()
}

/**
 * Other sessions in this repository with decisions not yet sent, newest first: what an empty pane
 * offers to carry on from. At most three that haven't been active for 30 minutes, which the pane
 * offers, and at most three that have (with `activeAt`), which it keeps behind a row (row 300).
 */
export async function otherSessions($: StoreCtx, now = Date.now()): Promise<OtherSession[]> {
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
    const written = await transcriptWrittenAt($ as StatCtx, session, now)
    const isRecent = written !== undefined && now - written < RECENTLY_ACTIVE_MS
    out.push({ session, title, waiting: waiting.length, at: newest.updatedAt, ...(isRecent ? { activeAt: new Date(written).toISOString() } : {}) })
  }
  const sorted = out.sort((a, b) => (b.at > a.at ? 1 : -1))

  return [...sorted.filter(o => o.activeAt === undefined).slice(0, 3), ...sorted.filter(o => o.activeAt !== undefined).slice(0, 3)]
}
