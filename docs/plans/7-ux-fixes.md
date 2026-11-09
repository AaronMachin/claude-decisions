# 7 ux-fixes: plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** someone with a half-typed message sees, right above the prompt, how to reach the pane without losing it; on a 9 to 11 row pane every option's number key works and the hints stay in view; and the three small findings from the first-time-user test are gone.

**Architecture:** a new `ui.render` hook on `AbovePrompt` (`hooks/band.tsx`) draws the band from the store and `$.ui.panes()`. One function, `focusKeyName()` in `hooks/focus-key.ts`, names the focus key for the band and the pane's keys-off line. The pane's view gains `ring` (the key the engine says holds the ring, from `ui.focus`) and `compactPage`; below 14 `bodyRows` the decision, batch and Send screens draw a compact layout that always fits, so nothing scrolls and every hotkey stays armed.

**Tech stack:** Claude Code mod API 2.1.321, `claude plugin test` (`claude-code/testing`), `npx -y -p typescript@5.6.3 tsc -p .`.

**Spec:** `docs/specs/7-ux-fixes.md`, approved with two changes from the controlling session: the assumptions batch screen is made compact here too (open point 2), and the focus key's name comes from one function used by the band and the keys-off line, with a possible "Focus key" setting as the last task, waiting on Aaron.

## Global constraints

- Compact when `scroll.bodyRows < 14` (row 161). Taller panes keep row 136's layout unchanged.
- Band text, placed pane: `N decisions waiting · <focus key> to answer, your draft stays` (`1 decision waiting` for one). Unplaced pane: `N decisions waiting · <focus key> then enter to open, your draft stays`. `<focus key>` is `focusKeyName()`, `ctrl+x tab` until task 9.
- Keys-off line, compact: `keys off · <focus key> to use, your draft stays`. Tall layout keeps row 149's sentence with `focusKeyName()` in place of the literal.
- Assumptions row: `Check N assumptions together (enter)`.
- View shape tag `view-3` becomes `view-4` (in task 2, the only task that changes `PaneView`).
- Rows 161 to 169 already record the calls; any new call gets a new row in the commit that builds it.
- Before every commit: stage, run `.superpowers/phase-2/leak-check.sh` from the repo root, it prints nothing. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push `ws/ux-fixes` after each commit, never force, never touch `main`.
- After each task: `claude plugin test .` passes, `claude plugin validate .` has no errors, `npx -y -p typescript@5.6.3 tsc -p .` is clean.
- UK English, no em dashes, no absolute local paths in committed files.

## Review focus

1. The ring on an element that the next draw removes (an option on another page after `o`, a row answered on the batch screen): the `›` must not stay on a key that isn't drawn. Task 2 test: `›` is drawn only on a key present in the tree; task 4 test: `o` puts the ring on Discuss.
2. A number key for an option that doesn't exist (`9` on a 4-option decision) in compact: nothing moves, page unchanged. Task 4 test.
3. Two-digit keys across pages (`1` then `1` on 12 options at 9 rows): ends on the page holding 11, not the page holding 1. Task 4 test.
4. A decision with no recommendation and no `changes` on any option in compact: the key line has no `a`, the description line is the scenario or empty, and the row count still fits. Task 4 test.
5. The band while the store can't be read (unreadable files) or nothing is open: `next(e)`, never a thrown hook (a throw prints "ui.render hook skipped" into the conversation). Task 1 test.

---

## Task 1: the band and the focus key's name

**Files:**
- Create: `hooks/focus-key.ts`, `hooks/band.tsx`, `hooks/band.test.tsx`
- Modify: `hooks/register.tsx` (wire the band), `hooks/pane/render.tsx` (`header` uses `focusKeyName()`; note pane focus changes)

