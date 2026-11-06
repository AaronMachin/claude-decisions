# Core loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude adds a choice decision, it shows in the pane, the person answers by number and `enter`, reviews and sends, and Claude gets one structured prompt; decisions survive `/clear` and are shared across worktrees.

**Architecture:** Decisions are JSON files under `~/.claude/decisions/<repoKey>/`, read through `$.fs` on every render and tool call. Logic (store, validation, key handling, prompt building) is plain functions taking `$`, tested with a fake `$`; `register.tsx` only wires hooks. Pane view state lives in `$.state`.

**Tech Stack:** Claude Code mod API (`claude-code`, `claude-code/testing`), TypeScript, JSX with the engine's `$.ui.resolve` elements.

**Spec:** `docs/specs/1-core-loop.md` (the type, tools, keys, mock-ups and prompt text are specified there; tasks cite it rather than repeat it). Also `docs/findings/spikes.md`, "Phase 2 spike", for the key route.

## Global Constraints

- Decisions at `~/.claude/decisions/<repoKey>/<id>.json`; `repoKey` = `<folder name>-<8 hex of SHA-256 of the git common dir>`; ids `d<n>`.
- `decisions_add` registered with `isDeferred: false`, returns a string, refuses with `{ deny: <reason> }`; description at most 4,096 characters.
- Tools are `mcp__decisions__decisions_add` and `mcp__decisions__decisions_list`; plugin name `decisions`.
- Second digit joins the first within 1000 ms; "previous digit" written to `$.state` before awaiting `$.ui.focus`.
- A Button `hotkey` is one digit or one lowercase letter; a Text takes no `key`; every Button in a list has its own `key`.
- Never import from `spikes/`. No work material, local paths or organisation names in committed files; examples use the Pantry recipe app. Run the pre-push grep from `common.md` before each push.
- UK English, no em dashes. Every task: tests first, `claude plugin test .` green, commit with the attribution line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, then `git push origin ws/core-loop` (never force). Record any new call in `docs/decisions.md` in the same commit.
- Re-read the log before each task group; type-check with `tsc -p .` once `.claude-plugin/types/` exists.

## Review Focus

- A decision file that isn't valid JSON: the list skips it and says so, instead of failing. (Task 2)
- Two sessions adding at once: ids don't collide. (Task 2)
- A digit for an option that doesn't exist (`5` with three options): ignored, no highlight, no error. (Task 5)
- `s` with nothing ready, and `c` with every row unticked: nothing is sent. (Tasks 4, 6)
- Hiding the pane mid-park: the typed reason is still there when it returns. (Task 5)
- `$.prompt.submit` rejecting: answers return to `ready`. (Task 4)

## Task groups

Task 1 first. Tasks 2, then 3 and 4 can run in parallel (both need only the store). Tasks 5 and 6 can run in parallel after 2 (5 needs the key logic only from itself). Task 7 needs all. Task 8 is last.

---

### Task 1: Scaffold the mod

**Files:**
- Create: `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.tsx`, `types/index.d.ts`, `tsconfig.json`
- Test: `hooks/register.test.tsx`

**Interfaces:**
- Produces: `export const register: Register` in `hooks/register.tsx` (empty for now); `PaneView` and the `PluginState` declaration from spec "State the pane keeps" in `types/index.d.ts`.

- [ ] **Step 1: Write the failing test** `register.test.tsx`: `test('the mod loads and registers /decisions on session.start')` with `on('command.register', () => ({ value: { command: 'decisions' } }))`, then `$.session.start`; assert the `command.register` hook saw `name: 'decisions'`.
- [ ] **Step 2: Run** `claude plugin test .`. Expected: FAIL (no module).
- [ ] **Step 3: Create the files.** `plugin.json`: name `decisions`, version `0.1.0`, description, `"types": "../types/index.d.ts"` (check the path rule with `claude plugin validate .`). `hooks.json`: `{ "modules": ["./register.tsx"] }`. `tsconfig.json`: extends `./.claude-plugin/types/tsconfig.json`. `register` registers the `decisions` command on `session.start`.
- [ ] **Step 4: Run** `claude plugin test .` and `claude plugin validate .`. Expected: PASS, no errors.
- [ ] **Step 5: Commit and push** ("Scaffold the decisions mod").

### Task 2: The store

**Files:**
- Create: `hooks/store.ts`
- Test: `hooks/store.test.ts`

