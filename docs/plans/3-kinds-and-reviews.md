# Kinds and Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The go-ahead, assumption, finding and question kinds work with their keys; a 47-finding review shows "Needs you" open with "Claude's call" and "Already decided" folded beneath; parking with a reason works, and changing an answer reopens the decisions that depend on it.

**Architecture:** Kind rules (fixed options, validation) live in `hooks/pane/kinds.tsx` as plain functions the tool imports, next to the batch screen. Section grouping, folding and paging are plain functions in `hooks/pane/sections.tsx`, drawn by `ListView`. `reopenDependents` is pure over the store in `hooks/dependents.ts`, called from `choose` in `decision.tsx`. New pane state goes in `PaneView` and is reached only through `setView` and `readView`.

**Tech Stack:** TypeScript and JSX hooks module, `claude plugin test` (`test`/`expect` from `claude-code/testing`), `npx -y -p typescript@5 tsc -p .`, `claude plugin validate .`.

**Spec:** `docs/specs/3-kinds-and-reviews.md` (approved 7 November, with `o`/`n` paging and `section` on `decisions_update`). Earlier notes: the log entries "things the mod API refuses" and workstream 2's framing change.

## Global Constraints

- A `$` can't be put in an object, and can only be passed to a function declaration. A state reference is written only where `update`/`read` is called: use `setView($, fn)` and `readView($)` from `hooks/pane/decision.tsx`. `$.clock.after(ms, fn)` is the timer; a hook in a test module can't call `$.state`.
- Pure logic (kinds, sections, dependents) takes plain arguments and is tested without `$`. `decision.tsx` must not import `sections.tsx` or `kinds.tsx` (cycle); `dependents.ts` imports only `store.ts`.
- `claude plugin test .` from the repository root passes (108 at the start); run `npx -y -p typescript@5 tsc -p .` and `claude plugin validate .` before each task's commit.
- A tool result is a string; a refusal is `{ deny: reason }`. `ADD_DESCRIPTION` stays under 4,096 characters (3,942 now); field guidance goes in the input schema.
- Keys in use: a, b, c, d, f, h, m, n, o, p, r (batch only), s, t, digits. A hotkey Button arms only when wholly in view.
- Public repository: no local paths, company names or tickets. Before every commit stage, then run `<planning folder>/leak-check.sh` from the repo root; it must print nothing. Push after each task: `git push -u origin ws/kinds-and-reviews`. Commit messages end `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- New decisions go in `docs/decisions.md` as numbered rows (next is 108) marked **(Claude's call)**, in the commit of the code they shape.
- UK English, no em dashes. TDD: a failing test first for every behaviour.

## Review Focus

- A reopened decision whose dependent was answered, parked, sent, open: only `ready` ones change (Task 4).
- `r` leaves an answered row and a `wrong?` mark alone (Task 8).
- "Needs you" never folds, even with count 0, and a folded section's count drops when one is answered (Task 5).
- The key row stays in view in a short pane with 47 findings (Task 6).
- Each refusal in `decisions_add` and `decisions_update` has a test that names the field (Tasks 2 and 3).
- No existing test is deleted; changed ones change because behaviour changed (counts, rows).

## Task groups that could run in parallel

Tasks 2-3 (tool), 4 (dependents) and 5 (sections) are independent after Task 1. Tasks 6, 7 and 8 need 5. Task 9 needs 2 and 5. Task 10 needs everything.

---

### Task 1: Types and view state

**Files:** Modify `hooks/store.ts`, `types/index.d.ts`, `hooks/pane/decision.tsx` (INITIAL_VIEW, shape tag). Test: existing tests.

- [ ] Add `isTask?` and `reopenedBy?` to `Decision`; `batch` screen, `openSection?`, `sectionPage`, `marks`, `batchRow?` to `PaneView`; `INITIAL_VIEW` gets `sectionPage: 0, marks: {}`; shape tag `view-3`.
- [ ] Run the whole suite and `tsc`; fix the test fixtures that build a `PaneView`.
- [ ] Commit "Add kind, section and batch fields to the types".

### Task 2: The kinds in `decisions_add`

**Files:** Create `hooks/pane/kinds.tsx` (`FIXED_OPTIONS`, `optionsFor(kind, isTask)`, `kindLabel`); modify `hooks/tool.ts`; tests in `hooks/tool.test.ts` and `hooks/pane/kinds.test.tsx`.

- [ ] Failing tests: each kind is accepted and stored with the fixed options and `changes` lines; options on a fixed kind are refused naming `options`; `isTask` needs `go-ahead`, refuses options, a recommendation and a section other than `needs-you`; a question refuses options and a recommendation; `recommendation.option` is checked against the kind's options (finding 1 to 4, others 1 or 2); a bad `section` is refused; `section` is stored, default `needs-you`.
- [ ] Implement `validateAdd` and `addDecision` changes; schema fields with descriptions (kind enum, `section`, `isTask`); one short sentence in `ADD_DESCRIPTION`; assert its length is under 4,096 in a test.
- [ ] Commit "Take all five kinds, sections and tasks in decisions_add".

### Task 3: `decisions_update` and `decisions_list`

**Files:** Modify `hooks/tool.ts`; tests in `hooks/tool.test.ts`.

- [ ] Failing tests: `dependsOn` replaces the list and is refused for an unknown id, itself and a loop; `blocks` replaces the sentence; `section` moves a decision and is refused for `ready`, `sent`, `superseded`, `withdrawn`; each change writes a `↻` line and keeps the earlier version; "nothing to change" now counts all five fields; `addOptions` refused for fixed kinds; `recommendation` refused for a question or task.
- [ ] Failing tests for `decisions_list`: counts as waiting only `needs-you` open/live decisions; the folded ones appear as one line per section with ids; a reopened decision says so.
- [ ] Implement; update `UPDATE_INPUT_SCHEMA`; keep `UPDATE_DESCRIPTION` to a one-line addition.
- [ ] Commit "Add dependsOn, blocks and section to decisions_update".

### Task 4: Reopening dependents

**Files:** Create `hooks/dependents.ts`, `hooks/dependents.test.ts`; modify `hooks/pane/decision.tsx` (`choose`, and the notice).

- [ ] Failing tests with an in-memory `$.fs`: changing a `ready` decision's answer reopens `ready` dependents (state `open`, answer cleared, `reopenedBy { id, at, was }`); `open`, `live`, `parked` and `sent` dependents are untouched; the same option again changes nothing; one level only; returns the reopened ids and the sent ids.
- [ ] Implement `reopenDependents(store, changed, previousAnswer)`; call it from `choose` when `chooseOption` replaced a different option; set the list notice `d3 changed. Reopened d5 and d6.` plus `d7 was already sent.`
- [ ] Commit "Reopen dependents when an answer changes".

### Task 5: Sections

**Files:** Create `hooks/pane/sections.tsx`, `hooks/pane/sections.test.tsx`; modify `hooks/pane/list.tsx` (`tabsFor`, `counts`, `statusText`, `sectionsFor`).

- [ ] Failing tests: the groups (Needs you, Claude's call, Already decided, Answered) hold the right decisions and counts; Needs you shows with count 0; answering a folded one moves it to Answered and lowers the count; the "For you to do" tab appears only with a task, sits before Parked, and the task is not in its group's tab; `counts` and `statusText` count only needs-you and tasks; paging: page size from `bodyRows` (never under 4), `n` and `o` move `sectionPage`, clamped; opening one section folds the other; a tab change folds both; `firstRow` picks needs-you, then the first heading, then answered.
- [ ] Implement as plain functions, then change the list.tsx helpers to use them. Fix the existing `list.test.tsx` expectations that change.
- [ ] Commit "Group each tab into sections and count only what needs the person".

### Task 6: Draw the sections

**Files:** Modify `hooks/pane/list.tsx` (`ListView`), `hooks/pane/render.tsx` (`followFocus`, `focusFirstRow`, pass `rows`); tests in `list.test.tsx`.

- [ ] Failing tests on the element tree: folded heading Buttons (`▸ Claude's call (24)`), the open one (`▾`) with its page of rows and the `n`/`o` Buttons only when they apply; `enter` on a heading toggles; parked and reopened rows carry the dim second line (with the group in the Parked tab); the batch row `Check N assumptions together` appears with two or more open assumptions; wide meta says `blocking`.
- [ ] Implement; keep the key row (`t`, `s`, `h`) last.
- [ ] Commit "Draw folded sections, paging and the second line".