**Interfaces:**
- Produces: `focusKeyName(): string` (returns `'ctrl+x tab'`); `bandText(waiting: number, isPlaced: boolean, key: string): string`; `renderBand($: any, e: any, next: (e: any) => any): Promise<any>`; `notePaneFocus($: any, isFocused: boolean): void` (asks `$.ui.invalidate('ui.render')` only when the value changed since the last call).
- Consumes: `counts(all).open` from `hooks/pane/list.tsx`, `readAll` from `hooks/store.ts`, `readView` / `setView` / `PANE_ID` from `hooks/pane/decision.tsx`, `openFocused` from `hooks/pane/render.tsx`.

- [ ] **Step 1: Write the failing tests** in `hooks/band.test.tsx`, with an engine fake like `register.test.tsx`'s plus `on('ui.panes', ...)` answering a list you set per test:
  - `bandText(3, true, 'ctrl+x tab')` is `'3 decisions waiting · ctrl+x tab to answer, your draft stays'`; `bandText(1, true, 'ctrl+x tab')` starts `'1 decision waiting'`; `bandText(2, false, 'ctrl+x tab')` is `'2 decisions waiting · ctrl+x tab then enter to open, your draft stays'`.
  - `band shows while a decision waits and the pane is open without the keys`: add one decision, panes `[{ id: PANE_ID, isPlaced: true, isShown: true, isFocused: false }]`, mount `{ component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: {...}, view: {} } }`, find Text matching `/1 decision waiting · ctrl\+x tab to answer/`; no Button in the tree.
  - `band hides once the pane has the keys`: same with `isFocused: true`, no band Text.
  - `band hides with nothing waiting`, `under a survey`, `while the pane is hidden` (view `isHidden: true`), `when the store can't be read` (fs.list throws): no band Text, no throw.
  - `band for a pane waiting undrawn holds one Button that opens the pane focused`: `isPlaced: false`; text matches `/then enter to open/`; the Button has `autoFocus`; pressing it records a `ui.open` with `focus: true`.
  - `the keys-off line names the focus key from focusKeyName`: mount the pane unfocused, Text matching `/ctrl\+x tab/` (existing header test still passes).
- [ ] **Step 2: Run** `claude plugin test .` and see the new tests fail (no `band.tsx`).
- [ ] **Step 3: Implement** `focus-key.ts`, `band.tsx` and the wiring: `on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => renderBand($, e, next))`. The band reads the store and panes inside a `try`; any failure is `next(e)`. Text cut to `bodyColumns` with `truncate`. In `renderPane`, call `notePaneFocus($, e.props.isFocused === true)` before drawing; replace the literal `ctrl+x tab` in `header` with `focusKeyName()`.
- [ ] **Step 4: Run** tests, validate, tsc: all pass.
- [ ] **Step 5: Commit** "Add the band above the prompt naming the focus key while decisions wait", push.

## Task 2: the ring, `›`, and the tab strip out of up/down

**Files:**
- Modify: `types/index.d.ts` (`PaneView` gains `ring?: string` and `compactPage: number`), `hooks/pane/decision.tsx` (`INITIAL_VIEW.compactPage = 0`, shape tag `view-4`, `focusLater` records the ring), `hooks/pane/render.tsx` (`followFocus` records the ring; `leaveToList` / `focusFirstRow` record it), `hooks/register.tsx` (`ui.focus` hook), `hooks/pane/list.tsx`, `hooks/pane/kinds.tsx`
- Test: `hooks/register.test.tsx`, `hooks/pane/list.test.tsx`

**Interfaces:**
- Produces: `focusTo($: any, key: string): Promise<boolean>` in `decision.tsx` (calls `$.ui.focus`, writes `ring: key` when the answer has no `deny`, returns whether it moved; `focusLater` and every other `$.ui.focus` call in the pane go through it); `isTabKey(element: string | undefined): boolean` (`/^tab:/`); `ringMark(key: string, ring: string | undefined, isFocused: boolean): '›' | ' '`. Every Button-drawing view gets `isFocused: boolean` in its props (from `e.props.isFocused`).
- Hook in `register.tsx`, replacing the current `ui.focus` hook:
  ```
  on('ui.focus', async ($, e, next) => {
    if (e.requestId !== PANE_ID) return next(e)
    if (e.origin.kind === 'person' && isTabKey(e.element)) return {}
    const moved = await next(e)
    if (!moved.deny) { await recordRing($, e.element); await followFocus($, e.element) }
    return moved
  })
  ```

