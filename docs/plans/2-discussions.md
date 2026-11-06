# Discussions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A question asked about one decision is answered in that decision's thread by the main session, the fork or the quick model, `d` marks it answered, earlier versions open from their `↻` line, and `/config` picks who replies.

**Architecture:** Store-level functions in `hooks/discuss.ts` write the thread files and are tested with an in-memory `$.fs`. A turn router in the same file finds the main-session reply. Pending questions and drafts live in `PaneView` (`$.state`), reached only through `setView` and `readView` in `hooks/pane/decision.tsx`. The thread screen is `hooks/pane/thread.tsx`, drawn by `renderPane`.

**Tech Stack:** TypeScript and JSX hooks module, `claude plugin test` (Pest-style `test`/`expect` from `claude-code/testing`), `tsc -p .`, `claude plugin validate .`.

**Spec:** `docs/specs/2-discussions.md` (approved 7 November). Workstream 1's spec and build notes: `docs/specs/1-core-loop.md`, and the log entry "things the mod API refuses".

## Global Constraints

- A `$` can't be put in an object, and can only be passed to a function declaration (not a const arrow). A state reference (atom) is written only in the file that calls `update`/`read` on it: use `setView($, fn)` and `readView($)` from `hooks/pane/decision.tsx`.
- `claude plugin test .` from the repository root passes (61 tests at the start). Run `npx tsc -p .` and `claude plugin validate .` before each task's commit once they apply.
- The kit's `$` has no `$.model.fork` or `$.model.complete` (checked: `on('model.fork')` doesn't stand in), so anything calling them takes a plain fake `$` in a test.
- Keys in use: a, b, c, d, f, h, m, o, n, p, s, t, r (workstream 3), digits. Hotkey Buttons arm only when wholly in view.
- A tool result is a string; a refusal is `{ deny: reason }`. Tool descriptions: 4,096 characters at most.
- Repository is public: no local paths, company names or tickets in anything committed. Before every commit: `git add` then `git diff --cached -U0 | grep '^+' | grep -niE "totara|cc-plugin|sd-[0-9]+|keycloak|control.?plane|/Users/|/private/tmp|claude\.ai/artifact"` prints nothing. Push after each task: `git push -u origin ws/discussions`. Commit messages end `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Calls someone could make differently go in `docs/decisions.md` as new numbered rows (next is 84) marked **(Claude's call)**, in the commit of the code they shape.
- UK English, no em dashes.

## Review Focus

- A reply arriving after the person left the thread, or for a decision that is now `sent`: stored under its question, state unchanged (Task 3 test).
- Two questions queued at once, answered out of the order they were asked: each reply under its own question (Task 5 test).
- A `turn.complete` with an empty `answer` (Claude only called a tool): the thread shows the placeholder line, not an empty reply (Task 5 test).
- A question with quotes, newlines or a leading `On decision` in the person's own text: sent text and match still work (Task 5 test).
- Asking when the decision file was changed by another session since the draw: the write keeps the newer thread (Task 2 and Task 3 tests).
- A very long thread, and a narrow pane: the key row stays inside the window (Task 8 test).

---

### Task 1: Types and view state

**Files:**
- Modify: `hooks/store.ts` (ThreadEntry), `types/index.d.ts` (PaneView, PendingQuestion), `hooks/pane/decision.tsx` (INITIAL_VIEW, atom shape tag)
- Test: `hooks/store.test.ts` (one compile-level round trip), existing tests must still pass

**Interfaces:**
- Produces: `ThreadEntry.revision?: number`; `PendingQuestion`; `PaneView` with `screen` also `'thread'`, `isAsking: boolean`, `isMarking: boolean`, `drafts: Record<string, string>`, `pending: PendingQuestion[]`, `revisionIndex?: number`, `threadSkip: number`; `INITIAL_VIEW` sets `isAsking: false, isMarking: false, drafts: {}, pending: [], threadSkip: 0`; shape tag `view-2`. Exactly the block in the spec's "Types".

- [ ] **Step 1: Write the failing test** in `store.test.ts`: `a thread entry keeps its revision index through a write and read` writes a decision with `thread: [{ who: 'claude', text: '↻ x', at, revision: 0 }]` and reads it back with `revision === 0`.
- [ ] **Step 2: Run it** (`claude plugin test .`) - expect it to fail to type-check or pass trivially; if it passes, keep it as the regression and go on.
- [ ] **Step 3: Add the fields** as the spec's diff shows; update `INITIAL_VIEW` and the shape tag; fix every literal `tsc -p .` complains about.
- [ ] **Step 4: Run** `claude plugin test .` (61 + 1 pass) and `npx tsc -p .` (clean).
- [ ] **Step 5: Commit** "Add the thread and pending fields to the types".

### Task 2: A write never loses a thread entry

**Files:**
- Modify: `hooks/pane/decision.tsx` (`chooseOption`, `parkDecision`, `unparkDecision`)
- Test: `hooks/pane/decision.test.tsx`

**Interfaces:**
- Consumes: `readOne($: StoreCtx, id): Promise<Decision | undefined>`, `write` from `store.ts`.
- Produces: the same three signatures, now changing only their own fields on the freshly read decision (`state`, `answer`, `parkedReason`), falling back to the `d` given when the file is missing.

- [ ] **Step 1: Write the failing test** `a choice made after a reply landed keeps the reply`: write a decision, call `chooseOption(store, staleCopy, 1)` after appending a thread entry to the stored file; read the file and expect the thread entry present and `state === 'ready'`. Same for `parkDecision` and `unparkDecision`.
- [ ] **Step 2: Run it** - expect FAIL (thread entry missing).
- [ ] **Step 3: Implement** by reading the file first in each function and spreading over it.
- [ ] **Step 4: Run** `claude plugin test .`; all pass.
- [ ] **Step 5: Commit** "Re-read a decision before the pane changes it", with decisions.md row 81 already in the spec commit (no new row).

### Task 3: Thread writes (`hooks/discuss.ts`, store half)

**Files:**
- Create: `hooks/discuss.ts`
- Test: `hooks/discuss.test.ts`

**Interfaces:**
- Consumes: `readOne`, `write`, `StoreCtx`, `Decision`, `ThreadEntry` from `./store`.
- Produces (all take `store: StoreCtx` first, all read the file fresh):
  - `recordQuestion(store, id: string, text: string): Promise<{ asked: string } | undefined>` - appends `{ who: 'person', text, at }`, moves `open` to `live`, returns the entry's `at`; undefined if the decision is missing.
  - `recordReply(store, id: string, asked: string, who: 'claude' | 'fork' | 'quick', text: string): Promise<boolean>` - inserts the entry directly after the `person` entry whose `at === asked`; appends at the end if that entry is not found; never changes `state`. Works on any state.
  - `markAnswered(store, id: string): Promise<boolean>` - for `open`, `live` or `parked` only: `state: 'ready'`, `answer: { text: 'settled in the discussion, see below', answeredAt }`, drops `parkedReason`; false otherwise.

- [ ] **Step 1: Write the failing tests** (in-memory `$.fs` as in `store.test.ts`): question moves `open` to `live` and keeps `ready`/`sent` as they are; reply for q1 inserted under q1 when q2 was asked after it; a reply to a `sent` decision is stored and `state` stays `sent`; reply with an unknown `asked` appends; `markAnswered` result and refusal on `ready`/`sent`; the answer prompt from `buildAnswerPrompt` for a marked decision contains `Chosen: settled in the discussion, see below` and every thread line (including a `↻` one).
- [ ] **Step 2: Run** - FAIL (module missing).
- [ ] **Step 3: Implement** the three functions.
- [ ] **Step 4: Run** - pass.
- [ ] **Step 5: Commit** "Write questions, replies and done-marks to the thread".

### Task 4: Fork and quick replies

**Files:**
- Modify: `hooks/discuss.ts`
- Test: `hooks/discuss.test.ts`

**Interfaces:**
- Produces:
  - `export type ModelCtx = { model: { fork: (r: { prompt: string }) => Promise<any>; complete: (r: { model: string; prompt: string }) => Promise<any> } }`
  - `export function contextFor(d: Decision): string` - title, scenario, numbered options with `changes`, the recommendation and its reason.
  - `export async function askModel($: ModelCtx, mode: 'fork' | 'quick', d: Decision, question: string): Promise<{ ok: true; text: string } | { ok: false; reason: string }>`. Fork prompt: context, question, "Answer in at most four sentences. You can't read project files in this reply, so if the question needs code, say so and stop." Quick: `model: 'haiku'`, context and question, "Answer in at most four sentences." and no mention of files. `isAnswered: false` gives `{ ok: false, reason }`; a rejected call gives `{ ok: false, reason: message }`.

- [ ] **Step 1: Write the failing tests** with a fake `$`: fork is called with a prompt containing the title, each option and the question; quick is called with model `haiku` and no conversation text; an unanswered result maps to `ok: false` with the reason; a rejection too.
- [ ] **Step 2: Run** - FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** - pass. **Step 5: Commit** "Ask the fork or the quick model about a decision".

### Task 5: The main-session reply router

**Files:**
- Modify: `hooks/discuss.ts`
- Test: `hooks/discuss.test.ts`

**Interfaces:**
- Produces (module state in `discuss.ts`, plain objects, no `$`):
  - `export const RUN: string` - random id for this load of the module.
  - `export function sentText(d: { number: number; title: string }, question: string): string` - `On decision ${number} · ${title}: ${question}`.
  - `export type Waiter = { decisionId: string; asked: string; sent: string; turnId?: string; late?: boolean }`
  - `export function addWaiter(w: Waiter): void`, `export function markLate(asked: string): void` (the person has sent that question to the fork; its main reply, when it comes, is still stored), `export function isBusy(): boolean`.
  - `export function routeStart(e: { text: string; turnId: string; agentId?: string }): Waiter | undefined` - sets busy; for a main-loop turn whose text includes `plugin sent "On decision`, picks the waiter whose `sent` is contained in the text, else the one whose `On decision <n> ·` prefix is, else the oldest without a `turnId`; sets its `turnId`; any other turn returns undefined.
  - `export function routeComplete(e: { turnId: string; agentId?: string; answer: string }): { waiter: Waiter; text: string } | undefined` - clears busy for main-loop turns; returns the waiter whose `turnId` matches (removing it, `late` kept on it) with `answer`, or `(no text, see the line above)` when the answer is blank; subagent turns and unmatched turns return undefined.