**Interfaces:**
- Produces, in `store.ts` (every function takes `$` first, typed as the minimal shape it uses so tests can fake it):
  - the types `Kind, State, Section, Option, Source, Answer, ThreadEntry, Revision, Decision` exactly as in the spec's "The decision type".
  - `repoKey(commonDir: string): Promise<string>`
  - `storeDir($): Promise<string>` (home from `$.env.get('HOME')`, key from git; non-zero git exit uses `$.session.cwd()`)
  - `readAll($): Promise<{ decisions: Decision[]; unreadable: number }>` (sorted by `number`; missing folder is empty)
  - `readOne($, id: string): Promise<Decision | undefined>`
  - `write($, d: Decision): Promise<void>`
  - `create($, input: Omit<Decision, 'id' | 'number' | 'version' | 'createdAt' | 'updatedAt' | 'state' | 'thread' | 'revisions' | 'section'>): Promise<Decision>` (state `open`, section `needs-you`; allocates the id)

- [ ] **Step 1: Write failing tests** with an in-memory `$` (a `Map` behind `fs.read/write/list/exists`, a fake `process.run`):
  - `repoKey('/work/pantry/.git')` matches `/^pantry-[0-9a-f]{8}$/`; a trailing slash gives the same key; another repository differs.
  - two fake working folders whose git answers the same common dir get the same `storeDir`; a git exit code 1 falls back to the folder path.
  - `create` then `readAll` returns it; a new `$` over the same map still returns it (survives a reload).
  - `readAll` on a missing folder (list rejects) returns `{ decisions: [], unreadable: 0 }`; a file holding `{not json` counts as `unreadable: 1` and the rest still load.
  - two `create` calls racing (`Promise.all`) get `d1` and `d2`; when `exists` reports `d1` taken after listing, the next number is tried; after five tries `create` rejects with a reason.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement** as above, copying the key logic's shape (not the file) from `spikes/keys/hooks/logic.ts`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit and push** ("Store decisions as files keyed by repository").

### Task 3: The tools

**Files:**
- Create: `hooks/tool.ts`
- Test: `hooks/tool.test.ts`

**Interfaces:**
- Consumes: `create, readAll, Decision` from `store.ts`.
- Produces:
  - `export const ADD_TOOL = 'mcp__decisions__decisions_add'`, `LIST_TOOL = 'mcp__decisions__decisions_list'`
  - `export const ADD_DESCRIPTION: string`, `ADD_INPUT_SCHEMA`, `LIST_DESCRIPTION`
  - `validateAdd(input: Record<string, unknown>, existingIds: string[]): string | undefined` (the refusal text, or undefined)
  - `addDecision($, input): Promise<{ result: string } | { deny: string }>`
  - `listDecisions($): Promise<{ result: string }>`
  - `registerTools($): Promise<void>` (both `$.tool.register` calls, `isDeferred: false`)

- [ ] **Step 1: Write failing tests:** one per row of the spec's refusal table, asserting the reason text starts as the table says (including "add refuses a missing scenario"); `addDecision` returns `Added d1 to the pane. 1 open.`; add then `listDecisions` returns the decision line in the spec's format; `listDecisions` leaves out a `sent` decision and includes `ready` and `parked` ones, with the spec's wording and the `No open decisions in the pane.` empty case; `ADD_DESCRIPTION.length <= 4096`; the description mentions the one-line chat rule and `decisions_list`; through the kit, `$.tool.call({ tool: ADD_TOOL, ... })` with a bad input is denied (matcher wiring is Task 7).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Draft the description from `spikes/instructions/hooks/register.tsx`, rewritten for numbered options, `choice` only, optional group, `blocks` as words, and for calling `decisions_list` at the start of a conversation and after `/clear` or compaction. Options get `id` = position. The `dependsOn` check reads the store.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit and push** ("Add decisions_add and decisions_list").

### Task 4: Send

**Files:**
- Create: `hooks/send.ts`
- Test: `hooks/send.test.ts`