- [ ] **Step 1: Write the failing tests:**
  - `register.test.tsx` `a person's move onto a tab keeps the ring where it was`: `$.ui.focus({ component: 'Pane', requestId: PANE_ID, plugin: 'decisions', element: 'tab:g:Config file plan', origin: { kind: 'person' } })` resolves `{}` and the next mount draws no `›` on the tab.
  - `a move onto a row draws › on it while the pane has the keys`: move onto `row:d1`, mount focused: the `row:d1` Button's text starts with `›`; mount unfocused: it starts with a space.
  - `› is drawn only on a key in the tree`: ring `opt:9`, open d1 (2 options): no Button text starts with `›`.
  - `list.test.tsx`: `ringMark('row:d1', 'row:d1', true)` is `'›'`, with `isFocused` false or another key `' '`.
- [ ] **Step 2: Run** and see them fail.
- [ ] **Step 3: Implement.** Rows, folded headings, the assumptions row, options, Discuss, batch rows and tick rows put `ringMark(...)` in their first column; `rowText`, `batchRowText` and the tick text take width minus 2 for it. Options draw `${mark}${chosen ? '✓' : ' '} ${id}  label`.
- [ ] **Step 4: Run** tests, validate, tsc: all pass (existing text assertions updated for the leading column only where they anchor at the start).
- [ ] **Step 5: Commit** "Mark the ringed row with › and keep up/down off the tab strip", push.

## Task 3: assumptions row text and the meta rule

**Files:** Modify `hooks/pane/list.tsx`; test `hooks/pane/list.test.tsx`.

**Interfaces:** Produces `rowText(d: Decision, width: number): string` with the new rule (signature unchanged).

- [ ] **Step 1: Write the failing tests:**
  - `the assumptions row says enter`: a tab with 6 assumptions draws Button `batch` with text `Check 6 assumptions together (enter)` (after the ring column).
  - `meta is dropped before the title is cut`: a ready decision titled `What a recipe card shows when shared` at width 49: `rowText` contains the whole title and not `ready`.
  - `meta stays when the title fits`: an open 2-option decision titled `Units` at width 80: contains `2 options · open`.
- [ ] **Step 2: Run**, see them fail.
- [ ] **Step 3: Implement:** meta drawn only when `id + 2 + title.length + 2 + meta.length <= width - 2`; else the row is `truncate(left, width - 2)`.
- [ ] **Step 4: Run** tests, validate, tsc.
- [ ] **Step 5: Commit** "Say enter on the assumptions row and drop the meta before cutting a title", push.

## Task 4: the compact decision screen

**Files:** Modify `hooks/pane/decision.tsx`, `hooks/pane/render.tsx` (pass `rows: e.props.scroll?.bodyRows ?? 30` and `isFocused` to `DecisionView`); test `hooks/pane/decision.test.tsx`, `hooks/register.test.tsx`.

**Interfaces:**
- Consumes: `focusTo`, `ringMark`, `compactPage` (task 2), `focusKeyName` (task 1).
- Produces: `COMPACT_BELOW = 14`; `isCompact(rows: number): boolean`; `optionsPerPage(rows: number, isFocused: boolean): number` (rows minus 5 fixed lines, minus 1 more with the keys off, at least 1); `pageFor(highlight: number | undefined, page: number, perPage: number, count: number): number` (the page holding the highlight when there is one, else `page` wrapped into range); `keyLine(d: Decision, width: number, hasMore: boolean, readyCount: number, page: number, perPage: number): string`-shaped labels for the key Buttons (words dropped to bare letters when the full line is wider than `width`); `pressDigit` gains an optional `onHighlight?: (option: number) => Promise<unknown>` run after the state is written and before `$.ui.focus`.

