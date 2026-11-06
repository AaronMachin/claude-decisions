# Workstream 1: core loop

This document specifies the first workstream of the decisions pane: Claude adds a choice, it shows in the pane, the person picks it by number and `enter`, reviews and sends, and Claude gets one structured answer. It's still there after `/clear` and from another worktree of the same repository.

Status: draft for approval. Anything marked **(Claude's call)** is also a numbered row in `docs/decisions.md` (48 onwards) and can be overturned.

## What gets built, and what doesn't

| In | Not in (and who builds it) |
| --- | --- |
| The decision record and its file store (`hooks/store.ts`) | The discussion thread, `d` done, revisions shown as `↻` lines (workstream 2) |
| `decisions_add` and `decisions_list` (`hooks/tool.ts`) | The other four kinds and their keys, `r`, the folded "Claude's call" and "Already decided" sections, `dependsOn` and `blocks` behaviour (workstream 3) |
| The pane: tabs by group, the list, one decision with its options, parking (`hooks/pane/`) | Appending the open list at session start and after `/clear`, the `AskUserQuestion` hook, the nudge, evals, subagent refusal (workstream 4) |
| Send: review screen, one structured prompt (`hooks/send.ts`) | `/config` settings (Discussion replies, Send answers, Open the pane) |
| Status line counts, `/decisions`, the `h` hide key | |

The types already carry every field workstreams 2 and 3 need, so they add behaviour, not fields.

## The decision type

This is the shape workstreams 2 and 3 build against, logged as a `contract` with this block.

```diff
+ export type Kind = 'choice' | 'go-ahead' | 'assumption' | 'finding' | 'question'
+
+ export type State =
+   | 'open' | 'live' | 'ready' | 'sent' | 'parked' | 'superseded' | 'withdrawn'
+
+ export type Section = 'needs-you' | 'claudes-call' | 'already-decided'
+
+ export type Option = {
+   id: number              // 1-based, never reused; what the person types
+   label: string
+   changes?: string        // what it would take and what changes if chosen
+   fromDiscussion?: boolean
+ }
+
+ export type Source = { label: string; path: string }   // path is a file path or a URL
+
+ export type Answer = {
+   option?: number         // Option.id
+   text?: string           // free text, for kinds without options (workstream 3)
+   condition?: string      // set from the discussion (workstream 2)
+   answeredAt: string      // ISO time
+ }
+
+ export type ThreadEntry = {
+   who: 'person' | 'claude' | 'fork' | 'quick'
+   text: string
+   at: string
+ }
+
+ export type Revision = {
+   at: string
+   summary: string         // "Added option 3", "Recommendation changed to 2"
+   before: Omit<Decision, 'revisions' | 'thread'>   // the version it replaced
+ }
+
+ export type Decision = {
+   version: 1              // file format, for later migrations
+   id: string              // "d7"; the file is d7.json
+   number: number          // 7; what the person says ("decision 7")
+   group?: string          // the piece of work; none goes in the "Other" tab
+   section: Section        // 'needs-you' unless workstream 3 says otherwise
+   kind: Kind
+   title: string
+   scenario: string
+   options: Option[]
+   recommendation?: { option: number; reason: string }
+   sources: Source[]
+   dependsOn: string[]     // ids of decisions that have to be answered first
+   blocks?: string         // what cannot go on until this is answered, in words
+   state: State
+   parkedReason?: string
+   answer?: Answer
+   thread: ThreadEntry[]
+   revisions: Revision[]
+   createdAt: string
+   updatedAt: string
+   sentAt?: string
+ }
```

Notes on the fields:

- `group` is optional because a decision with no group goes in a tab called "Other". `decisions_add` tells Claude to always give one.
- `section` is stored as `needs-you` and the tool doesn't accept anything else yet. Workstream 3 widens the tool and builds the folded sections.
- `dependsOn` is decision ids because "changing an answer re-opens the decisions that depend on it" needs ids. `blocks` is plain words ("the plan", "the migration") because what it holds up is usually work, not another decision. **(Claude's call)**
- Options are numbered by `id`, not lettered. The spike's `a`, `b` option ids would sit next to the `a` key (highlight the recommendation) and read as the same thing. `recommendation.option` is that number. **(Claude's call)**
- `kind` is `'choice'` here. The tool accepts only `choice` and refuses the rest with "the other kinds arrive later", so Claude can't add something the pane can't answer yet. The design's table calls it a choice; the spike called it a decision. **(Claude's call)**

