import { create, readAll, readOne, write } from './store'
import type { Decision, StoreCtx } from './store'

export const ADD_TOOL = 'mcp__decisions__decisions_add'
export const LIST_TOOL = 'mcp__decisions__decisions_list'
export const UPDATE_TOOL = 'mcp__decisions__decisions_update'

export const ADD_DESCRIPTION = `Adds one decision to the decisions pane, where the person answers it. Use it for every question, decision, assumption or go-ahead you would otherwise put to the person in chat. Do not write the question in chat as well: write one line in chat saying what you added (for example "Added 2 decisions to the pane for Sharing links, 1 blocks the plan") and carry on with anything that does not depend on the answer. Never list the decisions in chat.

WHEN TO USE IT
Whenever you are about to ask the person something. If you catch yourself writing "should I", "do you want", "which would you prefer" or a numbered list of questions, call this tool instead. One call per decision.

Before calling it, call decisions_list at the start of a conversation and after /clear or compaction, and check what is already open, answered or parked. Never add a decision that is already there, and never ask again what has been answered or parked. If an earlier answer settles the point, act on it.

Do not use it for things you can find out by reading the code, status updates, or cheap choices that are plainly yours. Say those in a sentence of chat.

THE FIELDS
group (optional but always give one): the piece of work, such as "Sharing links", "Search review" or "Config file plan". Reuse the exact same text for the same piece of work.
kind (required): "choice", a pick between numbered options. It is the only kind for now.
title (required): a short plain sentence that makes sense to someone who has not read the conversation, such as "Where the config file lives". No ticket shorthand, no abbreviations you invented, no function or class names as the headline.
scenario (required): a concrete example of what happens today, for someone who was not in the conversation. Not "the lookup could be slow" but "you run the command from a subfolder and it takes eight seconds because it walks up to the root".
options (required, 1 to 12): each is { label, changes }. label is a few words. changes says what it would take and what changes for the person or the work if chosen. They are numbered by position, 1 first.
recommendation (required): { option, reason }. option is the NUMBER of the option you would pick (1 for the first), and reason is why, in a sentence. Always give one, even when it is close.
sources (optional): [{ label, path }] where path is a file path or a URL, so the person can check your claim.
dependsOn (optional): ids of decisions (such as "d2") that must be answered before this one makes sense.
blocks (optional): in words, what cannot go on until this is answered, such as "the plan".

WHAT COMES BACK
The tool answers with the decision's id and how many are open. Answers do not come back through this tool: they arrive later as a prompt that carries each decision's id, the chosen option, any condition and the outcome of any discussion. Treat a condition as part of the answer. Never assume an answer you have not been given.

REFUSALS
A decision is refused, with the reason in the result, when a field is missing or blank, the kind is not choice, there are no options or more than 12, the recommendation names an option that does not exist, or dependsOn names an unknown id. Fix the named field and call again. Do not get round a refusal by asking in chat.

EXAMPLE
group "Config file plan", kind "choice", title "Where the config file lives", scenario "You run the tool from packages/api and it needs its settings. Either it finds one file at the project root by walking up, or each package has its own copy that you must keep in step.", options [{ label "Project root", changes "one file, found by walking up, shared by every package" }, { label "Per package", changes "a file in each package, so settings can differ but are edited in several places" }], recommendation { option 1, reason "every other tool in this repository already reads from the root" }.

Keep every field in plain words: the person reads it in a narrow pane.`

export const LIST_DESCRIPTION =
  'Lists the decisions in the decisions pane that are still open, answered but not yet sent, or parked. Call it at the start of a conversation and after /clear or compaction, and before adding a decision, so you never ask again what is already there. Answered and sent decisions are left out.'

export const ADD_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    group: { type: 'string', description: 'The piece of work this belongs to. Reuse the exact text for the same work.' },
    kind: { type: 'string', enum: ['choice'] },
    title: { type: 'string', description: 'Plain title, readable without the conversation.' },
    scenario: { type: 'string', description: 'A concrete example of what happens, for someone who was not in the conversation.' },
    options: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          changes: { type: 'string', description: 'What it would take and what changes if chosen.' },
        },
        required: ['label'],
      },
    },
    recommendation: {
      type: 'object',
      properties: {
        option: { type: 'number', description: 'The number of the recommended option, 1 for the first.' },
        reason: { type: 'string' },
      },
      required: ['option', 'reason'],
    },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        properties: { label: { type: 'string' }, path: { type: 'string' } },
        required: ['label', 'path'],
      },
    },
    dependsOn: { type: 'array', items: { type: 'string' }, description: 'Ids of decisions to answer first.' },
    blocks: { type: 'string', description: 'What cannot go on until this is answered, in words.' },
  },
  required: ['kind', 'title', 'scenario', 'options', 'recommendation'],
}

