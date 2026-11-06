# Workstream 3: kinds and reviews

This document specifies the third workstream of the decisions pane: the go-ahead, assumption, finding and question kinds, the "Needs you" / "Claude's call" / "Already decided" sections for a big review, parking with a reason, and reopening the decisions that depend on one whose answer changes.

Status: draft for approval. Anything marked **(Claude's call)** is also a numbered row in `docs/decisions.md` (93 onwards) and can be overturned.

## What gets built, and what doesn't

| In | Not in (and who builds it) |
| --- | --- |
| The four other kinds, added through `decisions_add` with their keys (`hooks/pane/kinds.tsx`) | The wording of the tool's description and the rule that a finding's title starts with its area (workstream 4) |
| The sections inside a tab, folding, counts and paging (`hooks/pane/sections.tsx`) | Which findings Claude puts in which section is Claude's judgement, taught by workstream 4's wording |
| The assumptions batch screen with `r` | Sending, the review screen and the thread (workstreams 1 and 2, unchanged) |
| Parking with a reason, shown in the Parked tab | The person moving a decision between sections (see Open Questions 6) |
| `dependsOn` and `blocks` on `decisions_add` and `decisions_update`, and reopening dependents (`hooks/dependents.ts`) | |
| The "For you to do" tab and the `isTask` flag | |

## Where each key lives

Nothing here adds a key to a decision that already has it. The numbered options are the same machinery on every kind (workstream 1's digits, `a`, `b`, `enter`); a kind only decides which options exist.

| Kind | Options (fixed by the tool, Claude doesn't write them) | `a` | Also |
| --- | --- | --- | --- |
| choice | Claude's, 1 to 12 | yes | |
| go-ahead | `1` Yes, `2` No | yes | |
| assumption | `1` Right, `2` Wrong | yes | `r` on the batch screen |
| finding | `1` Agree, `2` Already decided, `3` Disagree, `4` Not sure | yes | |
| question | none | none | type in the discussion, `d`, `enter` (workstream 2) |
| any, with `isTask` | `1` Done, `2` Can't do it | none | |

Scenario for a go-ahead: Claude has a branch ready and wants to push it. The decision reads "Push the config branch to the shared remote". You press `1`, the row for option 1 is highlighted, you press `enter`, and the pane goes back to the list with the decision ready to send. If you press `2` instead, Claude is told not to push.

Scenario for a question: Claude can't tell which staging account to use. The decision has no numbers. `enter` opens the discussion, you type "the one ending in 41", then `d` highlights `Mark answered` and `enter` confirms. The answer Claude gets is the whole thread, which contains what you typed.

Every option of the three yes/no-style kinds carries a one-line `changes`, written by the tool so every finding reads the same. The `changes` lines are in `hooks/pane/kinds.tsx` as `FIXED_OPTIONS`.

## Changes to earlier workstreams' files

Workstreams 1 and 2 own these, so each is listed here and logged as a `question` for approval. Approving the spec approves them.

| File | Change |
| --- | --- |
| `hooks/store.ts` | `Decision` gains `isTask?` and `reopenedBy?` (types only) |
| `types/index.d.ts` | `PaneView` gains the `batch` screen and four fields; the atom's shape tag goes from `view-2` to `view-3` |
| `hooks/tool.ts` | `decisions_add` takes the five kinds, `section` and `isTask`; `decisions_update` takes `dependsOn`, `blocks` and `section`; `decisions_list` counts only what needs the person; one sentence in `ADD_DESCRIPTION` stays under 4,096 characters (the budget has 154 left; the rest of the field guidance goes in the input schema's own descriptions, which have no limit, and workstream 4 rewrites the wording) |
| `hooks/pane/list.tsx` | `tabsFor` adds the "For you to do" tab; `counts` and `statusText` count only "Needs you"; `ListView` draws its sections through `sections.tsx`; parked and reopened rows get a dim second line |
| `hooks/pane/decision.tsx` | `choose` calls `reopenDependents` after a changed answer; the state line names the kind; `INITIAL_VIEW` carries the new fields; the shape tag |
| `hooks/pane/render.tsx` | draws the `batch` screen; `followFocus` follows the ring onto batch rows; `focusFirstRow` uses `sections.tsx`'s first row |
| `hooks/register.tsx` | none expected (the tool and render hooks are already wired) |
| `hooks/dependents.ts` (new) | `reopenDependents`, pure over the store, so `decision.tsx` can import it without a cycle with `sections.tsx` |
| `hooks/pane/review-47.json` and `hooks/pane/seed-review.ts` (new) | the 47-finding fixture and a script that adds it through `addDecision` |

## Types and tool fields (contracts)

Logged as `contract` entries with these blocks.

```diff
  export type Decision = {
    ...
+   /** "For you to do": something the person does themselves. Kind is go-ahead; the options are Done and Can't do it. */
+   isTask?: boolean
+   /** Set when a decision this one depends on changed its answer. Shown only while this decision is open or live. */
+   reopenedBy?: { id: string; at: string; was?: Answer }
  }
```

```diff
  export type PaneView = {
-   screen: 'list' | 'decision' | 'review' | 'thread'
+   screen: 'list' | 'decision' | 'review' | 'thread' | 'batch'
+   openSection?: 'claudes-call' | 'already-decided'   // the one folded section that is open; none when both are folded
+   sectionPage: number                                // 0-based page of the open section's rows
+   marks: Record<string, number>                      // batch screen: decision id -> the option highlighted, not yet confirmed
+   batchRow?: string                                  // batch screen: the decision id the ring is on
  }
```

`decisions_add`:

```diff
- kind: 'choice'
+ kind: 'choice' | 'go-ahead' | 'assumption' | 'finding' | 'question'
+ section?: 'needs-you' | 'claudes-call' | 'already-decided'   // default 'needs-you'
+ isTask?: boolean                                              // kind must be 'go-ahead'
- options:        required, 1 to 12
+ options:        required for choice (1 to 12); refused for every other kind, because the tool fills them
- recommendation: required
+ recommendation: required, except for question and isTask (refused there)
  // refused, with the reason in the result: section other than needs-you together with isTask;
  // isTask with a kind other than go-ahead; options given for a fixed-option kind;
  // a recommendation.option outside the kind's options (finding: 1 to 4, assumption and go-ahead: 1 or 2)
```

`decisions_update`:

```diff
  id, summary, addOptions?, recommendation?
+ dependsOn?: string[]   // replaces the list; refused for an unknown id, the decision itself, or a loop (d2 depends on d5 which depends on d2)
+ blocks?: string        // replaces the sentence
+ section?: 'needs-you' | 'claudes-call' | 'already-decided'   // moves the decision, e.g. a finding a discussion showed needs the person
  // "nothing to change" now means none of addOptions, recommendation, dependsOn, blocks, section
  // addOptions is refused for a fixed-option kind; recommendation is refused for a question or isTask
```

A change to `dependsOn` or `blocks` is recorded as a `↻` line like any other revision ("Now depends on d2", "Now blocks the plan", "Moved to Needs you"). The earlier version is kept.

## Sections

Inside a tab, the decisions are in four groups, in this order. "Needs you" is open and never folds. Each of the others is one heading Button, folded to start with, that shows its count. **(Claude's call on the order, which places "Answered" last so the two folded headings sit directly under "Needs you" as D8 says)**

| Group | Holds | Shown |
| --- | --- | --- |
| Needs you | `section` is `needs-you`, state `open` or `live` | always open, a bold heading with the count |
| Claude's call | `section` is `claudes-call`, state `open` or `live` | folded; `enter` on the heading opens it |
| Already decided | `section` is `already-decided`, state `open` or `live` | folded; `enter` on the heading opens it |
| Answered | state `ready` or `sent`, whatever the section | as workstream 1 draws it |

The parked decisions are the Parked tab's, as now. A decision in a folded group is still `open` and can be answered or parked from where it is; answering moves it to Answered, so the group's count goes down by one.

Who decides the section: Claude, when it adds the decision (`section` on `decisions_add`). "Claude's call" means Claude has chosen and acted unless you overrule it; "Already decided" means an earlier answer or the code already settles it, and the reason (the `recommendation.reason`, which is always required) names what settles it.

**How a folded section opens.** The heading is a Button, so up and down reach it and `enter` on it opens it, as `enter` acts on whatever the ring is on everywhere else (D3). `enter` on it again folds it. **(Claude's call)** Opening one folds the other (an accordion), so the list never grows past one page of rows plus the other headings. The open section's rows come as a page sized to what the pane has left once the other rows are counted, never fewer than 4 (`bodyRows` less the fixed rows, the same arithmetic as the thread). When there are more rows than a page, `n` shows the next page and `o` the one before, both Buttons shown only when they apply. They are the keys the thread uses (`o` toward the start, `n` toward the end), so paging reads the same everywhere. **(Approved with this change.)** Changing tab folds both. The ring stays on the heading when it opens, so `down` goes to the first row.

The status line and `decisions_list` count only "Needs you" (and tasks), because 47 findings with 30 in "Claude's call" are not 47 things waiting on you. **(Claude's call)**

### Text mock-ups

Both mock-ups are at 49 body columns. The row on the ring is marked `>`. First, a 47-finding review: 6 need you, 24 are Claude's call, 11 are already decided, 6 are answered.

```
Decisions                               keys on
Sharing links  Search review  For you to do  Parked
-----------------------------------------------
Needs you (6)
> d12  Search ranking: exact matches sort low
  d15  Search ranking: weights are in the code
  d31  Search indexing: nightly rebuild is slow
  d33  Search indexing: deleted recipes remain
  d40  Search filters: the diet filter is OR
  d44  Search input: no limit on query length
▸ Claude's call (24)
▸ Already decided (11)
Answered (6)
  d4   Search input: debounce is 50 ms    ✓ 1  ready
  ...
next tab  send 6  hide
```

The same tab with "Claude's call" opened (`down` to its heading, `enter`). The page has room for 8 rows, so it shows 1-8 and `n` is offered:

```
Needs you (6)
  d12  Search ranking: exact matches sort low
  ...
▾ Claude's call (24)
> d2   Image upload size limit: one user can
  d3   Image upload size limit: no virus scan
  d5   Image upload format: HEIC is rejected
  ...
  n next 8 more
▸ Already decided (11)
Answered (6)
```

`enter` on d2 opens it, `3` highlights "Disagree", `enter` answers it and returns to the list with d2 under "Answered" and "Claude's call (23)".

A parked or reopened row has a dim second line (the Parked tab and the list):

```
  d17  Search ranking: weights are in the code
       reopened because d3 changed
  d21  Search filters: the diet filter is OR
       parked: waiting on the product owner
```

In the Parked tab the second line starts with the decision's group (`Search review · waiting on the product owner`), because that tab holds parked decisions from every group. The parked reason no longer sits at the right edge of the row, where a long reason cut the title. **(Claude's call)**

## The assumptions batch screen

Claude has carried on with a handful of assumptions. Each is an ordinary assumption decision (a row in the list, a decision screen with `1` Right and `2` Wrong). When two or more are open in "Needs you", the list puts one extra row at the top of that group, `Check 6 assumptions together`, which opens the batch screen. The individual rows stay in the list, so nothing is hidden behind it. **(Claude's call)**

The batch screen lists the tab's open assumptions, one row each, with the ring on the first. Keys:

- `1` highlights Right on the row the ring is on, `2` highlights Wrong. The row shows `right?` or `wrong?` and nothing is saved (D3).
- `enter` on a marked row confirms that row and the ring moves to the next unanswered row. `enter` on an unmarked row opens that decision's screen, as in the list.
- `r` marks Right on every row that has no answer and no mark, leaving a row already marked Wrong as it is, and moves the ring to `Confirm`, which shows how many marks it will save. `enter` on it saves them all and returns to the list. `b` clears the marks first, then goes back, as on a decision screen (D4).
- A saved answer is an ordinary answer (`chooseOption`), so it goes through the same review and send, and reopens dependents.

Scenario: six assumptions about the config plan. You read them and d6 ("Windows paths are out of scope") is wrong. You press `down` to d6 and `2`, so it shows `wrong?`. You press `r`: the other five show `right?` and the ring jumps to `Confirm 6`. `enter` saves them: five Right, one Wrong. The pane returns to the list with "Answered 6 assumptions: 5 right, 1 wrong." d6 will reach Claude as Wrong, and you type what is right in its discussion if you want to say.

```
Decisions                               keys on
Config file plan > assumptions
-----------------------------------------------
Check 6 assumptions
  d3  Settings are YAML                  right?
  d4  Tests run on Node 20               right?
  d5  Run only from the project root     right?
> d6  Windows paths are out of scope     wrong?
  d7  No setting needs a restart         right?
  d8  Config is read once at start       right?
-----------------------------------------------
  Confirm 6
1 right  2 wrong  r rest right  b back
```

Before `r` the same screen shows `wrong?` only on d6 and nothing on the other rows. A row already answered shows `✓ right` or `✓ wrong` dim and `r`, `1` and `2` skip it. At 49 columns a title is cut with `…` to keep the mark on the row (the mark is 7 characters wide at most).

## Parking

`p` parks any kind with a reason (workstream 1 built it: an Input, an empty `enter` cancels, the decision moves to the Parked tab). Nothing about parking changes for the new kinds except where it shows: the Parked tab's rows get the group and reason on a dim second line (above), and `decisions_list` already tells Claude what is parked and why. `p` again unparks it to `open` in the section it had. A parked decision stays out of "Needs you", the counts of the sections and the batch screen.

## Dependencies and reopening

`dependsOn` already means "ids of decisions that have to be answered first" (workstream 1). A decision's dependents are the decisions whose `dependsOn` names it. Claude sets `dependsOn` and `blocks` on add and can change them with `decisions_update`.

**What changes an answer.** Choosing a different option on a decision that is `ready` (the person changes their mind before sending). Choosing the same option again is not a change. A decision that is `sent` can't be re-answered (workstream 1), so it never triggers this.

**What reopens.** When a decision's answer changes, `reopenDependents` looks at every decision that depends on it:

| Dependent's state | What happens |
| --- | --- |
| `ready` | back to `open`, answer cleared, `reopenedBy: { id, at, was }` where `was` is the answer it had |
| `open`, `live` | unchanged; nothing was answered |
| `parked` | unchanged, still parked |
| `sent` | unchanged: Claude already acted on it, so it can't be taken back |

Depth is one level: a decision whose answer was cleared doesn't change *its* dependents, because nothing was decided about it yet, and answering it again will reopen them if it changes then. **(Claude's call)**

**What the pane says.** After `enter` on the changed decision, the list's notice line reads `d3 changed. Reopened d5 and d6.` and, when some were already sent, `d7 was already sent.` The reopened rows are back in "Needs you" with the dim second line `reopened because d3 changed`. Opening one shows the same under its title: `Reopened because d3 changed. You had answered 2 Per package.` The line shows only while the decision is open or live, so answering it again clears it with no extra write. **(Claude's call)**

Scenario: d3 is "Where the config file lives" and you answered 1, Project root. d5, "Where the cache goes", depends on d3 and you answered it 2. Before sending you change d3 to 2, Per package. The list says `d3 changed. Reopened d5.` d5 is open again in "Needs you" with "reopened because d3 changed" under it, and its old answer is in its state line, so you can see what you decided on the old basis.

**Blocking.** A decision with `blocks` shows `Blocks: the plan` dim under its scenario, and `Depends on: d2, Where the config file lives (answered 1 Project root)` or `(not answered yet)` for each id it depends on. In a wide row (70 columns or more) the meta reads `4 options · open · blocking`. What Claude says in chat about what it is waiting on is workstream 4's wording. **(Claude's call on what is shown)**

## For you to do

`isTask: true` on `decisions_add` makes a decision for something only the person can do (sign in, run a command). It isn't a kind: it is a `go-ahead` whose options the tool replaces with `1` Done and `2` Can't do it, with no recommendation, always in "Needs you". The scenario carries the steps. It appears in a tab of its own, `For you to do`, placed after the group tabs and "Other" and before "Parked", and is not in its group's tab. A task counts in the status line like any open decision. Answering `1` and sending tells Claude "Chosen: 1. Done". **(Claude's call on the tab's place and on reusing go-ahead)**

## Finding titles

D16 says a finding's title starts with the area it is about. This workstream adds no field and no check for it: the area can't be told from the text reliably (a colon check would refuse "Search ranking - exact matches sort low" and pass "Note: things"), so the rule stays in the tool's wording, which is workstream 4's, and 4's evals can test it. **(Claude's call)** The row's meta is empty in a narrow pane so the title gets the width.

## The 47-finding fixture

`hooks/pane/review-47.json` holds 47 findings about the made-up Pantry recipe app, in the shape of `decisions_add` input: 6 in "Needs you", 24 in "Claude's call", 11 in "Already decided", in two groups (`Search review`, `Image uploads`), with some `dependsOn`. The tests and the real session share it. `hooks/pane/seed-review.ts` adds it through `addDecision` with a Node filesystem, so each finding goes through the tool's own validation, and a scratch store gets 47 decisions without a model running 47 calls (a real run would take several minutes and many turns for no extra evidence). The real session checks that the tool takes a finding with a section in a real call (Open Questions 1).

## Tests

All beside their modules, run with `claude plugin test .`.

| Behaviour | Where |
| --- | --- |
| `decisions_add` accepts each kind, fills the fixed options, refuses options on them, refuses a bad recommendation, `isTask` rules, section rules | `tool.test.ts` |
| `decisions_update` takes `dependsOn`, `blocks` and `section`, refuses unknown ids and loops, refuses options on fixed kinds | `tool.test.ts` |
| Each kind's keys answer it: go-ahead `1` and `2`, assumption `1` and `2`, finding `1` to `4` (digit, highlight, `enter`), a question answered through `d` then `enter` | `kinds.test.tsx`, `decision.test.tsx` |
| `r` marks only unanswered, unmarked assumptions; a `wrong?` mark survives it; `Confirm` saves all; answered rows are skipped | `kinds.test.tsx` |
| Sections: counts are right, "Needs you" is never folded and shows with count 0, `enter` opens a folded section and folds the other, paging at the page boundary, answered rows leave the count | `sections.test.tsx` |
| Status line and `decisions_list` count only "Needs you" and tasks | `list.test.tsx`, `tool.test.ts` |
| Park needs a reason, moves the decision to the Parked tab with the group and reason, unparking restores the section | `decision.test.tsx`, `list.test.tsx` |
| Changing an answer reopens `ready` dependents only, clears their answer, keeps `was`, leaves `sent`, `parked`, `open` ones; same answer changes nothing; the notice and the row say why | `dependents.test.ts`, `list.test.tsx` |
| The 47-finding fixture seeds, and counts come out 6 / 24 / 11 / 6 | `sections.test.tsx` |
| The "For you to do" tab exists only when there is a task, and a task isn't in its group's tab | `list.test.tsx` |

## Real sessions

At most 3, Sonnet, tmux 150x40, scratch Pantry project. Each is closed once its question is answered.

1. Claude adds one decision of each kind, one folded finding (`section`) and one task from a prompt, to check the tool takes the real shapes. A few minutes, a handful of turns.
2. The seeded 47-finding fixture (no model turns): `enter` on "Claude's call", down to a finding, `enter`, `3`, `enter`; the count goes down. The Parked tab shows a parked finding. The batch screen with `1`, `2`, `r`, `enter`.
3. If needed: a changed answer reopening a dependent, seen in the list.

## Open Questions

1. **Seeding the 47 findings without a model.** The prompt says to seed through the tool. The script calls the tool's own `addDecision`, so the validation is the same, but no model makes the calls. The real session 1 covers a model adding a section-tagged finding. If you want the 47 added by Claude itself, say so; it costs a long session.
2. **`isTask` reuses `go-ahead`.** The alternative is a sixth kind, which the design says it isn't. The cost of reuse is that `kind: go-ahead` does two jobs, told apart by the flag.
3. **A `sent` dependent is not reopened.** Claude has already acted on it, so reopening would show a decision as open that can't be undone. The list notice names it so you can choose to raise a new decision. If you'd rather reopen it anyway, `decisions_update` would need to accept `sent`, which it refuses today.
4. **The accordion.** One folded section open at a time. Both open at once would show more but could push "Answered" and the keys out of view.
5. **`section` on `decisions_update`** (added at approval). Claude can move a finding into "Needs you" after a discussion shows it needs the person. A decision that is already answered (`ready`) is refused, because it has left its section.
6. **The person can't move a decision between sections.** They can answer it where it is, which moves it to Answered.
7. **A new file, `hooks/dependents.ts`,** is outside the prompt's file list, for the import cycle reason above. If you'd rather it live in `hooks/store.ts`, the same function goes there.
8. **The changes to earlier workstreams' files** (the table above). Approving the spec approves them.
