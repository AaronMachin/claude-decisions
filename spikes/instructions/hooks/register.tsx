import type { Register } from 'claude-code'

const TOOL = 'mcp__instructions-spike__decisions_add'

const RULES = `Decisions pane (the decisions mod is on)

- Anything you would ask the person, every decision, question, assumption and go-ahead, goes in the pane through the ${TOOL} tool. Never as a list or numbered questions in chat.
- After adding, write one line in chat saying what you added ("Added 3 decisions to the pane for Sharing links, 1 blocks the plan"). Never repeat the list.
- Every decision needs a plain title, a concrete scenario (what happens in each case, not an abstract property) and a recommendation with its reason. No shorthand only you understand.
- Check the "decisions" context block (the open list) before asking anything. Never re-ask something already open, answered or parked.
- Keep working on anything that does not depend on an open decision. If nothing can go on, end your turn.
- When answers arrive, act on them. A condition in an answer is part of the answer.
- For a large review, add only the findings that need the person. Say which others are your call or already decided.
- Only the main session adds decisions. Subagents report back to you.`

const DESCRIPTION = `Adds one decision to the decisions pane, where the person answers it. Use this tool for every question, decision, assumption or go-ahead you would otherwise put to the person in chat. Do not write the question in chat as well: write one line saying what you added (for example "Added 2 decisions to the pane for Sharing links, 1 blocks the plan") and carry on with anything that does not depend on the answer.

WHEN TO USE IT
Use it whenever you are about to ask the person something: which approach to take, whether to proceed, what a vague requirement means, which of several findings to fix, whether an assumption you are making is right. If you catch yourself writing "should I", "do you want", "which would you prefer" or a numbered list of questions, stop and call this tool instead. Call it once per decision. Several decisions about the same piece of work share the same group.

Before calling it, check the "decisions" block in your context (the list of open, parked and recently answered decisions). Do not add a decision that is already there. If an earlier answer settles the point, act on it.

Do not use it for things you can find out yourself by reading the code, for status updates, or for choices that are plainly yours to make and cheap to reverse. Say those in a sentence of chat.

THE FIELDS
group (required): the piece of work the decision belongs to, such as a feature ("Sharing links"), a review ("Search review") or a plan ("Config file plan"). Decisions are grouped and filtered by it, so reuse the exact same text for the same piece of work.

kind (required): one of
- decision: a choice between options that changes what gets built or done.
- question: you need a fact only the person has, and there are no sensible options to offer. Give the likely answers as options anyway where you can.
- assumption: something you will proceed on unless told otherwise. The person confirms or corrects it.
- go-ahead: you are ready to do something with side effects (a push, a migration, deleting something) and need an explicit yes.
- finding: something a review turned up that needs the person to triage it. Add only the findings that need them. Findings that are your call, or already decided, are said in your chat line, not added.

title (required): a short plain sentence-style title that makes sense to someone who has not read the conversation, such as "Where the config file lives" or "What happens when a shared recipe link expires". No ticket-style shorthand, no abbreviations you invented, no function or class names as the headline.

scenario (required): a concrete example of what happens, written for someone who was not in the conversation. Not "the lookup could be slow" but "you run the command from a subfolder and it takes eight seconds because it walks up to the root each time". If the decision is about behaviour, walk through what the person or the user would see in each case. This is the most important field: a decision without a scenario is refused.

options (required, at least one): the choices. Each has
- id: a short label, "a", "b", "c".
- label: what the option is, in a few words.
- changes: what it would take and what changes for the person or the work if chosen.
- fromDiscussion (optional, true or false): true when the option came out of a discussion with the person rather than from you.
Give every real option you considered. For a question with no sensible options, give the likely answers.

recommendation (required): { option, reason }. The id of the option you would pick and why, in a sentence. Always give one, even when it is close. If you truly have no view, say so in the reason and pick the least risky.

sources (optional): where the evidence is. Each is { label, path } where path is a file path or a URL. Use it so the person can check your claim in one click.

dependsOn (optional): ids of decisions that have to be answered before this one makes sense.

blocks (optional): ids of decisions that cannot be answered, or of work that cannot go on, until this one is. Say so in the chat line when something is blocked.

WHAT COMES BACK
The tool answers with the decision's id and the number of decisions now open. Answers do not come back through this tool: they arrive later as a prompt that carries the decision id, the chosen option, any condition the person attached, and the outcome of any discussion. Treat a condition as part of the answer. Never assume an answer you have not been given, and never mark a decision answered yourself.

REFUSALS
A decision is refused, with the reason in the result, when a required field is missing or empty, when the kind is not one of the five above, when options is empty, or when the recommendation names an option that does not exist. Fix the named field and call it again. Do not work around a refusal by asking in chat.

TWO EXAMPLES
A decision: group "Config file plan", kind "decision", title "Where the config file lives", scenario "You run the tool from packages/api and it needs its settings. Either it finds one file at the project root by walking up, or each package has its own copy that you must keep in step.", options a ("Project root", changes "one file, found by walking up, shared by every package") and b ("Per package", changes "a file in each package, so settings can differ but have to be edited in several places"), recommendation a, reason "every other tool in this repository already reads from the root".

An assumption: group "Sharing links", kind "assumption", title "Shared recipe links expire after 7 days", scenario "Someone shares a recipe link on Monday and a friend opens it eight days later. I am assuming the friend sees an 'expired' page rather than the recipe.", options a ("Yes, show expired", changes "nothing, this is how it works now") and b ("Keep links working", changes "the expiry setting and the tests that expect the expired page"), recommendation a, reason "the spec says links must not outlive their week".

Keep every field in plain words. The person reads this in a narrow pane beside the chat, so short sentences and short labels work best, and the scenario should still be understood without the title.`