- [ ] **Step 1: Write the failing tests** (12 options with `changes`, recommendation 10, `rows: 9`, focused, width 90):
  - `compact draws the key line directly under the title`: the tree's order is header Text, title Text, then the digit Buttons `digit:1`..`digit:0`, then `a`, `o`, `b`, `p`, `h`, then options.
  - `compact draws 4 options on one line each, and o shows the next 4`: `opt:1`..`opt:4` present, `opt:5` absent, no description Text; press `o`: `opt:5`..`opt:8` present, `opt:1` absent, `ui.focus` asked for `discuss`; press `o` twice more: back to `opt:1`.
  - `a number key reaches option 9 by moving the page first`: press `digit:9`: `opt:9` drawn and `ui.focus` asked for `opt:9` after it; `changes 9` drawn under it.
  - `1 then 1 lands on option 11's page` (pressDigit with times 100 ms apart).
  - `a number past the last option moves nothing`: 4-option decision, `9`: page and highlight unchanged.
  - `no recommendation, no changes`: key line has no `a`; the line under the title is the scenario; the tree's line count is at most 9.
  - `keys off adds the keys-off line and one fewer option`: unfocused, `rows: 9`: 3 options, Text `keys off · ctrl+x tab to use, your draft stays`.
  - `at 30 rows the tall layout is unchanged`: the existing DecisionView tests pass with `rows: 30`.
- [ ] **Step 2: Run**, see them fail.
- [ ] **Step 3: Implement** a `CompactDecision` branch in `DecisionView` when `isCompact(rows)`, per the spec's mock-up; the header line joins the crumb (`render.tsx` passes the crumb and skips its own header for this branch). The description under the highlighted option is its `changes`, plus ` · why: <reason>` on the recommended one. Digits, `a` and `o` go through `setView` (highlight or `compactPage`) before `focusTo`.
- [ ] **Step 4: Run** tests, validate, tsc.
- [ ] **Step 5: Commit** "Draw a compact decision screen below 14 rows so every number key works", push.

## Task 5: compact Send and batch screens

**Files:** Modify `hooks/pane/list.tsx` (`ReviewView`), `hooks/pane/kinds.tsx` (`BatchView`), `hooks/pane/render.tsx` (pass `rows`); tests `hooks/pane/list.test.tsx`, `hooks/pane/kinds.test.tsx`.

**Interfaces:**
- Consumes: `isCompact`, `compactPage`, `focusTo`, `ringMark`.
- Produces: `rowsPerPage(rows: number, fixed: number): number`. Send screen compact fixed lines: header, heading, key line (`b`, `c`, and `o more` when the rows don't fit), the hint Text (4); each tick row is one line in compact (the chosen answer's second line is dropped). Batch compact fixed lines: header, heading, key line (`1 2 r b`, and `o more`), Confirm line (4). Both take one more fixed line with the keys off.

- [ ] **Step 1: Write the failing tests** (`rows: 9`):
  - `compact Send screen puts the key line under its heading`: with 6 ready, order is `Send answers`, the "Enter ticks or unticks a row, c sends." Text, then `tick:` rows; at most 5 tick rows; `o` shows the rest.
  - `compact batch screen puts 1, 2, r, b under its heading`: 8 assumptions: order is heading, `1`, `2`, `r`, `b`, then `batch:` rows, at most 5; `o` shows the next rows and moves the ring to the first unanswered one drawn.
  - `confirming the last row on a page moves to the page holding the next unanswered row` (via `batchRow` set before `focusTo`).
  - At `rows: 30` both screens keep their current order (existing tests pass).
- [ ] **Step 2: Run**, see them fail.
- [ ] **Step 3: Implement** both compact branches; the page follows `batchRow` on the batch screen the way it follows the highlight on the decision screen. Add a decisions row for the batch screen (approved by the controlling session, replaces spec open point 2) in this commit.
- [ ] **Step 4: Run** tests, validate, tsc.
- [ ] **Step 5: Commit** "Make the Send and assumptions screens compact on short panes", push.

