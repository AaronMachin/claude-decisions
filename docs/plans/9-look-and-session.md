# 9 look and session: plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the pane shows each decision's kind and state by shape and colour, reads Claude's text as the chat does, closes the loop after sending, and has a Session tab saying what the session is about, its nested plan and the PRs and pages it made.

**Architecture:** a small `hooks/pane/style.ts` holds the bar colours, kind labels and the inline-markdown renderer every screen uses. The session record lives in `hooks/session.ts` (store, tool, link capture, PR checks) beside the decisions in the store directory; `hooks/pane/session-tab.tsx` draws it. Receipts reuse discuss.ts's turn matching with a second matcher for answer prompts.

**Tech stack:** Claude Code mod API 2.1.322, `claude plugin test`, `npx -y -p typescript@5.6.3 tsc -p .`.

**Spec:** `docs/specs/9-look-and-session.md`; decisions 251 to 257.

## Global constraints

- Copy and colours exactly as the spec gives them; theme colour names only.
- Compact below 14 rows keeps the key line and every option number in view.
- No writes to state or view while `ui.render` draws.
- One unmatched `on(...)` per event at most (row 126): link capture goes in a matched `tool.call` hook per tool (`Artifact`, `Bash`), not a catch-all.
- The tool description stays within the existing length test.
- Leak check before every commit; commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; branch `ws/pane-look`; UK English, no em dashes.
- After each task: whole suite, `tsc`, `claude plugin validate .`.
- Version 0.3.0 in the last task.

## Review focus

1. A 9-row pane with the bar, two-line rows and a long decision: the key line and every option number stay in view. Tasks 2 and 3.
2. Markdown in a line that wraps exactly at a marker, and an unbalanced backtick: no markers left behind, nothing swallowed. Task 1.
3. A `gh pr list` or `WebFetch` result full of PR links: nothing added. Task 6.
4. `/clear` mid-work: the Session tab shows the same record under the new id. Task 6.
5. An answer prompt queued behind a running turn: the receipt lands on the right decisions, not on whatever turn ends next. Task 5.

---

## Task 1: style helpers and Claude's text (252 extra 1)

**Files:** Create `hooks/pane/style.ts`, `hooks/pane/style.test.tsx`.

