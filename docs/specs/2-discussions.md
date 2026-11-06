# Workstream 2: discussions

This document specifies the second workstream of the decisions pane: the person asks a question about one decision and the reply lands in that decision's thread, from the main session, the fork or the quick model. `d` marks the decision answered, earlier versions of a decision can be opened, and `/config` picks who replies.

Status: draft for approval. Anything marked **(Claude's call)** is also a numbered row in `docs/decisions.md` (70 onwards) and can be overturned.

## What gets built, and what doesn't

| In | Not in (and who builds it) |
| --- | --- |
| Asking a question in a decision's thread, and the three ways it gets answered (`hooks/discuss.ts`) | The side agent (out of v1, D14; see Open Questions 1) |
| The thread screen, the queued note, the resend-to-fork key, the draft that survives a hide (`hooks/pane/thread.tsx`) | The other kinds' keys, the folded sections, `r` (workstream 3) |
| `d` then `enter` marks a decision answered, and the answer sent with `s` carries the thread | Changing `decisions_add`'s description text (workstream 4) |
| `decisions_update`, so a reply can add an option or move the recommendation, recorded as a `↻` line with the earlier version kept | More fields on `decisions_update` (workstream 3 extends it) |
| Opening an earlier version from its `↻` line | |
| The `Discussion replies` setting in `/config` | The other two settings, `Send answers to Claude` and `Open the pane` |

## Changes to workstream 1's files

Workstream 1 left a hole for each of these (the `Discuss` Button says "No discussion yet", the types carry `thread` and `revisions`), but they are its files, so each is listed here and logged as a `question` for approval.

| File | Change |
| --- | --- |
| `.claude-plugin/plugin.json` | adds `userConfig.discussionReplies` |
| `hooks/store.ts` | `ThreadEntry` gains `revision?: number` |
| `types/index.d.ts` | `PaneView` gains the screen `thread` and the fields below |
| `hooks/pane/decision.tsx` | the `Discuss` Button opens the thread; `INITIAL_VIEW` carries the new fields; the atom's shape tag goes from `view-1` to `view-2`; `chooseOption`, `parkDecision` and `unparkDecision` read the file again before writing (see "A reply landing while the pane is open") |
| `hooks/pane/render.tsx` | `renderPane` draws the thread screen; `followFocus` follows the ring onto the `Mark answered` and `Ask` Buttons |
| `hooks/tool.ts` | registers `decisions_update` and validates and applies it |
| `hooks/register.tsx` | `register(on, options)` takes the setting; one `on(...)` line each for `turn.start`, `turn.complete` and the `decisions_update` call |

## Types

These are the shapes workstream 3 builds against, logged as a `contract` with this block.

```diff
  export type ThreadEntry = {
    who: 'person' | 'claude' | 'fork' | 'quick'
    text: string
    at: string
+   revision?: number       // set on a ↻ line: the index into Decision.revisions of the version it replaced
  }
```

`who` already says which mode replied: `claude` is the main session. A `↻` line is a `claude` entry whose text starts `↻ ` and whose `revision` is set. Because it is a thread entry, it sits in the thread's order and goes out with the answer (`Discussion:` in the answer prompt) without any change to `send.ts`.

```diff
+ export type PendingQuestion = {
+   asked: string            // the question's ThreadEntry.at, which finds the entry
+   decisionId: string
+   mode: 'main' | 'fork' | 'quick'
+   status: 'queued' | 'waiting' | 'answering' | 'failed'
+   reason?: string          // when failed
+   run: string              // names the load of the mod that holds the call; after a reload it differs
+ }
+
  export type PaneView = {
-   screen: 'list' | 'decision' | 'review'
+   screen: 'list' | 'decision' | 'review' | 'thread'
    ...
+   isAsking: boolean                   // thread screen: the Input is open and holds the keys
+   isMarking: boolean                  // thread screen: the ring is on Mark answered
+   drafts: Record<string, string>      // half-typed question by decision id; survives hiding the pane
+   pending: PendingQuestion[]          // questions sent and not yet answered, in this session
+   revisionIndex?: number              // the earlier version open on the thread screen
+   threadSkip: number                  // entries hidden at the newest end, for older/newer paging
  }
```

Pending questions are in `$.state`, not in the thread, so a thread never holds a "queued" entry that nothing will answer. The person's question is written to the thread file the moment it is sent, so it is kept even if the reply never comes.

## Asking a question

On the thread screen the ring starts on an `Ask a question` Button. `enter` opens an Input (the pane then holds the keys, so letters type), `enter` sends, and an empty `enter` cancels. After sending, the Input closes and the ring goes back to the `Ask` Button. The Input is closed by default because an open Input swallows hotkeys (workstream 1, decisions.md row 57): `d`, `f` and `b` would type letters.

What sending does, whichever mode:

1. Writes the question to the decision's thread as a `person` entry, and moves an `open` decision to `live`.
2. Adds a `PendingQuestion`, clears the draft, redraws.
3. Hands the question to the replier (below).
4. When the reply lands it is written to the thread directly under its question, the pending entry goes, `$.ui.invalidate('ui.render')` redraws the pane and the status line refreshes. A reply to any state of decision is kept, including a sent one; asking about a sent decision never changes its state. **(Claude's call)**

The draft is `PaneView.drafts[decisionId]`, written on every keystroke, so hiding the pane (which loses an Input's text) or leaving the thread keeps it. Opening the thread with a draft present opens the Input with the draft in it.

### The three repliers

`Discussion replies` is read when the module loads (`register(on, options)`). A change in `/config` reloads the module with the new value, so a question already in flight at that moment shows "no reply: the pane was reloaded" and `f` sends it again.

| Mode | How it is asked | Reply taken from | Sees | Can revise the decision |
| --- | --- | --- | --- | --- |
| main session (default) | `$.prompt.submit({ text })` where text is `On decision <n> · <title>: <question>` | the turn whose `turn.start` text includes `plugin sent "On decision` and the sent text | everything, with tools | yes, through `decisions_update` |
| fork | `$.model.fork({ prompt })`, awaited | the call's result | the conversation so far, no tools, no project files (spike 0, decisions.md S3) | no |
| quick model | `$.model.complete({ model: 'haiku', prompt })`, awaited | the call's result | the decision only | no |

**Main session.** `$.prompt.submit` from a mod waits for Claude's running turn to end (Phase 1 saw 20 to 29 seconds), so the call is started and not awaited. Whether a turn is running is tracked from the main loop's `turn.start` and `turn.complete` hooks (a plugin's own `prompt.submit` hook is skipped for what it sends, and the pane has no `isWorking`). The reply is found in three steps, each a plain function so a test can drive it:

- A `turn.start` on the main loop (no `agentId`) whose text includes `plugin sent "On decision` is the reply turn, and the pending entry becomes `answering`. A waiter is chosen by the sent text being contained in the turn's text; if none matches, by `On decision <n> ·`; if none matches, the oldest. Any other `turn.start` is ignored.
- That turn's `turn.complete` carries the reply in `answer`. A `turn.complete` of any other turn does nothing. This is the bug Phase 1 hit: "the next turn to end" was the earlier task's answer, twice.
- An empty `answer` (Claude only called a tool) is stored as `(no text, see the line above)` so the thread doesn't show an empty reply.

The question and the reply also show in the main chat, as designed. The chat row can't be relabelled by this plugin (Phase 1, "re-entry"), which is why the sent text carries the decision's number and title.

**Fork.** The prompt carries the decision (title, scenario, numbered options, recommendation) then the question, and says: answer in at most four sentences; you can't read project files here, so if the question needs code say that and stop. **(Claude's call)**

**Quick model.** Haiku, given only the decision and the question, with the same length rule and no mention of files. A reply that needs the conversation will say it doesn't have it. That is the Phase 1 behaviour and the design's. **(Claude's call on the wording)**

If `$.model.fork` or `$.model.complete` returns `isAnswered: false`, the pending entry becomes `failed` with the `reason`, and `f` tries the fork.

### Queued, and the key that resends it to the fork

A main-session question sent while a turn is running is `queued`, and the thread shows `queued, Claude is mid-step` under it. Sent while Claude is idle it is `waiting` (shown `sent, waiting for Claude`, which lasts a moment). When the reply turn starts it is `answering` (`Claude is answering`). It is cleared when the reply turn completes.

The key that resends one question to the fork is **`f`** (D15). It is not used by workstream 1 or 3's keys (a, b, c, d, h, p, r, s, t and the digits). **(Claude's call)** It is shown only while there is a `queued`, `failed` or reload-orphaned question. It takes the oldest one, removes its pending entry, and asks the fork the same question. `$.prompt.submit` can't be cancelled, so a queued main-session question still reaches Claude later, answers in the chat and lands in the thread too, under the same question. The thread then holds two replies and the pane shows a dim line: `Sent to the fork. The main-session copy is still queued and will land here too.` **(Claude's call)**

## Marking answered

`d` highlights the `Mark answered` Button (it calls `$.ui.focus`, as the digits do on the decision screen) and `enter` presses it: the decision becomes `ready` with `answer = { text: 'settled in the discussion, see below', answeredAt }` and the pane goes to the list. It is shown only for `open`, `live` and `parked` decisions. A decision that already has a chosen option (`ready`) is changed by choosing again on the decision screen, so `d` isn't offered. **(Claude's call)**

The answer's `option` is empty on purpose: what was settled, and any condition, is in the thread, and the answer prompt sends the whole thread (`Discussion:`). Nothing in `send.ts` changes. The prompt for it reads:

```
Decision d1 · Where the config file lives (Config file plan)
Chosen: settled in the discussion, see below
Condition: none
Discussion:
  person: Does it change if the repo has three packages?
  claude: A bit. With three packages the root file still works ...
  claude: ↻ Added option 3, Per workspace
  person: OK, go with 3 if CI can find the file.
  claude: It can, the build step already runs from the root.
```

`b` on the thread goes back to the decision, except when the ring is on `Mark answered`, where it moves the ring back to `Ask` (the same two-step as clearing a highlight on the decision screen).

## Revising a decision: `decisions_update`

Claude calls this when a reply means the options or the recommendation should change. The main session is the only replier that has tools, so only it revises.

```diff
+ id:             string             the decision, such as "d3" (the number in "On decision 3" is d3)
+ summary:        string             one plain line for the thread, such as "Added option 3, Per workspace"
+ addOptions?:    { label: string, changes?: string }[]   appended; each gets the next id and fromDiscussion: true
+ recommendation?: { option: number, reason: string }     option is an id, counting the ones just added
```

The tool refuses, as `{ deny: <reason> }`:

| Refused when | Reason starts |
| --- | --- |
| `id` isn't in the store | "decisions_update refused: d9: no such decision." |
| the decision is `sent`, `superseded` or `withdrawn` | "...d3 is already sent; add a new decision instead." |
| `summary` is blank | "...summary is required. Say what changed in one line." |
| neither `addOptions` nor `recommendation` is given | "...nothing to change. Give addOptions or recommendation." |
| an added option has no label, or the total would pass 12 | "...option 3 has no label." / "...a decision has at most 12 options." |
| `recommendation.option` isn't an id after the additions | "...recommendation.option must be the number of one of the options." |

On success it appends `{ at, summary, before }` to `revisions` (`before` is the decision as it was, without its `revisions` and `thread`, the shape workstream 1 already defined), appends the `↻` entry to the thread with `revision` set to that index, writes the file and redraws. The result is a string: `Updated d3: Added option 3, Per workspace. The earlier version is kept in the thread.` A `ready` decision keeps its answer (an option's id never changes). **(Claude's call)**

The tool's description is short (well under 4,096 characters). It says: a message starting `On decision <n> · <title>:` is a question about that decision from the person; answer it in chat and don't treat it as the answer; call this only if the answer means the options or recommendation should change; never use it to answer the decision. Workstream 4 keeps the description consistent with `decisions_add`'s.

## The thread screen

Reached by `enter` on the `Discuss` Button of the decision screen (D3), on a decision in any state. The header crumb is `<group> > d1 > discussion`. The body, top to bottom:

1. The title and the state line, then a rule.
2. The thread, oldest first. Each entry is a dim label line (`you · 10:41`, `Claude · 10:42`, `Fork · 10:42`, `Quick model · 10:42`; the time is `4 Nov 10:42` when it isn't today) and the text below, indented two columns and wrapped.
3. A `↻` line is one Button (key `rev:<i>`): `↻ Added option 3, Per workspace`, cut with `…` to the width. `enter` on it opens that earlier version.
4. A question that has no reply yet has a dim note under it (the words are in the table above) and, while `f` applies, the line `f send it to the fork instead`.
5. A rule, then `Replies from: main session` (dim; the mode that will answer the next question), the `Ask a question` Button and, when allowed, the `Mark answered` Button. While asking, the Input replaces the `Ask` Button.
6. The keys under a rule, dim: `enter ask · d done · f fork instead · b back`, then `o older · n newer · s send 1 · h hide`, each shown only when it applies.

The pane's window is `e.props.scroll.bodyRows` and a bare digit or letter only arms Buttons wholly in view, so the keys can't be allowed to scroll out. The thread gets the rows left once the fixed parts above are counted (at least 4), takes entries from the newest backwards until they are used up (a line count estimated from the text length and `bodyColumns - 2`, so it errs towards fewer entries), and shows `3 earlier entries · o` above the thread and `2 newer entries · n` below it when some are hidden. `o` and `n` move `threadSkip`. **(Claude's call)**

### Text mock-ups

The thread at 49 body columns: one answered question with a `↻` line, then a question queued behind a running turn. The row on the ring is marked `>`.

```
Decisions                               keys on
Config file plan > d1 > discussion
-----------------------------------------------
Where the config file lives
open, in discussion
-----------------------------------------------
you · 10:41
  Does it change if the repo has three
  packages?
Claude · 10:42
  A bit. The root file still works, but a
  per-workspace file wins if packages need
  different settings. I added that as a
  third option.
↻ Added option 3, Per workspace
you · 10:44
  Would CI find a file inside each package?
  queued, Claude is mid-step
  f send it to the fork instead
-----------------------------------------------
Replies from: main session
> Ask a question
  Mark answered
-----------------------------------------------
enter ask · d done · f fork instead · b back
s send 1 · h hide
```

Pressing `enter` on `Ask a question`, mid-sentence, then the pane is hidden and shown again. The Input holds the keys and the draft is back:

```
Replies from: main session
Ask  Should the third option be the default?|
-----------------------------------------------
enter send, empty enter cancels
```

A fork reply, and a question that is `answering`. The thread keeps the label so the person can tell who said it:

```
you · 10:51
  Is per-workspace common in monorepos?
Fork · 10:51
  Yes, most tools that support several
  packages read a file per package. I can't
  read the project's files, so I can't say
  what this repository does.
you · 10:52
  And what does ours do today?
  Claude is answering
```

A failed or orphaned question, with the same `f` key:

```
you · 10:55
  Which is cheaper to change later?
  no reply: the pane was reloaded
  f send it to the fork instead
```

The earlier version, opened with `enter` on a `↻` line. It is read-only, and the options have no Buttons, so no digit or `a` does anything here:

```
Decisions                               keys on
Config file plan > d1 > earlier version
-----------------------------------------------
Before: Added option 3, Per workspace
(10:42)
-----------------------------------------------
Where the config file lives

You run the tool from packages/api and it needs
its settings. Either it finds one file at the
project root by walking up, or each package has
its own copy that you must keep in step.

  1  Project root         (recommended)
  2  Per package

Why 1: every other tool here already reads from
the root.
-----------------------------------------------
b back to the discussion
```

At 96 columns the structure is the same: labels, entries wrapped at 94 columns, the `↻` line and notes on their own lines, the keys on one row.

## A reply landing while the pane is open

The pane redraws from the files on every render (workstream 1, decisions.md row 53), and a reply calls `$.ui.invalidate('ui.render')`, so it appears without a keypress. One risk: the decision screen's actions write the decision they drew, so a reply that landed after that draw would be overwritten by a choice or a park made a moment later, losing its thread entry. `chooseOption`, `parkDecision` and `unparkDecision` therefore read the file again and change only their own fields. A test writes a thread entry between the draw and the press and checks it survives. **(Claude's call; the first test I'd write for a bug workstream 1 couldn't have seen.)**

## The setting

```diff
+ "userConfig": {
+   "discussionReplies": {
+     "type": "string",
+     "title": "Discussion replies",
+     "description": "Who answers a question asked in a decision's discussion.",
+     "default": "main session",
+     "options": ["main session", "fork", "quick model"]
+   }
+ }
```

`/config` shows it as a picker (M4). The exact manifest keys are checked against `claude plugin validate .` in the build, and a test sets each value with `test(name, { options }, body)`.

## Tests

Each is a `claude plugin test` test beside its module. State is read and written only through `setView` and `readView` (workstream 1's log entry on what the mod API refuses), so anything that needs `$.state` is tested through the real plugin hooks (`plugin: 'decisions'`), and the store and reply logic as plain functions with an in-memory `$.fs` and a fake `$`.

| Behaviour | File | How |
| --- | --- | --- |
| a question in each mode puts a `person` entry and the reply in the thread, under the question | `discuss.test.ts` | main through the hooks with `turn.start` and `turn.complete` raised; fork and quick through the reply function with a fake `$.model` (or `on('model.fork')` if the kit stands that in, checked first) |
| the main reply comes from the right turn: an unrelated `turn.start` and `turn.complete` first, then the sent one; two queued questions each get their own reply | `discuss.test.ts` | |
| a subagent's `turn.complete` (has an `agentId`) is ignored | `discuss.test.ts` | |
| the queued note shows when a turn is running, `waiting` when idle, `answering` once the reply turn starts, and clears on its `turn.complete` | `thread.test.tsx` | mounted thread through the plugin |
| `f` sends the queued question to the fork, the pending entry goes, and the late main reply still lands | `thread.test.tsx`, `discuss.test.ts` | |
| a failed fork or quick call shows "no reply: <reason>" and `f` retries it | `discuss.test.ts` | |
| `d` then `enter` marks the decision `ready` with the settled text, and the answer prompt includes the whole thread and any `↻` line | `thread.test.tsx`, `send.test.ts` | exact string compared |
| `d` isn't offered on a `ready` or `sent` decision | `thread.test.tsx` | |
| a revision adds a `↻` line with the right `revision` index and keeps the earlier version; each refusal in the table | `tool.test.ts` | |
| opening a `↻` line shows the version before it, and `b` returns | `thread.test.tsx` | |
| the setting changes the mode: each of the three values | `discuss.test.ts` | `test(name, { options }, body)` |
| a half-typed question survives hiding the pane and reopening it | `thread.test.tsx` | |
| a pending entry from another load of the mod shows "no reply: the pane was reloaded" | `thread.test.tsx` | |
| a reply that lands between a draw and a choice isn't lost | `decision.test.tsx` | |
| thread paging: only the newest entries that fit show, with `o` and `n` | `thread.test.tsx` | |

## Real sessions

At most three, Sonnet, in a scratch project from `mktemp -d`, 150 by 40 in tmux. Claude is kept busy with the Phase 1 trick (read eight files one at a time with separate Read calls) to see the queued note.

1. Main session: add two decisions, open the thread, ask while Claude is busy and watch `queued, Claude is mid-step`, then the reply landing without a keypress. Ask something that should change the decision and check `decisions_update` and the `↻` line, then open the earlier version. `d`, `enter`, `s`, `c`, and check Claude's next turn mentions the discussion. Time each step.
2. Fork: `Discussion replies` set to `fork` in `/config` (or through the settings file if the picker can't be driven), ask the same kind of question, record the time and what it says about files.
3. Quick model: the same, then one more question while a turn runs to see the fork resend key on a main question if there is a session left; otherwise that is a test only.

What I sent, what I saw, how long and how many turns go in the log.

## Open Questions

1. **Fork can't read files, so does the side agent come back?** D14 says no side agent unless spike 0 found this, and spike 0 did (decisions.md S3). S3 already says D14 stands for v1 pending Aaron, so I've built without it and logged the question as asked.
2. **Is "settled in the discussion, see below" enough of an answer?** `d` records no option, because the discussion holds what was decided and Claude gets all of it. If you'd rather the person picks an option first, `d` could ask for one, at the cost of another step.
3. **The changes to workstream 1's files** (the table above). Approving the spec approves them.
4. **A `/config` change reloads the module**, so a question in flight shows as lost and has to be sent again with `f`. Changing the setting mid-question should be rare, so I've left it.
5. **The mode is per setting, not per message.** A person who gets a fork reply saying it can't see files has to change the setting to ask the main session. A key to ask the main session instead would mirror `f`. Not built; say if you want it.