## Task 6: README and design

**Files:** `README.md` ("Keys" and "Limitations" only), `docs/design.md` ("The pane", "Kinds of decision").

- [ ] **Step 1:** Keys: the band (what it says, when), `o` on a decision ("more options" on short panes) and on the batch and Send screens, `›`. Limitations: below about 14 rows the pane shows a compact layout without dependencies and sources; the band and keys-off line name `ctrl+x tab` even if you moved it.
- [ ] **Step 2:** design.md: one bullet each in "The pane" for the band (row 157), the compact layout (rows 158, 161), `›` and the tab strip (row 159); in "Kinds of decision", the compact option screen and `o`.
- [ ] **Step 3:** `claude plugin test .` still passes (no code change); leak check; commit "Describe the band and the compact layout in the README and design", push.

## Task 7: real sessions

Pantry scratch project from `demo/make-pantry.sh --seed` in a `mktemp -d` folder, tmux, `claude --plugin-dir <repo> --model sonnet`. At most 3 sessions, each ended once its question is answered.

- [ ] **Session 1** (90x35, `CLAUDE_CODE_NO_FLICKER=1`): `/decisions` on an empty prompt, `esc`, type a draft, check the band; `ctrl+x tab`: does the pane get the keys and is the draft intact? Then `bodyRows` (a temporary `$.ui.log` is not committed; read it from the pane's line count instead), `›` against the reverse video, Up from the first row, a mouse click on a tab (tmux `send-keys -M` is unreliable; if it can't be done, say so), and a number key on the 12-option decision. If the band takes the focus key: change both band wordings to "then enter", give the placed case the Button too, add a row, and log a `question` (decision 157's text). If a tab click stops working: tabs become Text, row added.
- [ ] **Session 2** (150x40, `CLAUDE_CODE_NO_FLICKER=0`): `bodyRows`; `9` then enter on the 12-option decision answers it; `o`; the batch screen and the Send screen keep their key lines in view. If either session's `bodyRows` is 12 or more, a new row moves the threshold.
- [ ] **Session 3:** only for what 1 or 2 changed.
- [ ] Each fix found is its own commit with a test, pushed. Record what was sent, what was seen, how long and how many turns in the status entry.

## Task 8: findings, review, stop

- [ ] Mark findings 1, 2, 3, 6, 10 and 11 in `docs/findings/ux-test.md` "Fixed (<commit>)"; commit, push.
- [ ] Fresh subagent reviews `git diff main...ws/ux-fixes` against this plan (gaps, not style); fix what matters, each with a test and commit.
- [ ] `claude plugin test .`, `claude plugin validate .`, tsc, leak check; append a `status` entry to the log; check the result against the one line and the README's Outcome; stop at the build gate.

## Task 9: "Focus key" setting (waits on Aaron)

Only if Aaron says yes. `userConfig.focusKey`, type string, title "Focus key", description "The key you bound to abovePrompt:focus, shown in the band and the pane.", default `"ctrl+x tab"`. `configure(options)` passes it to `focus-key.ts`; `focusKeyName()` returns it trimmed, or `ctrl+x tab` when empty. Test: with `focusKey: 'ctrl+q'` the band and keys-off line say `ctrl+q`. README "Settings" gains the row and drops "only setting in 0.1.0" (row 153 replaced by a new row). Commit, push.

## Shape

Task 1 and task 3 don't depend on anything and could run beside task 2. Tasks 4 and 5 need task 2's `ring`, `compactPage` and `focusTo`, and could run beside each other. Task 6 needs 1 to 5, task 7 needs 6, task 8 needs 7. Task 9 waits on Aaron and touches only `focus-key.ts`, `plugin.json`, `README.md` and a test, so it can land at any point after task 1.