### Task 7: The decision screen for each kind

**Files:** Modify `hooks/pane/decision.tsx` (view only); tests in `hooks/pane/decision.test.tsx`.

- [ ] Failing tests: the state line names the kind (`finding, open`); a question shows `Type your answer in the discussion, then d and enter.` and no digit row or `a`; `Reopened because d3 changed. You had answered 2 Per package.` only while open or live; `Blocks:` and `Depends on:` lines with each dependency's answer or `(not answered yet)`; for each kind `1`, `2` (`3`, `4` for findings) highlight then `enter` answers; a task shows Done and Can't do it; park needs a reason and moves the decision.
- [ ] Implement.
- [ ] Commit "Show the kind, reopening, blocks and dependencies on a decision".

### Task 8: The assumptions batch screen

**Files:** Modify `hooks/pane/kinds.tsx` (`BatchView`, `markRow`, `markRest`, `confirmMarks`), `hooks/pane/render.tsx`; tests `hooks/pane/kinds.test.tsx`.

- [ ] Failing tests: `1` and `2` mark the ringed row without saving; `enter` on a marked row saves it and moves to the next unanswered row; `r` marks only rows with no answer and no mark and leaves a `wrong?` row; `Confirm N` saves all marks through `chooseOption` (so dependents reopen) and returns to the list with `Answered 6 assumptions: 5 right, 1 wrong.`; `b` clears marks first; answered rows are skipped; titles cut at 49 columns keep the mark.
- [ ] Implement with `marks` and `batchRow` in the view and `followFocus` for `batch:<id>`.
- [ ] Commit "Add the assumptions batch screen".