- [ ] **Step 1: Write the failing tests**: a `markLate` waiter still returns its reply with `late: true`; an unrelated `routeStart`/`routeComplete` pair first, then the sent one, gives the reply only for the sent turn's complete (the Phase 1 bug); two waiters get their own replies in either completion order; an `agentId` turn is ignored; a question containing quotes, a newline and the words `On decision` still matches; a blank answer gives the placeholder; `isBusy` is true between start and complete.
- [ ] **Step 2: Run** - FAIL. **Step 3: Implement.** **Step 4: Run** - pass.
- [ ] **Step 5: Commit** "Find the main session's reply by its own turn".

### Task 6: `decisions_update`

**Files:**
- Modify: `hooks/tool.ts`, `hooks/register.tsx`
- Test: `hooks/tool.test.ts`, `hooks/register.test.tsx`

**Interfaces:**
- Produces: `export const UPDATE_TOOL = 'mcp__decisions__decisions_update'`; `export const UPDATE_DESCRIPTION: string` (under 4,096 characters; says what the spec's "Revising a decision" says); `export const UPDATE_INPUT_SCHEMA`; `export function validateUpdate(input: Record<string, any>, d: Decision | undefined): string | undefined` (the spec's refusal table, texts starting `decisions_update refused:`); `export async function updateDecision($: StoreCtx, input: Record<string, any>): Promise<{ result: string } | { deny: string }>`; `registerTools` also registers `decisions_update`, not deferred.
- Wiring in `register.tsx`: `on('tool.call', { tool: UPDATE_TOOL }, ...)` calls `updateDecision($, e)`, then `changed($)` on success, with a `.catch` deny like the others.