**Interfaces:**
- Consumes: `readAll, readOne, write, Decision` from `store.ts`.
- Produces:
  - `buildAnswerPrompt(decisions: Decision[]): string` (the exact text in the spec's "The answer prompt": "Answer" when one, "Answers" when several; `Chosen: <id>. <label>`, `Condition: none` or the text, `Discussion: none` or indented `who: text` lines)
  - `readyDecisions(all: Decision[]): Decision[]`
  - `sendTicked($, ids: string[]): Promise<{ sent: number; notice?: string }>` (marks `sent` with `sentAt` and writes first, calls `void $.prompt.submit({ text })`, and on rejection sets them back to `ready` and returns a notice; ids not `ready` are ignored; no ids means no submit)

- [ ] **Step 1: Write failing tests:** exact-string comparison for one answer, two answers, an answer with a condition and a two-entry thread (spec example); `sendTicked` with a fake `prompt.submit` and in-memory store: nothing submitted when the ids list is empty, only ticked ids appear in the text, an unticked ready decision stays `ready`, ticked ones become `sent`; a rejecting submit returns them to `ready` with a notice; calling it twice for the same ids submits once.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit and push** ("Send ticked answers as one structured prompt").

### Task 5: The decision view

**Files:**
- Create: `hooks/pane/decision.tsx`
- Test: `hooks/pane/decision.test.tsx`

**Interfaces:**
- Consumes: `Decision, write` from `store.ts`; `PaneView` from `types/index.d.ts`.
- Produces:
  - `highlightFor(digit: string, now: number, previous: Typed, optionCount: number, gapMs = 1000): { option: number | undefined; typed: Typed }` (undefined when the option doesn't exist; `0` is 10)
  - `pressDigit($, requestId: string, digit: string, now: number, optionCount: number, state: { typed: Typed; option: number | undefined }): Promise<number | undefined>` (state set before `await $.ui.focus({ requestId, key: 'opt:<n>' })`; nothing called for a missing option)
  - `chooseOption($, d: Decision, option: number): Promise<void>` (answer set, state `ready`, written; refused for `sent`)
  - `parkDecision($, d: Decision, reason: string): Promise<boolean>` (false and no write for a blank reason); `unparkDecision($, d)`
  - `DecisionView` component function `(props: { $; d: Decision; view: PaneView; width: number; ui: ElementTable }) => JSX`, drawing the spec's layout: title, scenario, option Buttons `opt:<id>`, digit Buttons `digit:<d>` for existing options only, `discuss` Button `autoFocus`, hotkey Buttons `a`, `b`, `p`, `s`, `h` under a dim rule. Chosen option marked `✓`, others dim.

- [ ] **Step 1: Write failing tests:**
  - `highlightFor`: `3` gives 3; `0` gives 10 when there are 10 options; `1` then `0` at 400 ms gives 10; at 1200 ms gives 1 then 10 via `0` alone; `1` then `1` within the gap gives 11 only with 11 options; `5` with 3 options gives undefined.
  - `pressDigit`: `1` then `0` ask for `opt:1` then `opt:10`; two calls via `Promise.all` before the first focus resolves still end on 10; a missing option calls nothing.
  - `chooseOption`: number then choose sets `answer.option` and `state` `ready`; choosing again while `ready` replaces it; choosing on `sent` throws or returns refused and writes nothing.
  - `a` handler (exported `highlightRecommendation($, d, state)`) focuses `opt:<recommendation>`, and does nothing when there's no recommendation.
  - `b` handler (exported `back(view, $)`) clears a highlight and calls `$.ui.focus` on `discuss`; with none highlighted it returns `screen: 'list'`.
  - `parkDecision` blank reason returns false; non-blank sets `parked` and `parkedReason`; `unparkDecision` returns it to `open`.
  - Mounted `DecisionView` (kit `$.ui.mount`, terminal and desktop): finds `opt:1..n`, `discuss` with `autoFocus`, digit hotkeys only for existing options, the chosen option's text contains `✓`; the `parkDraft` text is shown in the park Input after a remount.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Keep the logic functions free of JSX so the fake-`$` tests need no kit. Pressing `discuss` sets `notice: 'No discussion yet'`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit and push** ("Add the decision view and its keys").

### Task 6: The list, tabs and review screen

**Files:**
- Create: `hooks/pane/list.tsx`
- Test: `hooks/pane/list.test.tsx`

**Interfaces:**
- Consumes: `Decision` from `store.ts`; `readyDecisions, sendTicked` from `send.ts`; `PaneView`.
- Produces:
  - `tabsFor(all: Decision[]): { key: string; label: string; decisions: Decision[] }[]` (`g:<group>` in first-seen order, then `other`, then `parked` when non-empty; parked decisions only in `parked`; `superseded` and `withdrawn` left out)
  - `sectionsFor(tab): { needsYou: Decision[]; answered: Decision[] }` (open and live oldest first; ready and sent)
  - `counts(all: Decision[]): { open: number; ready: number }` and `statusText(all): string | undefined` (`Decisions: 2 open · 1 ready`, undefined when nothing open, ready or parked)
  - `ListView(props)` with tab Buttons `tab:<key>`, row Buttons `row:<id>` (first row of Needs you `autoFocus`), `t` next-tab and `s`/`h` Buttons; `nextTab(tabs, current): string`
  - `ReviewView(props)` with a row Button `tick:<id>` per ready decision (enter toggles), Confirm Button last, `key: 'confirm'`, `hotkey: 'c'`, and `b` back; `toggleTick(ticked: string[], id: string): string[]`

- [ ] **Step 1: Write failing tests:** `tabsFor` ordering, "Other" for no group, Parked tab, parked leaving its group; `statusText` for counts and the empty case; `nextTab` wraps; mounted `ListView`: first row has `autoFocus` and pressing it sets `screen: 'decision'` and `decisionId` ("enter alone opens the decision"); `b` on the list changes nothing; `s` Button absent when nothing is ready; mounted `ReviewView`: all ready rows start ticked, the Confirm Button is last with hotkey `c`, `toggleTick` unticks, pressing Confirm with nothing ticked sends nothing (fake `prompt.submit` not called), pressing it with one ticked calls `sendTicked` with that id only.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** to the 49 and 96 column mock-ups in the spec; truncate with `…` to `bodyColumns`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit and push** ("Add the list, tabs and review screen").

### Task 7: Wire it together

**Files:**
- Modify: `hooks/register.tsx`, `hooks/register.test.tsx`

**Interfaces:**
- Consumes: everything above. `register.tsx` holds `on(...)` lines and the thin glue only.

- [ ] **Step 1: Write failing tests** through the kit (with in-memory `fs` answers via `on('fs.read', ...)` and friends where the kit allows it, otherwise the glue is a plain exported function):
  - `session.start` registers the command, both tools, and sets the status line (`$.ui.status` called with the counts text).
  - a `tool.call` for `ADD_TOOL` with a valid input stores it, calls `$.ui.open` without `focus`, and refreshes the status; when `view.isHidden` it doesn't call `ui.open` but still updates the status; a bad input is denied with the reason; `LIST_TOOL` returns the list string.
  - `command.run` `decisions` calls `$.ui.open` with `focus: true` and clears `isHidden`.
  - the `ui.focus` hook sets `view.highlight` from `opt:<n>` and clears it for `discuss`.
  - the `h` handler closes the pane and sets `isHidden`.
  - the `Pane` render for `requestId: 'decisions'` shows `keys on` when `isFocused` and `keys off` when not, on each screen.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** The `Pane` render reads `readAll` and the view from `$.state`, then returns `ListView`, `DecisionView` or `ReviewView`; it writes nothing while drawing. Update `docs/decisions.md` for any call made here.
- [ ] **Step 4: Run** `claude plugin test .`, `claude plugin validate .`, `tsc -p .`. Expected: all pass.
- [ ] **Step 5: Commit and push** ("Wire the decisions pane, tools and status line").

### Task 8: Real session, review, status

**Files:**
- Modify: `docs/decisions.md` (calls made while building)
- Append: `.superpowers/phase-2/log.md` (`status` entry)

- [ ] **Step 1: Run the three real sessions** in the spec's "Real session" section (tmux, 150x40, `claude --plugin-dir <repo root> --model sonnet`, scratch project from `mktemp -d` plus one `git worktree`). Fix what they show with a test first for each fix; note what was sent, seen, how long and how many turns.
- [ ] **Step 2: Clean up** what the mod left under `~/.claude/decisions/` only through the mod's own files, and list what is left.
- [ ] **Step 3: Run** `claude plugin test .`, `claude plugin validate .`, `tsc -p .`, `superpowers:verification-before-completion`, and the pre-push grep.
- [ ] **Step 4: Dispatch one fresh subagent** to review `git diff main...ws/core-loop` against this plan (gaps only); fix gaps.
- [ ] **Step 5: Append the `status` entry** (test summary, real-session result, cost note from the sessions) and commit and push ("Record the core loop's status").
- [ ] **Step 6: Report** at the build gate, including whether it still serves the one line and the README's Outcome.