## Storage

One JSON file per decision at `~/.claude/decisions/<repoKey>/<id>.json`, written and read through `$.fs` (spike 0 found this works; decisions.md M2).

- **Key.** `git rev-parse --path-format=absolute --git-common-dir` through `$.process.run`, then the repository folder's name plus the first eight hex characters of a SHA-256 of that path (`pantry-3fa9c1d2`). A worktree and its main checkout give the same path, so the same key. If git exits non-zero (not a repository) the key comes from the working folder's path the same way (decisions.md 47).
- **Ids.** `d<n>`, where `n` is one more than the highest file in the folder. The file is written only if `$.fs.exists` says the name is free, and the next number is tried if two sessions raced (up to five tries, then the add fails with a reason). **(Claude's call)**
- **A missing folder is "empty".** `$.fs.list` rejects on a missing folder.
- **Reading.** Every render and every tool call reads the folder again, so a second session's writes show without a reload. There's no polling: a pane already open in one session redraws when that session changes something and otherwise on its next render. Fifty decisions is fifty small reads. **(Claude's call, to revisit if it feels slow)**
- **A file that doesn't parse** is skipped and the pane shows one dim line, "1 decision file couldn't be read", rather than failing the whole list.

## The tools

Both are registered in `session.start` with `isDeferred: false`, and answer from a `tool.call` hook returning `{ result: <string> }`. The tools appear as `mcp__decisions__decisions_add` and `mcp__decisions__decisions_list`.

### decisions_add

Input, as the JSON schema Claude sees:

```diff
+ group:          string, optional   the piece of work; reuse the exact text for the same work
+ kind:           'choice'
+ title:          string             plain, readable without the conversation
+ scenario:       string             what happens today, a concrete example
+ options:        1 to 12 of { label: string, changes?: string }
+ recommendation: { option: number, reason: string }   option is a 1-based position in options
+ sources?:       { label: string, path: string }[]
+ dependsOn?:     string[]           decision ids
+ blocks?:        string             what cannot go on until this is answered
```

The mod gives each option its `id` (its position, 1 to 12). The tool refuses, as `{ deny: <reason> }`, naming the field and what to do:

| Refused when | Reason starts |
| --- | --- |
| `scenario`, `title` or `kind` is missing or blank | "decisions_add refused: scenario is required. Write a concrete example of what happens and call again." |
| `kind` isn't `choice` | "...kind must be choice; the other kinds arrive later." |
| `options` is empty, or has more than 12 | "...options needs 1 to 12. Split a bigger choice into two decisions." |
| An option has no label | "...option 2 has no label." |
| `recommendation` is missing or names an option that isn't there | "...recommendation.option must be the number of one of the options." |
| `dependsOn` names an id that isn't in the store | "...dependsOn d9: no such decision." |

On success the result is a string: `Added d4 to the pane. 3 open.` A decision is stored `open`.

The first 4,096 characters of the description carry the rules and the format, because that's all that reaches Claude (Phase 1, Task 5). The draft is in `hooks/tool.ts`, adapted from the instructions spike: one line in chat, never the list; every decision has a scenario and a recommendation with its reason; plain titles; check `decisions_list` before asking; keep working on what doesn't depend on an open decision; a condition in an answer is part of the answer. A test fails if the description is over 4,096 characters. Workstream 4 tunes the words.

### decisions_list

No input. It reads the store and answers, as one string, the decisions that are `open`, `live`, `ready` or `parked`, and leaves out `sent`, `superseded` and `withdrawn`:

```
Decisions in the pane: 2 waiting for the person, 1 answered but not sent, 1 parked.
d1 [Config file plan] open: Where the config file lives. Options: 1 Project root, 2 Per package. Recommended: 1.
d2 [Sharing links] open: What happens when a shared recipe link expires. Options: 1 Show an expired page, 2 Keep links working. Recommended: 1.
d3 [Config file plan] ready, answered 2 Vitest, not sent yet: Which test runner.
d5 [Other] parked (waiting on the design review): Which icon set.
```

With nothing to list: `No open decisions in the pane.` Ready and parked are included so Claude doesn't ask them again (design, "What's open").

## The pane

`/decisions` registers in `session.start`, then opens the pane with `focus: true`, and clears the "hidden" flag. When Claude adds a decision the mod calls `$.ui.open` without `focus`, which the engine places by itself only from 144 columns, unless the person hid the pane (`h`), when it stays hidden and only the status line count changes (design, "The pane"). **(Claude's call: the design says this, but the `/config` setting that turns it off belongs to a later workstream.)**

The header always shows whether the pane holds the keys, from `e.props.isFocused`: `keys on` (accent colour, bold) or `keys off` (dim). It doesn't name the focus chord, because that's the person's binding to move.

The status line is `$.ui.status`: `Decisions: 2 open · 1 ready`, or cleared when there's nothing open, ready or parked. It's refreshed on `session.start`, after every add, answer, park and send.

### Screens

| Screen | What it shows | Where you get there |
| --- | --- | --- |
| List | the tab row, then the selected tab's decisions | opening the pane; `b` from a decision |
| Decision | the title, scenario, options, recommendation, sources and the keys | `enter` on a list row |
| Review | the answers ready to send, each ticked | `s` from the list or a decision |

Tabs are one row, in the order each group first appeared, then "Other" (decisions with no group), then "Parked" if anything is parked. A parked decision shows in "Parked" and not in its group's tab. Each tab is a Button keyed `tab:<name>`, so up/down and `tab` walk them with the rest, and `t` moves to the next tab (wrapping). **(Claude's call)**

Inside a tab:

- **Needs you (n)**: decisions that are `open` or `live`, oldest first. Workstream 3 adds the folded sections beneath.
- **Answered (n)**: `ready` and `sent`, with the chosen option shown and the word `ready` or `sent` at the right. **(Claude's call: the folded sections are workstream 3's, but a decision answered here still has to be findable to change before sending, and D6 says it keeps its options.)**

A list row is one Button keyed `row:<id>`, `plain`, drawing `d1  Where the config file lives`, truncated with `…` to the width. The first row of "Needs you" is `autoFocus`, so `enter` alone opens it.

### Keys

| Screen | Key | Does |
| --- | --- | --- |
| List | up / down | move between tabs and rows (the engine's ring) |
| List | `enter` | open the decision on the ring |
| List | `t` | next tab |
| List | `s` | open the review screen (shown only when something is ready) |
| List | `h` | hide the pane |
| Decision | `1` to `9`, `0` | highlight option 1 to 9, or 10 |
| Decision | a second digit within 1000 ms | extends the number when that option exists (`1` then `0` is 10, `1` then `1` is 11); otherwise the second digit stands alone |
| Decision | up / down | move the highlight (the engine's ring over the options) |
| Decision | `enter` | on a highlighted option, choose it: the decision becomes `ready` and the pane returns to the list. On nothing highlighted, the `Discuss` Button (see below) |
| Decision | `a` | highlight the recommended option. Does nothing when there isn't one |
| Decision | `b` | clear a highlight; with nothing highlighted, go back to the list. On the list `b` does nothing |
| Decision | `p` | park: asks "Why park it?" in an Input; `enter` parks it, an empty `enter` cancels. On a parked decision `p` puts it back to `open` **(Claude's call, nothing in D3 or D4 says how to unpark)** |
| Decision | `s`, `h` | as on the list |
| Review | up / down, `enter` | move to a row, tick or untick it |
| Review | `c` | confirm: send the ticked answers |
| Review | `b` | back, nothing sent |

How the keys are wired is spike 0's route (decisions.md S1):

- Each option is a `plain` Button keyed `opt:<id>` whose `onPress` chooses it. A row of dim digit Buttons (`hotkey` `1` to `0`, keyed `digit:<d>`, drawn only for digits that match an option) calls `$.ui.focus` on `opt:<n>`. The "previous digit" is written to `$.state` before awaiting `$.ui.focus`, because two quick keys race. A digit beyond the option count is ignored.
- A `Discuss` Button, keyed `discuss`, is `autoFocus` and stands for "nothing highlighted". Moving the ring off it is a highlight; `b` moves it back. In this workstream pressing it shows a dim line, "No discussion yet", and workstream 2 replaces that with opening the thread. Enter with the ring on nothing reaches no handler, which is why the Button is there.
- The mod follows the highlight with a `ui.focus` hook: the person's up/down arrive there with `element` `opt:<n>` (the mod's own `$.ui.focus` calls don't, so the digit handler sets the highlight itself). `a` and `b` read the highlight from `$.state`.
- The focus logic is a plain function (`pressDigit`, as in the spike) tested with a fake `$`, because the kit refuses `$.ui.focus` from a mounted Button.
- A choice made with a highlight and `enter` is the only way to answer. No single key answers anything, so a stray key can't answer or send (CONTRIBUTING, "nothing happens by accident").

An answered decision shows every option with the chosen one marked `✓` and the others dim, so the person can see what was passed over (D6). While it's `ready`, choosing again replaces the answer. Once `sent`, the keys are `b` only.

### State the pane keeps

The pane's own state lives in `$.state` (a hot reload loses module variables), declared in `types/index.d.ts` and named in `plugin.json` as `"types"`. The decisions themselves are never in `$.state`: the files are the only copy.

```diff
+ export type PaneView = {
+   screen: 'list' | 'decision' | 'review'
+   tab?: string                // 'g:<group>', 'other' or 'parked'
+   decisionId?: string
+   highlight?: number          // an Option.id, or none
+   typed?: { digit: string; at: number }
+   ticked: string[]            // decision ids ticked on the review screen
+   isParking: boolean
+   parkDraft: string           // kept here, because hiding the pane loses an Input's text
+   notice?: string             // one dim line, such as "Sending failed, answers are back to ready"
+   isHidden: boolean
+ }
+
+ declare module 'claude-code' {
+   interface PluginState {
+     decisions: { view: Shaped<PaneView> }
+   }
+ }
```

### Text mock-ups

The pane docks beside the transcript from 120 columns, where its body is 49 columns, and sits inline from 100 columns, where its body is 96. In the real pane the row on the ring is drawn inverted; here it's marked `>`.

The list at 49 columns. Group names longer than 14 characters are cut with `…`; if the tabs still don't fit the row scrolls so the open tab is in view, with `‹` and `›` at the ends.

```
Decisions                               keys on
Config file plan  Sharing links  Other  Parked
-----------------------------------------------
Needs you (2)
> d1  Where the config file lives
  d2  What happens when a shared recipe li…
Answered (1)
  d3  Which test runner       ✓ 2 Vitest  ready

enter open · t next tab · s send 1 · h hide
```

One decision at 49 columns. The keys sit under a rule, dim, apart from the text above them. The ring is on option 1 after a `1` (the highlighted row is inverted):

```
Decisions                               keys on
Config file plan > d1
-----------------------------------------------
Where the config file lives

You run the tool from packages/api and it needs
its settings. Either it finds one file at the
project root by walking up, or each package has
its own copy that you must keep in step.

> 1  Project root          (recommended)
     one file, found by walking up, shared by
     every package
  2  Per package
     a file in each package, so settings can
     differ but are edited in several places

Why 1: every other tool here already reads from
the root.
Sources: .eslintrc.json:3
-----------------------------------------------
1-2 highlight · enter choose · a recommended
p park · b back · s send · h hide
```

After choosing, the same screen returns to the list, where `d1` is under "Answered" as `✓ 1 Project root  ready`. Opening it again shows:

```
  1  Project root       ✓ chosen
  2  Per package
```

The list at 96 columns. The right-hand column carries what the row means:

```
Decisions                                                                       keys on
Config file plan   Sharing links   Other   Parked (1)
------------------------------------------------------------------------------------------
Needs you (2)
> d1  Where the config file lives                                      2 options · open
  d2  What happens when a shared recipe link expires                   2 options · open
Answered (1)
  d3  Which test runner                                      ✓ 2 Vitest · ready to send

enter open · t next tab · s send 1 · h hide
```

One decision at 96 columns. Wider lines mean fewer wrapped rows, and the options show their `changes` on the line below:

```
Decisions                                                                       keys on
Config file plan > d1
------------------------------------------------------------------------------------------
Where the config file lives

You run the tool from packages/api and it needs its settings. Either it finds one file at
the project root by walking up, or each package has its own copy that you must keep in step.

> 1  Project root                                                           (recommended)
     one file, found by walking up, shared by every package
  2  Per package
     a file in each package, so settings can differ but are edited in several places

Why 1: every other tool here already reads from the root.      Sources: .eslintrc.json:3
------------------------------------------------------------------------------------------
1-2 highlight · enter choose · a recommended · p park · b back · s send · h hide
```

The review screen at 49 columns. Each row is a Button; `enter` ticks or unticks it:

```
Decisions                               keys on
Send answers
-----------------------------------------------
> [x] d1  Where the config file lives
          1 Project root
  [ ] d3  Which test runner
          2 Vitest

2 ready, 1 ticked. Nothing is sent until c.
-----------------------------------------------
enter tick · c send 1 · b back
```

## Send

`s` opens the review screen with every `ready` decision ticked. `c` confirms: the mod builds one prompt from the ticked decisions, marks each `sent` (with `sentAt`) and writes the files, then calls `$.prompt.submit` without awaiting it, because from a mod it waits for Claude's turn to end. If the submit rejects, the decisions go back to `ready` and the pane shows a notice. Marking them first means a second `c` can't send the same answers twice. A decision left unticked stays `ready` and is there for the next send. Nothing is sent before `c`. Marking decisions `sent` is the mod's job, not Claude's, because there's no tool for Claude to do it and Claude can't see which answers it was actually given. **(Claude's call)**

### The answer prompt

This is the exact text the mod sends. `Discussion:` is `none` until workstream 2 has a thread to report; the format for a thread is already here so that workstream only fills it in. A decision's id, the choice, any condition and the discussion's outcome are all in it (design, "Answers arrive as one structured prompt").

```
Answers from the decisions pane. These are the person's decisions, so act on them and don't ask again. A condition is part of the answer.

Decision d1 · Where the config file lives (Config file plan)
Chosen: 1. Project root
Condition: none
Discussion: none

Decision d3 · Which test runner (Config file plan)
Chosen: 2. Vitest
Condition: only if it runs under the existing CI image
Discussion:
  person: does Vitest need a new CI image?
  claude: no, the current one has the Node version it needs.
```

The second example shows what the format looks like once workstreams 2 has a condition and a thread to put in. With one answer the first line says "Answer", not "Answers". Claude reads the prompt as arriving from the plugin ("The decisions plugin sent ..."), which is how the engine labels it.

## Tests

Each of these is a `claude plugin test` test in a file beside its module. Where the kit refuses something, the logic is a plain function tested with a fake `$` (an in-memory `$.fs`, a fake `$.process.run`, a fake `$.ui.focus`), and the real session covers the layer the kit can't.

| Behaviour | File | How |
| --- | --- | --- |
| `decisions_add` refuses a missing scenario, and each refusal in the table | `tool.test.ts` | through the kit's `$.tool.call`; plain function for the checks |
| add then `decisions_list` returns it | `tool.test.ts` | |
| the store survives a reload | `store.test.ts` | write, build a new store on the same fake `$.fs`, read |
| `decisions_list` returns open decisions and leaves out sent ones | `tool.test.ts` | |
| two worktrees of one repository get the same key; another repository differs; a non-repository falls back to the folder | `store.test.ts` | fake `$.process.run` answering the same common directory from two working folders |
| the description is 4,096 characters or fewer | `tool.test.ts` | |
| number then `enter` answers | `decision.test.tsx` | `pressDigit` with a fake `$`, then the choose function; mounted view finds `opt:<n>` and the digit hotkeys |
| `enter` alone opens the decision | `list.test.tsx` | mounted list: first row `autoFocus`, its press opens the decision |
| `b` clears a highlight, then goes back; on the list it does nothing | `decision.test.tsx`, `list.test.tsx` | |
| `a` highlights the recommendation, and does nothing without one | `decision.test.tsx` | |
| a second digit within 1000 ms extends the number, after it doesn't | `decision.test.tsx` | |
| two digits typed before the first focus answers still read as 10 | `decision.test.tsx` | (the race in spike 0) |
| parking needs a reason, and an empty `enter` cancels | `decision.test.tsx` | |
| send only after confirm, and only ticked answers | `send.test.ts` | fake `$.prompt.submit`; nothing called before `c`; an unticked decision stays `ready` |
| a failed submit puts the answers back to `ready` | `send.test.ts` | |
| the answer prompt's text, with and without a condition and a discussion | `send.test.ts` | exact string compared |
| the status line counts | `register.test.tsx` | |

## Real session

At most three, Sonnet, in a scratch project from `mktemp -d` plus one `git worktree` of it, 150 columns by 40 rows in tmux, driven by `send-keys`:

1. Ask Claude to add two choices about a made-up Pantry change. Expect one line in chat. Press `/decisions`, then `2`, `enter` on a decision, `s`, `c`. Expect Claude's next turn to name the answer.
2. `/clear`. Ask what's open. Expect Claude to call `decisions_list` and name the second decision, with the answered one left out.
3. A second session in the worktree: `/decisions` shows the same decisions.

I'll record what I sent, what I saw, how long and how many turns, and list anything left under `~/.claude/decisions/` in the report.

Before the pane work I'll try two things in the first session that the spike left open: the digit row's look (`1: 1` is what the spike drew), and the length of the gap for a second digit.

## Open points for the controlling session

1. **The `Discuss` Button does nothing useful until workstream 2.** Pressing `enter` on a decision with nothing highlighted shows "No discussion yet". Workstream 2 replaces that Button's handler. Is that acceptable, or should it stay hidden here and only appear in 2?
2. **Opening the pane when Claude adds a decision.** I've built the design's rule (open unfocused, from 144 columns, unless hidden) because the status line count alone is easy to miss. The setting that turns it off isn't mine. Say if you'd rather this workstream only open on `/decisions`.
3. **Marking decisions `sent` happens when the person confirms, not when Claude reads them.** If Claude never acts on an answer it still shows as sent. I think that's right for v1 and a later workstream can add a read-back.
4. **`p` on a parked decision puts it back to `open`.** D4 doesn't say how a decision comes out of parking.
5. **`blocks` is words, and `dependsOn` is ids.** Workstream 3 may want `blocks` as ids too; the contract log entry says what changes if it does.
