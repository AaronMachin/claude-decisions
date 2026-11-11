# 8 inbox: plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** coming back to the pane shows what Claude said while you were away; a decision shows everything and can be answered, with a typed answer or a condition, without starting a turn; the conversation sits on the decision screen; one decision can be sent on its own; `enter` works on first switching in.

**Architecture:** a new `hooks/pane/seen.ts` keeps when each decision was last opened in its own `$.state` atom and answers "unread?". Typed answers and conditions are two store functions beside `chooseOption`. The decision screen is redrawn in `decision.tsx` with the conversation block under the options and two Inputs (answer or condition, and ask); the thread screen stays for `o`. Pane focus changes are seen in `renderPane`, which freezes the list order and puts the ring where the pane means it.

**Tech stack:** Claude Code mod API 2.1.321, `claude plugin test` (`claude-code/testing`), `npx -y -p typescript@5.6.3 tsc -p .`.

**Spec:** `docs/specs/8-inbox.md` (copy and layout), `docs/decisions.md` rows 205 to 232 (what and why).

## Global constraints

- Copy strings exactly as the spec gives them.
- Compact below 14 `bodyRows` (`COMPACT_BELOW`); compact layouts keep today's behaviour plus what the spec adds for them.
- View shape tag `view-5` becomes `view-6` in task 3, the only task that changes `PaneView`.
- Hotkeys are one letter or digit. No inverse key caps (226).
- Any call made while building that isn't in rows 205 to 232 gets a new row in `docs/decisions.md`, marked **(Claude's call)**, in the commit that builds it.
- Before every commit: stage, run `.superpowers/phase-2/leak-check.sh`, it prints nothing. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on `ws/pane-inbox`; never touch `main`.
- After each task: `claude plugin test .` passes, `claude plugin validate .` has no errors, `npx -y -p typescript@5.6.3 tsc -p .` is clean.
- UK English, no em dashes, no absolute local paths in committed files.

## Review focus

1. A reply arriving while the pane has the keys and the list is frozen: the row gets its `●` but doesn't move until the keys leave. Task 4 test.
2. The answer box open when the pane is hidden and shown again: the draft is still there and the box reopens on the same option. Task 6 test.
3. Something else on a decision with 12 options (it becomes 13: `1` then `3`) and on a compact 9-row pane, where it may be on the next page: the key line names it. Task 6 test.
4. A condition added to an option that was already chosen, and a typed answer replacing a chosen option: one answer, the old one gone, dependents reopened once. Task 2 test.
5. A decision opened for the first time that already has Claude's replies (asked from a fork before the pane was opened): they count as unread. Task 3 test.

---

## Task 1: spike, can `prompt.submit` drop a prompt

