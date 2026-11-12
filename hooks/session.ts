/** The session record (rows 253, 257): what a session is about, its plan, and the PRs and pages it made. One file per session beside the decisions. */

import { storeDir } from './store'
import type { StoreCtx } from './store'

export type PlanStatus = 'done' | 'active' | 'todo'

export type PlanStep = { text: string; status: PlanStatus; note?: string; waitsOn?: string[] }

export type PlanItem = PlanStep & { steps?: PlanStep[] }

export type LinkState = 'open' | 'merged' | 'closed'

export type SessionLink = {
  url: string
  label: string
  kind: 'pr' | 'artifact' | 'link'
  state?: LinkState
  /** When `gh pr view` last answered for a PR link. */
  checkedAt?: string
  addedBy: 'mod' | 'claude'
}

export type SessionRecord = {
  version: 1
  session: string
  title?: string
  summary?: string
  now?: { text: string; waitsOn?: string[] }
  plan: PlanItem[]
  links: SessionLink[]
  /** The session id this record was carried over from on `/clear` or `/resume`. */
  continuedFrom?: string
  updatedAt: string
  updatedBy: 'claude' | 'mod'
}

export const SESSION_TOOL = 'mcp__decisions__decisions_session'

export const SESSION_DESCRIPTION = `Keeps this session's record in the decisions pane's Session page: a title, a two-line summary of what the session is about, a now line (what you are doing, and the decisions it waits on), a nested plan, and links. Someone flicking between sessions reads it to see what this one is about and where it has got to.

Call it at the start of real work, when the plan or focus changes, and when a plan step finishes. Each call replaces only the fields it gives.

plan: items of { text, status (done, active or todo), note?, waitsOn? (decision ids such as "d4"), steps? }, steps one level deep with the same fields and no steps of their own.
links: { url, label?, state? (open, merged or closed) }, matched by url to add, relabel or mark one. Pull requests you create and pages you publish are added for you. Nothing is removed.`

const PLAN_STEP_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    status: { type: 'string', enum: ['done', 'active', 'todo'] },
    note: { type: 'string' },
    waitsOn: { type: 'array', items: { type: 'string' } },
  },
  required: ['text', 'status'],
}

export const SESSION_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'What the session is about, in a few words.' },
    summary: { type: 'string', description: 'Two sentences: what has been done and what is happening now.' },
    now: {
      type: 'object',
      properties: { text: { type: 'string' }, waitsOn: { type: 'array', items: { type: 'string' } } },
      required: ['text'],
    },
    plan: {
      type: 'array',
      items: { ...PLAN_STEP_SCHEMA, properties: { ...PLAN_STEP_SCHEMA.properties, steps: { type: 'array', items: PLAN_STEP_SCHEMA } } },
    },
    links: {
      type: 'array',
      items: {
        type: 'object',
        properties: { url: { type: 'string' }, label: { type: 'string' }, state: { type: 'string', enum: ['open', 'merged', 'closed'] } },
        required: ['url'],
      },
    },
  },
}

const STATUSES: PlanStatus[] = ['done', 'active', 'todo']
const STATES: LinkState[] = ['open', 'merged', 'closed']

function fileOf(dir: string, session: string): string {
  return `${dir}/session-${session.replace(/[^A-Za-z0-9_-]/g, '-')}.json`
}

async function readFor($: StoreCtx, session: string): Promise<SessionRecord | undefined> {
  try {
    const record = JSON.parse(await $.fs.read(fileOf(await storeDir($), session))) as SessionRecord

    return record.version === 1 ? { ...record, plan: record.plan ?? [], links: record.links ?? [] } : undefined
  } catch {
    return undefined
  }
}

/** This session's record, or undefined before anything was written. */
export async function readSession($: StoreCtx): Promise<SessionRecord | undefined> {
  return readFor($, await $.session.id())
}

let queue: Promise<unknown> = Promise.resolve()

/** Merges a patch into this session's record and writes it, one write at a time so a link and a tool call never lose each other's change. */
export function writeSession($: StoreCtx, patch: Partial<SessionRecord>, by: 'claude' | 'mod' = 'claude'): Promise<SessionRecord> {
  const run = queue.then(async () => {
    const session = await $.session.id()
    const current = (await readFor($, session)) ?? { version: 1 as const, session, plan: [], links: [], updatedAt: '', updatedBy: by }
    const next: SessionRecord = { ...current, ...patch, version: 1, session, updatedAt: new Date().toISOString(), updatedBy: by }
    await $.fs.write(fileOf(await storeDir($), session), JSON.stringify(next, null, 2))

    return next
  })
  queue = run.catch(() => undefined)

  return run
}

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === ''
}

