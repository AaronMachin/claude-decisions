# Workstream 4: Claude integration, plan

Spec: `docs/specs/4-claude-integration.md` (approved 7 November, with the `/compact` and 4,000-character changes). Every behaviour is test-first (red, then green). After each task: `claude plugin test .`, stage, run the leak check from the repo root, commit with the attribution line, push `ws/claude-integration`. Record any call in `docs/decisions.md` in the same commit. Run tests from the repo root; type-check with `npx -y -p typescript@5 tsc -p .`.

Mod API rules from the log that apply to every task: `$` can't go in an object or into a const arrow, only a function declaration; keep `$.state` access inside the files that already hold it (this workstream needs none); the kit shows a refusal as "hooks module did not load", so a real session is the final check.

## Tasks

### 1. The detector and the nudge (`hooks/integrate.ts`, `hooks/integrate.test.ts`)

Tests first: `isQuestionsInChat` fires on a numbered question list, "Should I push this?", a mid-text "Which would you prefer?"; does not fire on a statement, "Why did this fail? Because the key was wrong.", "Want me to carry on?"; does fire on "Want me to drop the migration?". Then `turnText(messages, answer)` (assistant text since the last non-tool-result user message) and `nudgeAfterTurn($, e)`: fires once for a main-session turn with reason `answer`, not for a subagent, not for a reply to a discussion question (the last user prompt holds "On decision <n>"), not twice for one turn. Export `NUDGE`.
Wire: `on('turn.complete')` in `register.tsx` calling `nudgeAfterTurn` after `next(e)`.

### 2. AskUserQuestion into the pane

Tests first: three questions (one with options, one free text, one multi-select) add three decisions (choice, question, question with the options in the scenario) in the group `Questions from Claude`, no recommendation, section needs-you; the answer is exactly `{ result: { questions, answers: {} }, context: ["Added to the decisions pane as 4-6. ..."] }`; one question reads "as 4"; a store failure gives the `{ deny }` that allows one chat question; the `context` names the numbers. `answerAskUserQuestion($, e)` in `integrate.ts` calls `create` from the store. Wire: `on('tool.call', { tool: 'AskUserQuestion' })`, then `openForNewDecision($)` as the add hook does.

### 3. Subagents refused

Tests first: `refuseSubagent({ agentId: 'a1' })` returns the deny with the report-to-main-session reason; no `agentId` returns undefined; `decisions_add` with an `agentId` writes nothing (through `addDecision`'s hook path in `register.test.tsx`); same for `decisions_update` and `AskUserQuestion`; `decisions_list` with an `agentId` still answers. Wire the check at the top of the add, update and AskUserQuestion hooks.

### 4. The description (`hooks/tool.ts`, `hooks/tool.test.ts`)

Tests first: `ADD_DESCRIPTION.length <= 4000`; it contains the key phrase of each rule (pane not chat, one line in chat, `decisions_list` after `/clear` or `/compact`, never `AskUserQuestion`, a finding's title starts with the area, only the main session, a recommendation always); `UPDATE_DESCRIPTION` names the subagent rule. Then trim and reword to make room (refusals paragraph, the example's second option, asides). Check the existing description tests still pass.

### 5. The answer prompt (`hooks/send.ts`, `hooks/send.test.ts`)

Test first: both the single and the plural intro say to act on the answers and not to write decision records or files about them unless asked. Add the sentence.

### 6. System prompt section, open list, session note, compaction

Tests first, each by calling the hook functions with a fake `$`:
- `prompt.compose` appends one section `decisions:rules`, scope `session`, after whatever `next(e)` returned; two calls give identical text; the text carries the same rule phrases as the description (the same phrase list the description test uses, shared from `integrate.ts`); a hook that is skipped changes nothing (the function is pure).
- `prompt.context` adds a block `decisions` with the open list and the "call decisions_list for the current one" line; "No open decisions." when empty.
- The session note: appended in `session.start` unless `$.session.messages()` already holds it; appended by `prompt.submit` when `turns() <= 1` and no message holds it; not twice.
- Compaction: a `session.compact` hook (main conversation only, not `precompute`) adds "keep the ids and titles of open decisions" to `instructions`, passes the rest on, and after a compaction (a result with `messages`) sets a flag; the next `prompt.submit` appends the note once and clears the flag; a skip sets no flag.
Wire all four in `register.tsx`; the session note goes inside the existing `session.start` hook before `next(e)`.

### 7. Evals (`evals/`)

`pantry-setup.sh` (git repository, about five commits, Pantry app, files and git state only), tested by running it in a `mktemp -d` and checking `git log --oneline | wc -l` and that the TODO and the one-line bug exist. Five case directories (`plan-sharing`, `review-last-commit`, `what-next`, `ask-me-first`, `find-problems`), each with `case.yaml` (`schema_version: "1.1"`, `name`, `plugins: ["../.."]`, `context.scaffold_script: fixture.sh`, Sonnet, `runs: 1`), a `fixture.sh` that runs the shared script, `prompt.md` and three graders (`decision-added`, `no-final-question`, `no-question-list`). The graders' patterns are checked with node on sample strings. A short `evals/README` is not written (no docs unless asked); the run command goes in the log.
Check that a case's `fixture.sh` can reach the shared script: if the engine refuses a path outside the case directory, copy the script into each case.
`claude plugin validate .` must still pass, and `claude plugin test .` must not pick up anything under `evals/`.

### 8. Eval run, up to three suite runs

Command: `claude plugin eval . --model sonnet --runs 1 --ablation none --no-publish --trust-plugin --scaffold --allow-tools 'mcp__decisions__*' --json <scratch>/run1.json`. Run 1 is the baseline. If a case fails for a fixable reason in the setup or graders (not in Claude's behaviour), fix it and run again, at most 3 in all. Log the score per case, per grader, and the cost; read `AskUserQuestion` use for `ask-me-first` from the JSON.

### 9. Real sessions (at most 3, Sonnet, tmux, scratch project)

1. A planning prompt ("plan adding share-by-link"): Claude adds decisions, writes one line, no list in chat. Also checks the note at session start.
2. A prompt that tempts `AskUserQuestion` ("ask me what you need before you start"): the questions land in the pane as decisions in the group `Questions from Claude`; answering one from the pane reaches Claude and no record file is written.
3. `/compact` with a decision open, then "what's open?": checks the note after compaction and what Claude does, plus a subagent attempt if cheap ("ask a subagent to add a decision").
Record what was sent, seen, how long and how many turns.

### 10. Review and report

A fresh Sonnet subagent reviews the diff against this plan (gaps, not style); fix important findings with tests. `claude plugin test .`, `claude plugin validate .` and `tsc` clean, run fresh. Log a status entry (tests, sessions, eval scores and cost, cleanup left under `~/.claude/decisions/`), and say whether the work still serves the one line and the README's Outcome. Then stop and report.

## Which groups could run in parallel

Tasks 1, 2, 3, 4 and 5 touch different functions and could run side by side (all but 1 and 2 also touch `register.tsx`, so wiring is last); 6 needs 1's helper phrases from 4; 7 is independent of all code tasks; 8 needs 1 to 7; 9 needs 1 to 6; 10 is last. They will run in order.

## Waits on other workstreams

Nothing: workstreams 1 to 3 are merged. Workstream 5 consumes the replay confirmations listed in the spec's Open Questions.