export const UPDATE_DESCRIPTION = `Revises a decision that is already in the decisions pane: adds an option, or moves the recommendation. The earlier version is kept, and the thread shows a line for the change.

WHEN TO USE IT
The person sometimes asks about a decision from the pane. Their message then starts "On decision <n> · <title>:", where <n> is the decision's number (decision 3 is d3). Answer the question in chat, as you would any question. That message is a question, not the answer: never treat it as the person choosing an option. Call this tool only when your answer means the decision itself should change, for example the question showed a third option nobody had listed, or a different option is now the better pick.

THE FIELDS
id (required): the decision, such as "d3".
summary (required): one plain line for the thread, such as "Added option 3, Per workspace" or "Recommendation moved to 2".
addOptions (optional): [{ label, changes }] appended after the existing options, so they take the next numbers. A decision has 12 options at most.
recommendation (optional): { option, reason }. option is the option's NUMBER, counting any you add in this call.
Give addOptions, recommendation or both.

REFUSALS
Refused, with the reason in the result, when the id is unknown, the decision is already sent, the summary is blank, nothing is given to change, an added option has no label or there would be more than 12, or the recommendation names an option that does not exist. Fix the named field and call again.`

export const UPDATE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'The decision, such as "d3".' },
    summary: { type: 'string', description: 'One plain line for the thread, such as "Added option 3, Per workspace".' },
    addOptions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { label: { type: 'string' }, changes: { type: 'string' } },
        required: ['label'],
      },
    },
    recommendation: {
      type: 'object',
      properties: { option: { type: 'number' }, reason: { type: 'string' } },
      required: ['option', 'reason'],
    },
  },
  required: ['id', 'summary'],
}

const LIST_INPUT_SCHEMA = { type: 'object', properties: {} }

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === ''
}

/** The refusal text for a malformed add, or undefined when it's fine. */
export function validateAdd(input: Record<string, any>, existingIds: string[]): string | undefined {
  for (const field of ['title', 'scenario', 'kind']) {
    if (isBlank(input[field])) {
      const how = field === 'scenario' ? 'a concrete example of what happens' : 'it in plain words'
      return `decisions_add refused: ${field} is required. Write ${how} and call again.`
    }
  }
  if (input.kind !== 'choice') {
    return 'decisions_add refused: kind must be choice; the other kinds arrive later.'
  }
  const options = input.options
  if (!Array.isArray(options) || options.length < 1 || options.length > 12) {
    return 'decisions_add refused: options needs 1 to 12. Split a bigger choice into two decisions.'
  }
  for (const [index, option] of options.entries()) {
    if (isBlank(option?.label)) {
      return `decisions_add refused: option ${index + 1} has no label.`
    }
  }
  const recommendation = input.recommendation
  const number = recommendation?.option
  if (!Number.isInteger(number) || number < 1 || number > options.length) {
    return 'decisions_add refused: recommendation.option must be the number of one of the options.'
  }
  if (isBlank(recommendation.reason)) {
    return 'decisions_add refused: recommendation.reason is required. Say why in a sentence and call again.'
  }
  for (const id of input.dependsOn ?? []) {
    if (!existingIds.includes(id)) {
      return `decisions_add refused: dependsOn ${id}: no such decision.`
    }
  }

  return undefined
}

/** The refusal text for a malformed update, or undefined when it's fine. */
export function validateUpdate(input: Record<string, any>, d: Decision | undefined): string | undefined {
  if (!d) {
    return `decisions_update refused: ${String(input.id)}: no such decision.`
  }
  if (['sent', 'superseded', 'withdrawn'].includes(d.state)) {
    return `decisions_update refused: ${d.id} is already ${d.state}; add a new decision instead.`
  }
  if (isBlank(input.summary)) {
    return 'decisions_update refused: summary is required. Say what changed in one line.'
  }
  const added: any[] = input.addOptions ?? []
  if (added.length === 0 && input.recommendation === undefined) {
    return 'decisions_update refused: nothing to change. Give addOptions or recommendation.'
  }
  for (const [index, option] of added.entries()) {
    if (isBlank(option?.label)) {
      return `decisions_update refused: option ${d.options.length + index + 1} has no label.`
    }
  }
  const total = d.options.length + added.length
  if (total > 12) {
    return 'decisions_update refused: a decision has at most 12 options.'
  }
  if (input.recommendation !== undefined) {
    const number = input.recommendation?.option
    if (!Number.isInteger(number) || number < 1 || number > total) {
      return 'decisions_update refused: recommendation.option must be the number of one of the options.'
    }
    if (isBlank(input.recommendation.reason)) {
      return 'decisions_update refused: recommendation.reason is required. Say why in a sentence and call again.'
    }
  }

  return undefined
}

