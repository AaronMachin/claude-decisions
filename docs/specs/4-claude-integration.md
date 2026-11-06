# Workstream 4: Claude integration

This document specifies the fourth workstream of the decisions pane: making Claude put its questions in the pane instead of the chat. That means the rules in the tool's description, `AskUserQuestion` answered into the pane, a nudge when a turn still ends with questions in chat, refusing subagents, the system prompt hooks where the machine allows them, and an eval suite that scores all of it.

Status: draft for approval. Anything marked **(Claude's call)** is also a numbered row in `docs/decisions.md` (117 onwards) and can be overturned.

## What gets built, and what doesn't

| In | Not in |
| --- | --- |
| `hooks/integrate.ts`: the `AskUserQuestion` answer, the subagent refusal, the nudge and its detector, the compose and context hooks, the session note | The pane, the store, the other tools' behaviour (workstreams 1 to 3, unchanged except for the lines in "Changes to earlier workstreams' files") |
| The final wording of `decisions_add`'s description, inside 4,096 characters | Replaying real question-heavy sessions and the first-time-user runs (workstream 5) |
| One line added to the answer prompt in `hooks/send.ts` | A pass bar for the evals: this workstream reports the score per case and the controlling session takes the bar to Aaron |
| `evals/`: a setup script that makes a small Pantry git project, five cases, graders | Getting round the managed security plugin on a machine that has one: where it skips a hook, the description carries the rules alone |

## How Claude gets the rules, layer by layer

Each layer says the same thing; the first is the only one seen to reach Claude on a machine with a managed security plugin.

| Layer | Where | Reaches Claude when |
| --- | --- | --- |
| The tool description | `ADD_DESCRIPTION` in `hooks/tool.ts`, first 4,096 characters | always (spike 5) |
| A system prompt section | `prompt.compose`, id `decisions:rules`, `scope: 'session'` | the machine doesn't skip the hook |
| The open list | `prompt.context`, block `decisions` | same |
| A short note in the conversation | `$.session.append` at session start and on the first prompt after `/clear` (spike 0, S2) | seen to reach Claude on this machine |
| `AskUserQuestion` into the pane | `tool.call` hook | always (the security plugin did not skip `tool.call` in the spikes) |
| The nudge | `turn.complete` hook plus `$.session.append` | always (same) |

### The description

The rules and the format stay in the first 4,096 characters. It now has 4,048 and needs to take four additions, so I cut the repeated parts (the second sentence of the refusals paragraph, the example's second option, a few "for example" asides) to make room. Additions:

- Never use `AskUserQuestion`: call this tool instead (if Claude calls it anyway, the mod answers it into the pane, see below). This matters because `AskUserQuestion` has no recommendation field, so the person would get decisions without one.
- A finding's title starts with the area it is about, such as "Image uploads: one user can use another's quota" (D16).
- Only the main session adds decisions. A subagent's call is refused: it reports to the main session, which adds them.
- Call `decisions_list` at the start of a conversation and after `/compact` or `/clear` (already there; reworded shorter).

A test checks the length is at most 4,096 and that each rule's key phrase is in it. `decisions_update`'s description gets one sentence saying the same subagent rule applies, and stays well under its own limit.

### The system prompt section and the open list

The section is a constant string: the short form of the same rules (pane not chat, one line in chat, scenario and recommendation on every decision, plain titles, area-first finding titles, carry on with what doesn't depend on an answer, `decisions_list` after `/clear` or `/compact`, main session only). It is built once, so every call returns identical text and the prompt cache survives. A test calls the hook twice and compares.

`prompt.context` adds one block, `decisions`, with the open list in the same words `decisions_list` uses. The engine keeps the answer until compaction or `/clear` re-reads it, so there is nothing to refresh each turn. This is also where the line "the open list is up to date as of the start of the conversation, call `decisions_list` for the current one" belongs, because the block can go stale mid-conversation.

Neither hook tries to avoid the managed security plugin, and neither changes anything if the plugin skips it.

### The session note

Spike 0 found `$.session.append` reaches Claude as a message from the person. The mod appends one line: "The decisions mod is on: put questions in the decisions pane with decisions_add, and call decisions_list first." It does this:

- in `session.start` (re-fired by a reload, so it first reads `$.session.messages()` and skips if a user message already holds the line)
- on the first prompt after `/clear`: a `prompt.submit` hook, when `$.session.turns()` is 1 or less and no message holds the line. `session.start` doesn't fire on `/clear` and the classic SessionStart hook is skipped on this machine.

After `/compact` nothing is appended: no event was tried there, so Claude is told by the tool description alone. Open Questions has it.

## AskUserQuestion goes to the pane

Scenario: Claude, midway through a plan, calls `AskUserQuestion` with "Where should the shared recipe links live?" and three options. The hook adds one decision to the pane, answers `{ result: { questions, answers: {} }, context: ["Added to the decisions pane as 4. The person will answer there; carry on with other work. Answers arrive as a prompt."] }` and Claude carries on. It never calls `next`, so the real question dialog never opens. The person answers from the pane as for any other decision, and the answer arrives as the usual prompt.

How each question maps (D12):

| `AskUserQuestion` has | Decision gets |
| --- | --- |
| `question` | `title` |
| `header` | `group` (the tab) **(Claude's call)**: see below |
| `description` (when present) plus the question's `header` | `scenario`; when neither says anything beyond the question, the scenario is "Claude asked this in chat and had no more to say." |
| options, one choice, 2 to 4 | kind `choice`, each `label` and `description` becoming an option's `label` and `changes` |
| `kind: "text"` or `"number"`, or no options | kind `question` |
| `multiSelect: true` | kind `question`, with the options listed in the scenario ("Pick any of: A, B, C") **(Claude's call)**: a choice takes one answer |
| nothing for a recommendation | none: a choice without one is allowed by the store and the pane already copes |
| the section | `needs-you` |

Group: the header is "max 12 characters" and differs on every call ("Auth method", "Library"), so using it would give each question its own tab. All `AskUserQuestion` decisions go to the group `Questions from Claude` **(Claude's call)**, and the header goes at the start of the scenario instead.

The `context` text names the decision numbers as a range: "Added to the decisions pane as 4-6." for three questions, "as 4." for one. A call carrying an `agentId` (a subagent) is refused, see below, because the questions would otherwise arrive in the main pane with no owner.

A write failure answers with `{ deny: "The decisions pane could not be written. Ask in chat this once." }`, the one case where asking in chat is the right thing.

## Subagents are refused

D13: a `decisions_add` or `decisions_update` call that carries `agentId` is refused before anything is written, with: "Only the main session adds decisions. Report this to the main session in your final message and it will add it to the pane." The same refusal answers an `AskUserQuestion` from a subagent. **(Claude's call, for decisions_update and AskUserQuestion)**: the prompt names only `decisions_add`; a subagent editing the pane has the same problem. `decisions_list` stays open to everyone (reading is harmless, and a subagent can use it to avoid repeating a decision).

The check goes at the top of the existing `tool.call` hooks in `register.tsx` through a function in `integrate.ts`, so it runs before `addDecision`.

## The nudge

When a turn ends with questions to the person in chat, the mod appends a reminder for Claude to read next: "Reminder from the decisions mod: your last turn ended with questions in chat. Put them in the decisions pane instead, and say in one line what you added." **(Claude's call)**: two sentences, naming the pane and the one-line rule, no list of the questions.

`turn.complete` fires for the main session only (`agentId` undefined and reason `answer`). The hook reads the turn's assistant text through `$.session.messages()`: every assistant message since the last user message that isn't a tool result, joined; if it finds none it uses `e.answer`. It skips the check when that last user message is a reply to a discussion question (it holds "On decision " followed by a number), because a reply in a thread may properly end with "does that change your answer?" **(Claude's call)**.

`isQuestionsInChat` is copied from the Task 6 spike with its tests and extended in two ways. Rules, applied to the turn's text:

| Rule | Example | Fires |
| --- | --- | --- |
| Two or more list lines each ending in `?` | "1. Use Redis?  2. Keep the cache?" | yes |
| The last sentence ends in `?`, unless it is an offer to carry on (below) | "Should I push this?" | yes |
| Any sentence that starts "should I", "do you want", "would you prefer" or "which would you prefer" and ends in `?`, even mid-text | "Which would you prefer? I'll wait." | yes **(Claude's call)**: the spike said a mid-text question was missed |
| A question answered in the same text | "Why did this fail? Because the key was wrong." | no |
| A last sentence that is an offer to continue: starts "want me to", "shall I" or "should I", then carry on, continue, proceed, keep going, go ahead or move on, with no more than three words after | "Want me to carry on?" | no **(Claude's call)** |
| A statement | "I pushed it. The tests pass." | no |

The offer exemption is the line between a decision and a courtesy: "Want me to carry on?" needs no pane entry, "Want me to drop the migration?" does. It is deliberately narrow, so a miss on some other offer ("Want me to also add tests?") still nudges. That is a false alarm of the cheap kind, and the nudge is a reminder, not a block.

The nudge goes in one `$.session.append` per turn, once, never twice in a row for the same turn. Tests: a numbered question list fires; "Should I push this?" fires; a mid-text "which would you prefer" fires; a statement doesn't; "Want me to carry on?" doesn't; "Want me to drop the migration?" does; a question answered in the same text doesn't; a discussion reply turn doesn't; a subagent's turn doesn't; one append per turn.

## The answer prompt

`buildAnswerPrompt` in `hooks/send.ts` gains one sentence in its intro (log 2026-11-07 00:10): "Act on the answers. Don't write decision records or other files about them unless the person asks." Without it a user-level decision-records skill wrote a record file after the answers arrived. The test in `send.test.ts` that pins the intro is updated.

## The evals

`evals/` holds a setup script and five cases. Run from the repository root with `claude plugin eval . --model sonnet --runs 1 --ablation none --no-publish --trust-plugin --scaffold --allow-tools 'mcp__decisions__*'`.

The setup script, `evals/pantry-setup.sh`, runs in the empty workspace the eval starts each run in and makes a git repository with about five commits: a small Pantry recipe app (`app.py` with a list of recipes, a `README.md`, then commits adding search, a favourites flag, a TODO that mentions sharing links, a one-line bug). It writes files and git state only, never touches anything outside the workspace and calls no network. Aaron approved it running as them for these evals only.

Each case directory has a `case.yaml` pointing `scaffold_script` at a two-line `fixture.sh` that runs the shared script (the docs require the script to be in the case directory; if a path outside it works the two-line files go). Cases (**Claude's call**, the prompt left the choice):

| Case | Prompt | What it tempts |
| --- | --- | --- |
| `plan-sharing` | "plan adding share-by-link for recipes to this project" | design questions in chat |
| `review-last-commit` | "review the last commit" | a numbered list of findings and questions |
| `what-next` | "what should we do next?" | a "which of these?" question |
| `ask-me-first` | "I want to add a shopping list. Ask me what you need to know before you start." | `AskUserQuestion` |
| `find-problems` | "look through the code for problems and tell me what to do about them" | many findings, with a "shall I fix these?" at the end |

Graders on each case (the three in the Task 8 spike): `decision-added` (`tool_used` on `mcp__decisions__decisions_add`, at least 1), `no-final-question` (the final message doesn't end in `?`) and `no-question-list` (fewer than two list lines ending in `?`). Regex graders only approximate `isQuestionsInChat`, because the eval has no custom-code graders; the real function is unit tested. `ask-me-first` drops `decision-added` for a `tool_used` count on either tool, which a single grader can't express, so it keeps `decision-added` and I read `AskUserQuestion` use off the JSON and say so in the log. **(Claude's call)**

Cost and scoring: five cases at one run each, `--ablation none`, at most three suite runs, all Sonnet, about $0.25 a run by the Task 8 figure ($0.13 for three). The log carries the score per case and the cost. I don't propose a pass bar.

## Changes to earlier workstreams' files

| File | Change |
| --- | --- |
| `hooks/tool.ts` | The description text (the prompt gives me this) and a sentence in `UPDATE_DESCRIPTION` |
| `hooks/send.ts`, `hooks/send.test.ts` | The line in the answer prompt |
| `hooks/register.tsx` | Wiring: the subagent check at the top of the add and update hooks, and new hooks for `AskUserQuestion`, `turn.complete`, `prompt.compose`, `prompt.context`, `prompt.submit` and the note in `session.start` |

## Open questions

1. After `/compact` nothing reminds Claude to call `decisions_list` except the description. Is that enough? A `session.compact` hook might do it; none was tried.
2. The nudge's offer exemption and the mid-text rule are my guesses from one observed hit. Workstream 5's replay of real sessions is what tells us whether they are right.
3. `AskUserQuestion` decisions carry no recommendation. Should the hook ask Claude for one by returning a context line, or leave them as plain choices? I left them plain.
4. Whether a group named `Questions from Claude` is wanted, or the header per tab, is Aaron's taste.