function stepRefusal(step: any, where: string, canNest: boolean): string | undefined {
  if (isBlank(step?.text)) {
    return `decisions_session refused: ${where} has no text.`
  }
  if (!STATUSES.includes(step.status)) {
    return `decisions_session refused: ${where} status must be done, active or todo.`
  }
  if (step.waitsOn !== undefined && (!Array.isArray(step.waitsOn) || step.waitsOn.some((id: unknown) => typeof id !== 'string'))) {
    return `decisions_session refused: ${where} waitsOn must be decision ids such as "d4".`
  }
  if (step.steps !== undefined) {
    if (!canNest) {
      return `decisions_session refused: ${where} has steps; steps nest one level only.`
    }
    if (!Array.isArray(step.steps)) {
      return `decisions_session refused: ${where} steps must be a list.`
    }
    for (const [index, inner] of step.steps.entries()) {
      const refused = stepRefusal(inner, `${where}.${index + 1}`, false)
      if (refused) {
        return refused
      }
    }
  }

  return undefined
}

/** The refusal for a malformed call, or undefined when it's fine. */
export function validateSession(input: Record<string, any>): string | undefined {
  if (['title', 'summary', 'now', 'plan', 'links'].every(field => input[field] === undefined)) {
    return 'decisions_session refused: nothing to change. Give title, summary, now, plan or links.'
  }
  for (const field of ['title', 'summary']) {
    if (input[field] !== undefined && typeof input[field] !== 'string') {
      return `decisions_session refused: ${field} must be text.`
    }
  }
  if (input.now !== undefined && isBlank(input.now?.text)) {
    return 'decisions_session refused: now needs text.'
  }
  if (input.plan !== undefined) {
    if (!Array.isArray(input.plan)) {
      return 'decisions_session refused: plan must be a list.'
    }
    for (const [index, item] of input.plan.entries()) {
      const refused = stepRefusal(item, `plan item ${index + 1}`, true)
      if (refused) {
        return refused
      }
    }
  }
  if (input.links !== undefined) {
    if (!Array.isArray(input.links)) {
      return 'decisions_session refused: links must be a list.'
    }
    for (const link of input.links) {
      if (isBlank(link?.url)) {
        return 'decisions_session refused: each link needs a url.'
      }
      if (link.state !== undefined && !STATES.includes(link.state)) {
        return 'decisions_session refused: a link state must be open, merged or closed.'
      }
    }
  }

  return undefined
}

function cleanStep(step: any, canNest: boolean): PlanItem {
  return {
    text: String(step.text).trim(),
    status: step.status,
    ...(isBlank(step.note) ? {} : { note: String(step.note).trim() }),
    ...(Array.isArray(step.waitsOn) && step.waitsOn.length > 0 ? { waitsOn: step.waitsOn } : {}),
    ...(canNest && Array.isArray(step.steps) ? { steps: step.steps.map((s: any) => cleanStep(s, false)) } : {}),
  }
}

/** Links matched by URL: an existing one takes the new label and state, a new one is added by Claude. Nothing is removed. */
function mergeLinks(links: SessionLink[], given: any[]): SessionLink[] {
  const next = [...links]
  for (const link of given) {
    const url = String(link.url).trim()
    const at = next.findIndex(l => l.url === url)
    const label = isBlank(link.label) ? undefined : String(link.label).trim()
    if (at === -1) {
      next.push({ url, label: label ?? url, kind: kindOf(url), ...(link.state ? { state: link.state } : {}), addedBy: 'claude' })
    } else {
      next[at] = { ...next[at]!, ...(label ? { label } : {}), ...(link.state ? { state: link.state } : {}) }
    }
  }

  return next
}

const PR_URL = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/(\d+)/
const ARTIFACT_URL = /https:\/\/claude\.ai\/(?:code\/)?artifact\/[\w-]+/

function kindOf(url: string): SessionLink['kind'] {
  return PR_URL.test(url) ? 'pr' : ARTIFACT_URL.test(url) ? 'artifact' : 'link'
}

/** The `decisions_session` tool: validates, then replaces only the fields given. */
export async function sessionTool($: StoreCtx, input: Record<string, any>): Promise<{ result: string } | { deny: string }> {
  const refused = validateSession(input)
  if (refused !== undefined) {
    return { deny: refused }
  }
  const current = await readSession($)
  const patch: Partial<SessionRecord> = {
    ...(input.title !== undefined ? { title: String(input.title).trim() } : {}),
    ...(input.summary !== undefined ? { summary: String(input.summary).trim() } : {}),
    ...(input.now !== undefined
      ? { now: { text: String(input.now.text).trim(), ...(Array.isArray(input.now.waitsOn) && input.now.waitsOn.length > 0 ? { waitsOn: input.now.waitsOn } : {}) } }
      : {}),
    ...(input.plan !== undefined ? { plan: input.plan.map((item: any) => cleanStep(item, true)) } : {}),
    ...(input.links !== undefined ? { links: mergeLinks(current?.links ?? [], input.links) } : {}),
  }
  await writeSession($, patch, 'claude')

  return { result: 'Session record updated. The pane shows it on its Session page.' }
}