/** Applies an update: keeps the version it replaces, adds a ↻ line to the thread, writes the file. */
export async function updateDecision($: StoreCtx, input: Record<string, any>): Promise<{ result: string } | { deny: string }> {
  const d = typeof input.id === 'string' ? await readOne($, input.id) : undefined
  const reason = validateUpdate(input, d)
  if (reason !== undefined || !d) {
    return { deny: reason ?? 'decisions_update refused: no such decision.' }
  }
  const { revisions: _r, thread: _t, ...before } = d
  const at = new Date().toISOString()
  const summary = String(input.summary).trim()
  const added = ((input.addOptions ?? []) as any[]).map((o, index) => ({
    id: d.options.length + index + 1,
    label: String(o.label).trim(),
    ...(isBlank(o.changes) ? {} : { changes: String(o.changes).trim() }),
    fromDiscussion: true,
  }))
  await write($, {
    ...d,
    options: [...d.options, ...added],
    recommendation: input.recommendation
      ? { option: input.recommendation.option, reason: String(input.recommendation.reason).trim() }
      : d.recommendation,
    revisions: [...d.revisions, { at, summary, before }],
    thread: [...d.thread, { who: 'claude', text: `↻ ${summary}`, at, revision: d.revisions.length }],
  })

  return { result: `Updated ${d.id}: ${summary}. The earlier version is kept in the thread.` }
}

const WAITING = ['open', 'live']

export async function addDecision($: StoreCtx, input: Record<string, any>): Promise<{ result: string } | { deny: string }> {
  const { decisions } = await readAll($)
  const reason = validateAdd(input, decisions.map(d => d.id))
  if (reason !== undefined) {
    return { deny: reason }
  }
  const made = await create($, {
    group: isBlank(input.group) ? undefined : String(input.group).trim(),
    kind: 'choice',
    title: input.title.trim(),
    scenario: input.scenario.trim(),
    options: input.options.map((o: any, index: number) => ({
      id: index + 1,
      label: o.label.trim(),
      ...(isBlank(o.changes) ? {} : { changes: o.changes.trim() }),
    })),
    recommendation: { option: input.recommendation.option, reason: input.recommendation.reason.trim() },
    sources: input.sources ?? [],
    dependsOn: input.dependsOn ?? [],
    ...(isBlank(input.blocks) ? {} : { blocks: input.blocks.trim() }),
  })
  const open = decisions.filter(d => WAITING.includes(d.state)).length + 1

  return { result: `Added ${made.id} to the pane. ${open} open.` }
}

function line(d: Decision): string {
  const group = `[${d.group ?? 'Other'}]`
  const chosen = d.options.find(o => o.id === d.answer?.option)

  if (d.state === 'ready') {
    return `${d.id} ${group} ready, answered ${chosen ? `${chosen.id} ${chosen.label}` : 'with text'}, not sent yet: ${d.title}.`
  }
  if (d.state === 'parked') {
    return `${d.id} ${group} parked (${d.parkedReason ?? 'no reason given'}): ${d.title}.`
  }
  const options = d.options.map(o => `${o.id} ${o.label}`).join(', ')
  const recommended = d.recommendation ? ` Recommended: ${d.recommendation.option}.` : ''

  return `${d.id} ${group} ${d.state}: ${d.title}. Options: ${options}.${recommended}`
}

export async function listDecisions($: StoreCtx): Promise<{ result: string }> {
  const { decisions } = await readAll($)
  const waiting = decisions.filter(d => WAITING.includes(d.state))
  const ready = decisions.filter(d => d.state === 'ready')
  const parked = decisions.filter(d => d.state === 'parked')

  if (waiting.length + ready.length + parked.length === 0) {
    return { result: 'No open decisions in the pane.' }
  }
  const parts = [
    waiting.length > 0 ? `${waiting.length} waiting for the person` : '',
    ready.length > 0 ? `${ready.length} answered but not sent` : '',
    parked.length > 0 ? `${parked.length} parked` : '',
  ].filter(Boolean)

  return { result: [`Decisions in the pane: ${parts.join(', ')}.`, ...[...waiting, ...ready, ...parked].map(line)].join('\n') }
}

export async function registerTools($: { tool: { register: (spec: any) => Promise<unknown> } }): Promise<void> {
  await $.tool.register({
    name: 'decisions_add',
    description: ADD_DESCRIPTION,
    inputSchema: ADD_INPUT_SCHEMA,
    isDeferred: false,
  })
  await $.tool.register({
    name: 'decisions_list',
    description: LIST_DESCRIPTION,
    inputSchema: LIST_INPUT_SCHEMA,
    isDeferred: false,
  })
  await $.tool.register({
    name: 'decisions_update',
    description: UPDATE_DESCRIPTION,
    inputSchema: UPDATE_INPUT_SCHEMA,
    isDeferred: false,
  })
}