**Files:** Create `spikes/prompt-drop/` (copy `spikes/ask/`'s shape); modify `docs/findings/spikes.md`.

- [ ] **Step 1:** A `prompt.submit` hook that returns `{ drop: true }` when the text matches `/^d\d+ \d+$/` and calls `next(e)` otherwise.
- [ ] **Step 2:** Run `claude --model sonnet --plugin-dir spikes/prompt-drop` in a scratch folder inside tmux. Type `d1 2`, then `hello`. Record: does Claude see `d1 2`, does the prompt clear, does anything print, does `hello` still reach Claude.
- [ ] **Step 3:** Add the result under a new heading in `docs/findings/spikes.md`. Rename the spike's test file to `*.spike-test.ts` as the others are. Commit.

## Task 2: typed answers and conditions in the store and the prompt

**Files:** Modify `hooks/pane/decision.tsx` (beside `chooseOption`, 121-150), `hooks/send.ts:11-15`; tests `hooks/pane/decision.test.tsx`, `hooks/send.test.ts`.

**Interfaces:**
- Produces: `answerWithText(store: StoreCtx, d: Decision, text: string): Promise<{ decision: Decision; notice?: string } | undefined>` and `answerWithCondition(store: StoreCtx, d: Decision, option: number, condition: string): Promise<{ decision: Decision; notice?: string } | undefined>`. Both trim, refuse empty text, refuse a sent decision, set `state: 'ready'` and `answer.answeredAt`, and reopen dependents the way `chooseAndReopen` does (reuse its reopen path, don't copy it).
- Produces: `somethingElseNumber(d: Decision): number` (last option id + 1).

- [ ] **Step 1: Failing tests.** `answerWithText saves { text } and makes the decision ready`; `answerWithCondition saves { option, condition }`; `a typed answer replaces a chosen option, no option left` (`answer.option` undefined); `a condition on an already chosen option keeps the option`; `either reopens a dependent once`; `empty or spaces only is refused`; `a sent decision is refused`. In `send.test.ts`: a `{ text: 'yes, after CI is green' }` answer gives `Chosen: Something else: yes, after CI is green`; `{ option: 1, condition: 'as PR comments' }` gives `Chosen: 1. <label>` and `Condition: as PR comments`; `somethingElseNumber` of a 12-option decision is 13.
- [ ] **Step 2:** Run `claude plugin test .`, the new tests fail.
- [ ] **Step 3:** Implement. In `send.ts`, the `Chosen:` fallback becomes `Something else: ${text}` when `answer.text` is set; `SETTLED_TEXT` answers (old `d` key) keep printing as today.
- [ ] **Step 4:** Tests pass. Commit.

## Task 3: what's been read

**Files:** Create `hooks/pane/seen.ts`, `hooks/pane/seen.test.ts`; modify `types/index.d.ts` (`PaneView`), `hooks/pane/decision.tsx:14-32` (`INITIAL_VIEW`, shape `view-6`).

**Interfaces:**
- Produces in `seen.ts`: `readSeen($: any): Promise<Record<string, string>>`; `markSeen($: any, id: string, at?: string): Promise<void>`; `unreadReplies(d: Decision, seenAt: string | undefined): ThreadEntry[]` (entries with `who` `claude`, `fork` or `quick` and `at` after `seenAt ?? d.createdAt`); `hasUnread(d, seen): boolean`; `newestUnread(all: Decision[], seen): Decision | undefined`. Kept in an atom `{ plugin: 'decisions', key: 'seen' }`, shape `seen-1`.
- Produces on `PaneView` (all optional or defaulted in `INITIAL_VIEW`): `frozenOrder?: string[]`, `answerBox?: { kind: 'text' | 'condition'; option: number }`, `answerDrafts: Record<string, string>`, `hasKeys: boolean`, `isDetailHidden: boolean`.

- [ ] **Step 1: Failing tests:** `a reply after the last open is unread`; `a reply before it is not`; `the person's own entries and ↻ lines never count`; `a decision never opened counts from createdAt` (review focus 5); `markSeen does not change the decision file` (read the file before and after, `updatedAt` equal); `newestUnread picks the latest reply across decisions`.
- [ ] **Step 2:** Run, fail. **Step 3:** Implement; replace the `isContextOpen` uses with `isDetailHidden` only in task 6, not here. **Step 4:** Pass, `tsc` clean. Commit.

## Task 4: the inbox list and the line above the prompt

**Files:** Modify `hooks/pane/list.tsx` (`tabChipText`, `secondLine`, `ListView`), `hooks/pane/sections.tsx:13` (`sectionsFor` order), `hooks/band.tsx` (`bandText`, `bandState`), `hooks/pane/render.tsx` (`renderPane`); tests `list.test.tsx`, `sections.test.tsx`, `band.test.tsx`.

**Interfaces:**
- Consumes: task 3's `readSeen`, `hasUnread`, `newestUnread`, `frozenOrder`.
- Produces: `sectionsFor(tab, seen, frozenOrder?)` puts unread rows first in Needs you, or follows `frozenOrder` when given; `bandText(waiting: number, isPlaced: boolean, key: string, unread?: { count: number; id: string }): string`.

- [ ] **Step 1: Failing tests:**
  - list: `an unread row comes first and starts ●`; `its second line is "claude · 2m ago: <reply>" on a tall pane`; `a compact pane keeps one line with the ●`; `a tab with an unread reply ends " ●"`.
  - frozen order (review focus 1): with `frozenOrder` set, a new reply on the last row gives it a `●` without moving it; clearing `frozenOrder` moves it first.
  - band: `bandText(2, true, 'ctrl+q', { count: 1, id: 'd43' })` is `'● 1 new reply on d43 · 2 decisions waiting · ctrl+q to answer, your draft stays'`; with `waiting` 0 it is `'● 1 new reply on d43 · ctrl+q to read it'`; the band shows an unread reply while the view is `isHidden` (223), and still shows nothing for waiting-only while hidden.
- [ ] **Step 2:** Run, fail. **Step 3:** Implement. In `renderPane`, compare `e.props.isFocused` with `view.hasKeys`: on gaining the keys set `frozenOrder` from the current order; on losing them clear it; save `hasKeys`. **Step 4:** Pass. Commit.

## Task 5: `enter` on first switching in, and left/right (212, 224, 233)

**Files:** Modify `hooks/pane/render.tsx` (`renderPane`, `focusFirstRow`), `hooks/pane/decision.tsx` (`focusLater` use); test `hooks/register.test.tsx`.

**Interfaces:** Produces `ringTarget(view: PaneView, tabs: Tab[], d?: Decision): string | undefined`: the decision screen's `opt:<highlight>`, else the list's `view.ring` when that row is still drawn, else `firstKey(activeTab)`.

- [ ] **Step 1: Failing test** `the ring lands on a drawn row when the pane gets the keys after a tab change`: with the pane unfocused, add a decision in a new group (`openForNewDecision` switches tab), then render with `isFocused: true`; the engine fake records `ui.focus` with the new tab's first row key, and pressing `enter` opens that decision. A second test: same on the decision screen, `enter` answers the ringed option.
- [ ] **Step 2:** Run, fail. **Step 3:** On the gain-the-keys transition from task 4, `focusLater($, ringTarget(...))`. **Step 4:** Pass. Commit.
- [ ] **Step 5: Reproduce left/right (233)** in a real session in tmux: on the list and on a decision, press `←` and `→`, and log every `ui.focus` event the pane's hook gets (`element`, `origin`). Write down where the ring goes and whether the pane loses the keys.
- [ ] **Step 6:** If the engine raises `ui.focus` with no `element` (one of its own stops) for a person's move, refuse it in the `register.tsx` `ui.focus` hook (return `{}` without `next`) so the ring stays in the pane, the same way moves onto the tab strip are kept off today (`isTabKey`). If the arrows never reach the hook, record that in `docs/findings/spikes.md` and in a new decisions row, and tell Aaron before going further.
- [ ] **Step 7:** Test `a person's left or right move to an engine stop is refused`: `ui.focus` with `origin.kind 'person'` and no `element` returns without moving the ring. Pass. Commit.

## Task 6: the decision screen

**Files:** Modify `hooks/pane/decision.tsx` (`DecisionView`, `decisionHints`, `cardLines`, layout), `hooks/pane/look.tsx` if a helper is needed, `hooks/pane/thread.tsx` (drop `d` and `m`, keep `f`); tests `decision.test.tsx`, `thread.test.tsx`.

**Interfaces:**
- Consumes: task 2's `answerWithText`, `answerWithCondition`, `somethingElseNumber`; task 3's `unreadReplies`, `markSeen`, view fields; `askQuestion` from `hooks/discuss.ts:273`.
- Produces: `conversationLines(d: Decision, seenAt: string | undefined, width: number): { heading: string; reply?: { who: string; when: string; lines: string[] }; earlier?: string; empty?: string }`; `kindLabel(kind: Kind): { text: string; color: string }`; `progressDots(d: Decision, all: Decision[]): { answered: number; total: number }`.

- [ ] **Step 1: Failing tests** (tall pane, 30 rows, unless named):
  - `opening puts the ring on the recommendation` (219); on the chosen option once answered; option 1 without a recommendation. `markSeen` is called on open.
  - `every option's changes and the Why line show in full`; `m hides them except the highlighted option's`.
  - `the last option is "Something else"` with the spec's line; `enter on it opens "Your answer "`; typing and `enter` calls `answerWithText` and shows `Saved dX · Something else: … · s sends it`; empty `enter` closes the box.
  - `c on a highlighted option opens "Only if "`; `c` on Something else does nothing.
  - review focus 2: hide the pane with the box open and a draft, show it, the box and draft are back.
  - review focus 3: 12 options at 9 rows, `1` then `3` reaches Something else on its page.
  - conversation: heading with ` · 3 messages · ● 1 new`; the unread reply shown, `2 earlier messages · o: whole thread`; with no thread, the spec's empty line; while `pending` has a `waiting` question, `✻ Claude is replying…`.
  - `t` and `↓` from the last option put the ring in the ask box; `enter` there calls `askQuestion` with the draft and clears it.
  - `o` opens the thread screen, which has no `d` or `m` hint and still has `f`.
  - crumb: `CHOICE  d41 · Code review   ●○ 1 of 2 answered`; `⚑ Blocks merging the branch` when `blocks` is set; `★ recommended`; `⤷ only if after CI is green` under a chosen option with a condition; `↻ new` on an option from a discussion in the last two minutes, gone after.
- [ ] **Step 2:** Run, fail. **Step 3:** Implement. The spinner timer runs only while a pending question for this decision is `waiting` or `answering` (227) and is cleared otherwise. **Step 4:** Pass, including the existing compact tests unchanged apart from the extra row. Commit.

## Task 7: send this one, with a preview

**Files:** Modify `hooks/pane/list.tsx` (`openReview`, `ReviewView`), `hooks/pane/decision.tsx` (`s` handler); test `list.test.tsx`.

**Interfaces:** Produces `openReview(view: PaneView, readyIds: string[], only?: string): PaneView` (with `only`, ticks just that id and records it for the title); `previewLines(d: Decision): string[]` built from `send.ts`'s block so the preview can't drift from what is sent.

- [ ] **Step 1: Failing tests:** `s on an answered decision opens "Send this decision to Claude" with only it ticked`; the preview shows its `Chosen:` and `Condition:` lines; `1 other answer stays ready and isn't sent.` with one other ready; `enter` submits a prompt containing only that decision and the other stays `ready`; `b` goes back to the decision. `s` on the list is unchanged.
- [ ] **Step 2:** Run, fail. **Step 3:** Implement. **Step 4:** Pass. Commit.

## Task 8: every kind, the tool text, the batch screen

**Files:** Modify `hooks/kind-options.ts` (nothing to add if Something else is drawn rather than stored; say so in a comment), `hooks/pane/decision.tsx:678` (the question line goes), `hooks/pane/kinds.tsx` (batch), `hooks/tool.ts:47` (question kind wording); tests `kinds.test.tsx`, `tool.test.ts`.

- [ ] **Step 1: Failing tests:** a go-ahead shows `3: Something else`; a question shows only `1: Something else`; on the batch screen `3` does nothing and `enter` on a row opens it; `ADD_DESCRIPTION` contains the new question wording and stays within its first-4,096-characters rule (the existing length test).
- [ ] **Step 2:** Run, fail. **Step 3:** Implement. Something else is drawn by the pane, never written into `options` (Claude's call; add the row). **Step 4:** Pass. Commit.

## Task 9: docs and replay fixtures

**Files:** `README.md` (keys and kinds tables, 38-57), `docs/design.md` (keys, discussions, 66-78 and 145-164), `docs/gif-shot-list.md`, `tests/replay/seed-ux.ts`, `tests/replay/ux-fixture.ts`.

- [ ] **Step 1:** Seed data gains a decision with an unread reply, one answered with a condition and one with Something else; `ux-fixture.test.ts` checks they load.
- [ ] **Step 2:** Update the docs to match what was built; nothing describes `d`, the Discuss row or `m` as "ask again".
- [ ] **Step 3:** Tests pass. Commit.

## Task 10: real sessions, review, stop

- [ ] **Step 1:** `claude --plugin-dir .` in a scratch project in tmux at 150x40 and at 110x12 (compact). Go through the mockup's six tasks. Note anything that differs from the spec.
- [ ] **Step 2:** One fresh reviewer over the whole branch against the spec and rows 205 to 232. Fix what's agreed with Aaron.
- [ ] **Step 3:** Push `ws/pane-inbox` and open a PR ready for review, with what was tried in the real session. Stop.
