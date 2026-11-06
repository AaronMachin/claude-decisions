export type Kind = 'choice' | 'go-ahead' | 'assumption' | 'finding' | 'question'

export type State = 'open' | 'live' | 'ready' | 'sent' | 'parked' | 'superseded' | 'withdrawn'

export type Section = 'needs-you' | 'claudes-call' | 'already-decided'

export type Option = {
  /** 1-based, never reused; what the person types. */
  id: number
  label: string
  /** What it would take and what changes if chosen. */
  changes?: string
  fromDiscussion?: boolean
}

/** `path` is a file path or a URL. */
export type Source = { label: string; path: string }

export type Answer = {
  option?: number
  text?: string
  condition?: string
  answeredAt: string
}

export type ThreadEntry = {
  who: 'person' | 'claude' | 'fork' | 'quick'
  text: string
  at: string
  /** On a ↻ line: the index into `Decision.revisions` of the version it replaced. */
  revision?: number
}

export type Revision = {
  at: string
  summary: string
  before: Omit<Decision, 'revisions' | 'thread'>
}

export type Decision = {
  version: 1
  /** "d7"; the file is d7.json. */
  id: string
  number: number
  group?: string
  section: Section
  kind: Kind
  title: string
  scenario: string
  options: Option[]
  recommendation?: { option: number; reason: string }
  sources: Source[]
  /** Ids of decisions that have to be answered first. */
  dependsOn: string[]
  /** What cannot go on until this is answered, in words. */
  blocks?: string
  /** "For you to do": something the person does themselves. Kind is go-ahead; the options are Done and Can't do it. */
  isTask?: boolean
  /** Set when a decision this one depends on changed its answer. Shown only while this decision is open or live. */
  reopenedBy?: { id: string; at: string; was?: Answer }
  state: State
  parkedReason?: string
  /** When it was parked; unparking removes it. */
  parkedAt?: string
  answer?: Answer
  thread: ThreadEntry[]
  revisions: Revision[]
  createdAt: string
  updatedAt: string
  sentAt?: string
}

/** The part of `$` the store uses, so tests can hand it a fake. */
export type StoreCtx = {
  env: { get: (name: 'HOME') => Promise<string | undefined> }
  session: { cwd: () => Promise<string> }
  process: { run: (argv: string[]) => Promise<{ exitCode: number; stdout: string }> }
  fs: {
    read: (path: string) => Promise<any>
    write: (path: string, text: string) => Promise<void>
    exists: (path: string) => Promise<boolean>
    list: (path: string) => Promise<{ name: string }[]>
  }
}

export type NewDecision = Omit<
  Decision,
  'id' | 'number' | 'version' | 'createdAt' | 'updatedAt' | 'state' | 'thread' | 'revisions' | 'section'
>

/** A folder name for a repository, from its git common directory (absolute). */
export async function repoKey(commonDir: string): Promise<string> {
  const trimmed = commonDir.replace(/\/+$/, '')
  const parent = trimmed.endsWith('/.git') ? trimmed.slice(0, -5) : trimmed
  const name = (parent.split('/').pop() ?? 'repo').replace(/[^A-Za-z0-9_-]/g, '-')
  const bytes = new TextEncoder().encode(trimmed)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  const hex = Array.from(digest.slice(0, 4), b => b.toString(16).padStart(2, '0')).join('')

  return `${name}-${hex}`
}

const knownDirs = new Map<string, string>()

/**
 * The folder this repository's decisions live in, shared by all its worktrees. The answer for a
 * working folder is remembered once git has given it: the pane reads on every redraw, and a
 * redraw that a newer one replaces aborts the git call, which showed in the conversation as a
 * "ui.render hook skipped" line.
 */
export async function storeDir($: StoreCtx): Promise<string> {
  const home = (await $.env.get('HOME')) ?? ''
  const cwd = await $.session.cwd()
  const remembered = knownDirs.get(`${home}|${cwd}`)
  if (remembered !== undefined) {
    return remembered
  }
  const run = await $.process.run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'])
  const isKnown = run.exitCode === 0 && run.stdout.trim() !== ''
  const dir = `${home}/.claude/decisions/${await repoKey(isKnown ? run.stdout.trim() : cwd)}`
  if (isKnown) {
    knownDirs.set(`${home}|${cwd}`, dir)
  }

  return dir
}

function fileOf(dir: string, id: string): string {
  return `${dir}/${id}.json`
}

async function names($: StoreCtx, dir: string): Promise<string[]> {
  try {
    return (await $.fs.list(dir)).map(entry => entry.name)
  } catch {
    return []
  }
}

export async function readAll($: StoreCtx): Promise<{ decisions: Decision[]; unreadable: number }> {
  const dir = await storeDir($)
  const decisions: Decision[] = []
  let unreadable = 0

  for (const name of await names($, dir)) {
    if (!/^d\d+\.json$/.test(name)) {
      continue
    }
    try {
      decisions.push(JSON.parse(await $.fs.read(`${dir}/${name}`)) as Decision)
    } catch {
      unreadable += 1
    }
  }

  return { decisions: decisions.sort((a, b) => a.number - b.number), unreadable }
}

export async function readOne($: StoreCtx, id: string): Promise<Decision | undefined> {
  try {
    return JSON.parse(await $.fs.read(fileOf(await storeDir($), id))) as Decision
  } catch {
    return undefined
  }
}

/** Replaces a decision's file, stamping `updatedAt`. */
export async function write($: StoreCtx, decision: Decision): Promise<void> {
  const stamped = { ...decision, updatedAt: new Date().toISOString() }
  await $.fs.write(fileOf(await storeDir($), decision.id), JSON.stringify(stamped, null, 2))
}

let queue: Promise<unknown> = Promise.resolve()

/** Allocates the next id and writes the decision; adds in one session run one at a time. */
export function create($: StoreCtx, input: NewDecision, section: Section = 'needs-you'): Promise<Decision> {
  const run = queue.then(() => allocate($, input, section))
  queue = run.catch(() => undefined)

  return run
}

async function allocate($: StoreCtx, input: NewDecision, section: Section): Promise<Decision> {
  const dir = await storeDir($)
  const taken = (await names($, dir)).map(name => /^d(\d+)\.json$/.exec(name)?.[1]).filter(Boolean).map(Number)
  let number = Math.max(0, ...taken) + 1

  for (let attempt = 0; attempt < 5; attempt++, number++) {
    const id = `d${number}`
    if (await $.fs.exists(fileOf(dir, id))) {
      continue
    }
    const now = new Date().toISOString()
    const decision: Decision = {
      ...input,
      version: 1,
      id,
      number,
      section,
      state: 'open',
      thread: [],
      revisions: [],
      createdAt: now,
      updatedAt: now,
    }
    await $.fs.write(fileOf(dir, id), JSON.stringify(decision, null, 2))

    return decision
  }

  throw new Error('could not allocate a decision id after five tries')
}