- [ ] **Step 1: Write the failing tests**: each refusal in the table; adding option 3 with `recommendation: { option: 3 }` appends `{ id: 3, fromDiscussion: true }`, pushes one revision whose `before` has the old options and no `thread`/`revisions`, appends a thread entry `{ who: 'claude', text: '↻ ...', revision: 0 }`, and returns the spec's result string; a `ready` decision keeps its answer; the description fits 4,096; the tool is registered; through the hooks, a `$.tool.call` of `decisions_update` updates the file and redraws.
- [ ] **Step 2: Run** - FAIL. **Step 3: Implement.** **Step 4: Run** - pass.
- [ ] **Step 5: Commit** "Let a reply revise a decision through decisions_update".

### Task 7: Asking, from pane state to reply

**Files:**
- Modify: `hooks/discuss.ts`, `hooks/register.tsx`
- Test: `hooks/discuss.test.ts` (functions with fakes), `hooks/discuss-pane.test.tsx` (through the real hooks, plugin `decisions`)

**Interfaces:**
- Consumes: Tasks 3 to 5; `setView`, `readView` from `./pane/decision`; `changed` from `./pane/render`.
- Produces:
  - `export type Mode = 'main' | 'fork' | 'quick'` and `export function modeOf(option: string | undefined): Mode` (`main session`/unset to main, `fork`, `quick model`).
  - `export async function askQuestion($: any, mode: Mode, decisionId: string, question: string): Promise<void>` - records the question, adds a `PendingQuestion` (status `queued` if `isBusy()` and main, `waiting` if main and idle, `answering` for fork/quick), clears the draft, then for main adds a waiter and starts `$.prompt.submit({ text })` without awaiting (a rejection marks it `failed`), for fork/quick awaits `askModel` and writes the reply or marks `failed` with the reason. Redraws through `changed($)`.
  - `export async function resendToFork($: any): Promise<void>` - takes the oldest pending entry that is `queued`, `failed` or has a different `run`, calls `markLate` for its waiter (the main reply, when it comes, is still written under the question, and a `late` waiter doesn't touch pending), and calls `askQuestion` with `fork` and the question text read from the thread entry; sets the notice `Sent to the fork. The main-session copy is still queued and will land here too.`
  - `export async function askMain($: any): Promise<void>` - for the newest question with a `fork` or `quick` reply, asks `main` with the same text (`m`).
  - `export async function onTurnStart($: any, e: any, next: (e: any) => Promise<any>)` and `onTurnComplete`, wired in `register.tsx` as one line each; the complete handler runs `next(e)` first, then `routeComplete`, then `recordReply(..., 'claude', text)`, removes the pending entry unless the waiter is `late`, and calls `changed($)`.
  - `register(on, options)` stores `modeOf(options.discussionReplies)` for `askQuestion` callers (Task 8 reads it through `currentMode()`: `export function currentMode(): Mode`).

- [ ] **Step 1: Write the failing tests**: main while idle becomes `waiting`, `onTurnStart` of the sent turn makes it `answering`, `onTurnComplete` writes the reply under the question and clears pending; main while a prior turn runs is `queued` and clears after its reply; fork and quick write replies (fake `$` with `$.model`) and a failed model call leaves `failed` with the reason; `resendToFork` asks the fork, drops the pending entry, and the late main reply is still stored under the question; `askMain` re-asks the same text; a rejected `$.prompt.submit` marks `failed`; a pending entry with another `run` is treated as resendable.
- [ ] **Step 2: Run** - FAIL. **Step 3: Implement.** **Step 4: Run** - pass.
- [ ] **Step 5: Commit** "Send a question to the chosen replier and take its reply".

### Task 8: The thread screen

**Files:**
- Create: `hooks/pane/thread.tsx`
- Modify: `hooks/pane/decision.tsx` (`Discuss` Button opens the thread, replacing the "No discussion yet" notice), `hooks/pane/render.tsx` (`renderPane` draws `thread`; `followFocus` handles `mark` and `ask`)
- Test: `hooks/pane/thread.test.tsx`

**Interfaces:**
- Consumes: Tasks 3 and 7; `PaneView`; `DecisionView`'s `onLeave`/`onChanged` style props.
- Produces: `export function ThreadView($: any, props: { ui: any; d: Decision; view: PaneView; width: number; rows: number; readyCount: number; onChanged: () => void; onLeave: () => void; onSend: () => void; onHide: () => void }): any`; `export function visibleEntries(thread: ThreadEntry[], skip: number, rowBudget: number, width: number): { shown: ThreadEntry[]; olderHidden: number; newerHidden: number }` (a plain function, tested alone); `export function noteFor(p: PendingQuestion, run: string): string` (`queued, Claude is mid-step`, `sent, waiting for Claude`, `Claude is answering`, `asking the fork`, `asking the quick model`, `no reply: <reason>`, `no reply: the pane was reloaded`). Element keys: `ask`, `mark`, `rev:<i>`, `f`, `m`, `d`, `o`, `n`, `b`, `s`, `h`. The layout is the spec's mock-ups at 49 columns. The earlier version is a read-only view of `revisions[i].before` titled `Before: <summary>`.

- [ ] **Step 1: Write the failing tests** (mounted through the plugin, plain functions for the rest): entries and `↻` Button draw in thread order with the label lines; the queued note shows for a `queued` pending entry and clears when it is removed; `f` shows only when something is resendable and `m` only under a fork or quick reply; `enter` on `ask` opens the Input and a typed draft survives a hide and reopen (`drafts` in state); `d` highlights `mark`, `enter` marks answered and the pane returns to the list, `d` is absent for `ready`/`sent`; `b` moves the ring from `mark` to `ask`, else goes back; `enter` on a `rev:` Button shows the earlier version, `b` returns; a pending entry with a different `run` shows the reload note; `visibleEntries` keeps the newest that fit for 60 entries at 12 rows and 20 columns, and the key row buttons stay in the tree; the Discuss Button opens the thread from the decision screen.
- [ ] **Step 2: Run** - FAIL. **Step 3: Implement** the view, the routing and the focus following. **Step 4: Run** - pass, `npx tsc -p .` clean.
- [ ] **Step 5: Commit** "Draw a decision's discussion as its own screen".

### Task 9: The setting

**Files:**
- Modify: `.claude-plugin/plugin.json` (the spec's `userConfig` block), `hooks/register.tsx`
- Test: `hooks/discuss.test.ts`

- [ ] **Step 1: Write the failing test** `the setting picks the mode`: with `test(name, { options: { discussionReplies: 'fork' } }, ...)`, `currentMode()` is `fork` after the plugin loads; `quick model` gives `quick`; no option gives `main`.
- [ ] **Step 2: Run** - FAIL. **Step 3: Add** the manifest block and the `register(on, options)` read (already declared in Task 7). **Step 4: Run** `claude plugin test .` and `claude plugin validate .` (no errors; if the manifest keys are refused, fix them to what validate says and record the call).
- [ ] **Step 5: Commit** "Add the Discussion replies setting".

### Task 10: Real sessions, review and report

**Files:**
- Modify: `docs/decisions.md` (calls made while building, from row 84), `.superpowers/phase-2/log.md` (status with timings)

- [ ] **Step 1: Session 1 (main session)** as in the spec's "Real sessions": queued note while Claude is busy, the reply landing without a keypress, a `decisions_update` and the `↻` line, the earlier version, `d`, `enter`, `s`, `c`. Record what was sent, seen, seconds and turns.
- [ ] **Step 2: Session 2 (fork), session 3 (quick model)** with the setting changed; if the picker can't be driven, edit the settings file under `pluginConfigs`. Record timings. Fix what the sessions show, with a test for each fix.
- [ ] **Step 3: Dispatch a fresh subagent** to review the diff against this plan (gaps, not style); fix its findings.
- [ ] **Step 4: Run** `claude plugin test .`, `claude plugin validate .`, `npx tsc -p .`; all clean.
- [ ] **Step 5: Append the `status` log entry** with timings per mode and an answer to: does this still serve the one line and the README's Outcome. Stop and report.

## Groups that could run in parallel (they won't)

Tasks 3, 4 and 5 are independent of each other (all in `discuss.ts` and its test); Task 6 is independent of 3 to 5; Task 1 and 2 come first; 7 needs 3 to 5; 8 needs 7; 9 needs 7.