### Task 9: The 47-finding fixture

**Files:** Create `hooks/pane/review-47.json`, `hooks/pane/seed-review.ts`; test in `sections.test.tsx`.

- [ ] Write 47 findings about the made-up Pantry app: 6 needs-you, 24 claudes-call, 11 already-decided, plus 6 that the test answers; two groups; a few `dependsOn`; every title starts with its area.
- [ ] Failing test: seeding through `addDecision` into an in-memory store gives counts 6 / 24 / 11 / 6; every record passes `validateAdd`.
- [ ] `seed-review.ts`: a Node `fs` store context taking a target store folder and the fixture; run with `npx -y tsx`. No local paths in it.
- [ ] Commit "Add the 47-finding fixture and a script that seeds it".

### Task 10: Real sessions, review and report

- [ ] Real session 1 (Sonnet): Claude adds one of each kind, a finding with a `section`, and a task; confirm the tool takes them and the pane shows the For you to do tab.
- [ ] Real session 2 (no model turns): seed the fixture into a scratch repo's store; `enter` on Claude's call, down to a finding, `enter`, `3`, `enter`; count drops; park one and see it in Parked; the batch screen with `1`, `2`, `r`, `enter`. Record keys, what showed, minutes.
- [ ] Real session 3 only if needed: change an answer and see a dependent reopen.
- [ ] `claude plugin test .`, `claude plugin validate .`, `tsc` clean.
- [ ] Dispatch one fresh Sonnet subagent to review the diff against this plan (gaps, not style); fix what it finds with tests.
- [ ] Append the `status` entry to the log; add the last `docs/decisions.md` rows; commit and push.
- [ ] Answer in the report: does the build still serve the one line and the README's Outcome.