function textOf(result: any): string {
  if (typeof result?.text === 'string') {
    return result.text
  }
  try {
    return JSON.stringify(result?.result ?? '')
  } catch {
    return ''
  }
}

/** A `--title "…"` or `-t '…'` from a command, or undefined. */
function titleFlag(command: string): string | undefined {
  const match = /(?:--title|-t)(?:=|\s+)(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+))/.exec(command)

  return match ? (match[1] ?? match[2] ?? match[3]) : undefined
}

/**
 * Links a tool call made (rows 253, my call: only links the session made): an Artifact publish's artifact URL, and the
 * pull request a `gh pr create` printed. Anything else, a `gh pr list` or a fetched page full of links included, adds nothing.
 */
export function captureLinks(tool: string, input: any, result: any): SessionLink[] {
  const text = textOf(result)
  if (tool === 'Artifact') {
    const action = input?.action ?? 'publish'
    const url = ARTIFACT_URL.exec(text)?.[0]
    if (action !== 'publish' || input?.asset === true || url === undefined) {
      return []
    }
    const fromFile = typeof input?.file_path === 'string' ? input.file_path.split('/').pop()!.replace(/\.[^.]+$/, '') : undefined
    const label = !isBlank(input?.title) ? String(input.title).trim() : (/"([^"\n]+)"/.exec(text)?.[1] ?? fromFile ?? 'Artifact')

    return [{ url, label, kind: 'artifact', addedBy: 'mod' }]
  }
  if (tool === 'Bash') {
    const command = typeof input?.command === 'string' ? input.command : ''
    if (!/(^|[;&|(\s])gh\s+pr\s+create\b/.test(command)) {
      return []
    }
    const match = PR_URL.exec(text)
    if (!match) {
      return []
    }
    const title = titleFlag(command)

    return [{ url: match[0], label: title ? `#${match[1]} ${title}` : `#${match[1]}`, kind: 'pr', state: 'open', addedBy: 'mod' }]
  }

  return []
}

/** Adds captured links that aren't in the record yet (the first publish of a URL); true when any was added. */
export async function addCapturedLinks($: StoreCtx, links: SessionLink[]): Promise<boolean> {
  if (links.length === 0) {
    return false
  }
  const current = await readSession($)
  const fresh = links.filter(l => !(current?.links ?? []).some(x => x.url === l.url))
  if (fresh.length === 0) {
    return false
  }
  await writeSession($, { links: [...(current?.links ?? []), ...fresh] }, 'mod')

  return true
}

/** On `/clear` or an in-process `/resume` the session id changes: the record follows to the new id (my call), saying where it came from. */
export async function carryOver($: StoreCtx, fromId: string, toId: string): Promise<void> {
  if (fromId === toId || (await readFor($, toId)) !== undefined) {
    return
  }
  const record = await readFor($, fromId)
  if (record === undefined) {
    return
  }
  const next: SessionRecord = { ...record, session: toId, continuedFrom: fromId }
  await $.fs.write(fileOf(await storeDir($), toId), JSON.stringify(next, null, 2))
}

export const PR_CHECK_EVERY_MS = 5 * 60_000

/**
 * Asks `gh pr view <url> --json state,title` for each PR link last checked more than 5 minutes ago (row 257). When `gh`
 * can't answer, the last known state stays with its age. Returns the record, written back when anything changed.
 */
export async function checkPrStates($: StoreCtx, record: SessionRecord, now: Date = new Date()): Promise<SessionRecord> {
  let changed = false
  const links: SessionLink[] = []
  for (const link of record.links) {
    const isDue = link.kind === 'pr' && (link.checkedAt === undefined || now.getTime() - new Date(link.checkedAt).getTime() > PR_CHECK_EVERY_MS)
    if (!isDue) {
      links.push(link)
      continue
    }
    const run = await $.process.run(['gh', 'pr', 'view', link.url, '--json', 'state,title']).catch(() => ({ exitCode: 1, stdout: '' }))
    let state: LinkState | undefined
    try {
      const answer = run.exitCode === 0 ? (JSON.parse(run.stdout) as { state?: string }) : undefined
      const lower = answer?.state?.toLowerCase()
      state = STATES.includes(lower as LinkState) ? (lower as LinkState) : undefined
    } catch {
      state = undefined
    }
    if (state === undefined) {
      links.push(link)
      continue
    }
    links.push({ ...link, state, checkedAt: now.toISOString() })
    changed = true
  }
  if (!changed) {
    return record
  }
  const next = { ...record, links }
  if (record.session === (await $.session.id())) {
    await $.fs.write(fileOf(await storeDir($), record.session), JSON.stringify(next, null, 2))
  }

  return next
}