**Interfaces:** Produces `barColour(d: Decision): string | undefined` (spec's table; answered `success`, sent and parked dim), `kindLabel(kind: Kind): string` (`QUESTION`), `kindColour(kind: Kind): string | undefined`, `parseInline(text: string): { text: string; code?: true; bold?: true; italic?: true }[]`, `wrapInline(text: string, width: number): Segment[][]` (wraps on the visible text), `Inline(ui, segments, base?: TextProps)` returning Text spans.

- [ ] Tests first: each kind's colour; answered, sent, parked; `` `a` `` → code segment; `**b**`, `_i_`, `*i*`; an unbalanced backtick stays as typed; wrapping at a marker leaves no marker on either line (review focus 2). Run, fail. Implement. Pass. Commit.

## Task 2: the list in direction B (251, 252 extra 6)

**Files:** `hooks/pane/list.tsx`, `hooks/pane/sections.tsx` (headings), `hooks/pane/render.tsx` (header keys-off line); tests `list.test.tsx`.

**Interfaces:** Consumes Task 1. Produces `rowSecondLine(d, seen, now): { text: string; colour?: string }` (kind · asked Nm ago · answer, or the unread reply, or `↗ sent HH:MM · <answer>`), `allClear(all: Decision[]): Decision[]` (up to three latest sent).

- [ ] Tests first: a long title on a tall pane wraps onto a second line, cut with `…` only on compact (258); a row starts `▌` in its bar colour; the id is bold; the second line on a tall pane, none on compact; headings `◆ Needs you · 1`, `✓ Answered · 2`; header right reads `ctrl+q to use` and there is no keys-off sentence; with nothing waiting, `Last sent 12:04 · 2 answers` and the rows; at 49x9 the key line is in the tree (review focus 1). Fail, implement, pass, commit.

## Task 3: the decision screen in direction B (251, 252 extras 1, 2, 5)

**Files:** `hooks/pane/decision.tsx`, `hooks/pane/look.tsx` (header), tests `decision.test.tsx`.

**Interfaces:** Consumes Task 1. Produces `relations(d, all): { waitsOn: { id: string; title: string; state: string }[]; holdsUp: { id: string; title: string }[]; blocks?: string }`.

- [ ] Tests first: a 120-character title is drawn in full across lines in the header, with `keys on` on the crumb line (258); the inverse kind label in its colour; `asked 4m ago`; no "N of M answered" for a one-decision group; `waits on` and `holds up` lines from `dependsOn`, dependents and `blocks`, and no longer in the `m` lines; the ringed option has a background and no card border; Something else's number column matches the options; the ask box has a border and its placeholder isn't under the cursor; thread entries `you · 2m  text`; sources are `Link` elements with a `file://` href for paths; backticks in a scenario draw as code; 12 options at 49x9 keep every number and the key line (review focus 1). Fail, implement, pass, commit.

## Task 4: what changed (252 extra 3)

**Files:** `hooks/pane/decision.tsx` or `thread.tsx` where `↻` entries draw; test in `thread.test.tsx`.

**Interfaces:** Produces `revisionChanges(before: Revision['before'], after: Decision): { kind: 'added' | 'renamed' | 'recommendation'; text: string }[]`.

- [ ] Tests first: an added option gives `+ 3  <label>`; a moved recommendation `★ recommendation 1 → 3`; a renamed option `~ 2  <old> → <new>` with the old label struck through; a revision with no visible change draws only the `↻` line. Fail, implement, pass, commit.

## Task 5: receipts (252 extra 4)

**Files:** `hooks/discuss.ts` (turn matching), `hooks/register.tsx` (wire), `hooks/store.ts` (`ThreadEntry.who` gains `'receipt'`), list and decision drawing; tests `discuss.test.ts`, `decision.test.tsx`.

**Interfaces:** Produces `routeAnswerStart(e: { text: string; turnId: string; agentId?: string }): string[] | undefined` (the decision ids an answer prompt carried, parsed from its `Decision dX ·` lines, main session only), `recordReceipt(store, ids: string[], answer: string): Promise<void>` (first non-empty line, cut at 200 characters).

- [ ] Tests first: an answer prompt's `turn.start` claims its ids and its `turn.complete` writes a `receipt` entry on each; a queued answer prompt that starts after another turn is matched to its own turn (review focus 5); a subagent's turn is ignored; the sent row and decision show `↗ sent HH:MM` and `claude: <line>`. Fail, implement, pass, commit.

## Task 6: the session record, tool and link capture (253, 257)

**Files:** Create `hooks/session.ts`, `hooks/session.test.ts`; modify `hooks/tool.ts` (register `decisions_session`), `hooks/register.tsx` (matched `tool.call` hooks for `Artifact` and `Bash`, session-id carry-over on `session.end` clear or resume).

**Interfaces:** Produces `type SessionRecord` (the spec's JSON), `readSession($): Promise<SessionRecord | undefined>`, `writeSession($, patch: Partial<SessionRecord>): Promise<SessionRecord>`, `SESSION_TOOL = 'mcp__decisions__decisions_session'`, `captureLinks(tool: string, input: any, result: any): SessionLink[]`, `carryOver($, fromId: string, toId: string): Promise<void>`, `checkPrStates($, record, now): Promise<SessionRecord>` (runs `gh pr view <url> --json state,title` through `$.process.run` for links checked over 5 minutes ago).

- [ ] Tests first: the tool replaces only the fields given and validates `status` and nesting depth; an Artifact publish result's URL becomes one link with the artifact's title; a `gh pr create` Bash result's PR URL becomes a link; a `gh pr list` result, a WebFetch result and a repeat publish add nothing (review focus 3); a subagent's publish adds a link; `carryOver` copies the record with `continuedFrom` (review focus 4); `checkPrStates` sets `merged` and `checkedAt`, skips links checked 2 minutes ago, and keeps the old state when `gh` exits non-zero; the tool description test still passes. Fail, implement, pass, commit.

## Task 7: the Session tab and refresh (255, 256)

**Files:** Create `hooks/pane/session-tab.tsx`, `session-tab.test.tsx`; modify `hooks/pane/list.tsx` (`tabsFor` adds ` ✻ Session ` first when there is a record or a link), `render.tsx` (draw it, run `checkPrStates` from the tab's open handler, never in the draw).

**Interfaces:** Consumes Task 6. Produces `planLines(plan, width, foldDone: boolean): Line[]`, `refreshPrompt(): string` (the spec's sentence).

- [ ] Tests first: the tab is first and absent without a record; title, summary, `▶ now` with `· waits on d76, d77`; plan numbering `1`, `2.1` with `✓ ▶ ·`, notes cut at the right; `m` folds done to `✓ N done`; links are `Link`s with `✓ merged · checked 2m ago`; `updated 2m ago by Claude`; compact shows title, now and folded plan, links behind `o`; `r` submits `refreshPrompt()` once and shows `✻ asked Claude to refresh`, which clears when the record updates or the turn ends. Fail, implement, pass, commit.

## Task 8: docs, version, real session, review, PR

- [ ] README (keys, the Session tab, the tool), `docs/design.md`, `docs/gif-shot-list.md`; replay seed gains a session record. Version 0.3.0 in `plugin.json` and `marketplace.json`.
- [ ] Real session in tmux at 150x40 and 110x14: the list and a decision in each kind, a revision, sending one (receipt), the Session tab after publishing an artifact and creating a test PR on a scratch repo, `r`, `/clear`.
- [ ] One fresh reviewer over the whole branch; fix Critical and Important with a failing test first.
- [ ] Push `ws/pane-look`, open the PR ready for review, stop.