type Decision = {
  id: string
  group: string
  kind: string
  title: string
  scenario: string
  options: { id: string; label: string; changes?: string; fromDiscussion?: boolean }[]
  recommendation: { option: string; reason: string }
  sources?: { label: string; path: string }[]
  dependsOn?: string[]
  blocks?: string[]
  state: 'open'
}

const KINDS = ['decision', 'question', 'assumption', 'go-ahead', 'finding']

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    group: { type: 'string', description: 'The piece of work: a ticket key, a PR, a plan.' },
    kind: { type: 'string', enum: KINDS },
    title: { type: 'string', description: 'Plain title, readable without the conversation.' },
    scenario: {
      type: 'string',
      description: 'A concrete example of what happens, for someone who was not in the conversation.',
    },
    options: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          changes: { type: 'string', description: 'What it would take and what changes.' },
          fromDiscussion: { type: 'boolean' },
        },
        required: ['id', 'label'],
      },
    },
    recommendation: {
      type: 'object',
      properties: { option: { type: 'string' }, reason: { type: 'string' } },
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
    dependsOn: { type: 'array', items: { type: 'string' } },
    blocks: { type: 'array', items: { type: 'string' } },
  },
  required: ['group', 'kind', 'title', 'scenario', 'options', 'recommendation'],
}

function refusal(e: Record<string, any>): string | undefined {
  for (const field of ['group', 'kind', 'title', 'scenario']) {
    if (typeof e[field] !== 'string' || e[field].trim() === '') {
      return `decisions_add refused: ${field} is required. Write ${field === 'scenario' ? 'a concrete example of what happens' : 'it in plain words'} and call again.`
    }
  }
  if (!KINDS.includes(e.kind)) {
    return `decisions_add refused: kind must be one of ${KINDS.join(', ')}.`
  }
  if (!Array.isArray(e.options) || e.options.length === 0) {
    return 'decisions_add refused: options needs at least one option.'
  }
  if (!e.recommendation || !e.options.some((o: any) => o.id === e.recommendation.option)) {
    return 'decisions_add refused: recommendation.option must be the id of one of the options.'
  }
  return undefined
}

export const register: Register = on => {
  const decisions: Decision[] = []

  function openList(): string {
    if (decisions.length === 0) {
      return 'No open decisions.'
    }
    return decisions
      .map(d => `- ${d.id} [${d.group}] (${d.kind}, ${d.state}) ${d.title}. Recommended: ${d.recommendation.option}.`)
      .join('\n')
  }

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)

    return {
      sections: [...composed.sections, { id: 'decisions-rules', text: RULES, scope: 'session' }],
    }
  })

  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'decisions_add',
      description: DESCRIPTION,
      inputSchema: INPUT_SCHEMA,
      isDeferred: false,
    })

    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const reason = refusal(e)
    if (reason !== undefined) {
      return { deny: reason }
    }

    const decision: Decision = {
      id: `d${decisions.length + 1}`,
      group: e.group,
      kind: e.kind,
      title: e.title,
      scenario: e.scenario,
      options: e.options,
      recommendation: e.recommendation,
      sources: e.sources,
      dependsOn: e.dependsOn,
      blocks: e.blocks,
      state: 'open',
    }
    decisions.push(decision)

    return { result: `Added ${decision.id} to the pane. ${decisions.length} open.` }
  })

  on('prompt.context', async ($, e, next) => {
    const context = await next(e)

    return {
      ...context,
      blocks: [
        ...context.blocks,
        { name: 'decisions', text: 'Open decisions in the pane:\n' + openList() },
      ],
    }
  })
}
