# 5 ux-testing: plan

Follows the approved `docs/specs/5-ux-testing.md`. Every task ends with a leak check, a commit and a push. Tasks marked "test first" write the failing test before the code. Nothing waits on another workstream; workstream 6 waits on this one's final log entry.

## Approved answers that shape the tasks

- The replay tries `claude -p` first and falls back to tmux. The harness records which it uses and why. A headless run is fine for the private run if it shows the mod working.
- The replay sits outside the cap of 8 tester sessions: 5 Pantry sessions, one run each, Sonnet.
- Task 3's wording stays as Aaron had it.
- The skipped system-prompt layer is logged as a `question` affecting 6.

## Tasks

| # | Task | Output | Test or check |
| --- | --- | --- | --- |
| 1 | Baseline on merged `main`: `claude plugin test .`, `claude plugin validate .`, `tsc -p .`, then the eval suite (`--eval-dir evals`, Sonnet, run 1 of 3). | Numbers in a scratch note, later in the log and findings | Counts match the 188 tests in the log, or the difference is explained |
| 2 | Headless probe: one short `claude -p` call in a Pantry scratch project with the mod loaded, a prompt that should add a decision. Check the store, and whether the nudge text is appended after a turn ending in a question. | Which route the harness uses, and why, in `docs/decisions.md` | Store has the decision; nudge seen or not |
| 3 | Seed script `tests/replay/seed-ux.ts` (test first, pure function): three choices (one with 12 options), six assumptions, a 47-finding review including "Image upload size limit", 30 findings for the person, an Image uploads group, one parked decision, one answered decision with a discussion. Rebuilt fresh per tester. | Script, run with `npx -y tsx` from a scratch git repo | Test counts kinds and states in the store |
| 4 | Replay harness `tests/replay/` (test first): counter for questions in chat (separate from `isQuestionsInChat`), the per-session row (`name \| turns \| questions in chat \| decisions added \| nudged \| detector agrees`), totals, `--text` and `--flagged` modes for Pantry runs only, five made-up sessions, a short README on running it privately. | Harness, sessions, README | Counter tests: a numbered list, "should I", "want me to carry on?" (not counted), a statement (not counted); a run on one session |
| 5 | Replay run on the five Pantry sessions (route from task 2). Use it to confirm or fix the offer exemption and the mid-text rule. A detector change is test first in `hooks/integrate.test.ts`, its own commit naming the finding. | Counts and any fix | Detector tests cover the new case |
| 6 | Testers (dispatch 4 Sonnet agents, one per width, brief as in the spec). Cost reported after the first. Each: 2 sessions at most. | Four tester logs in a scratch folder | None, logs are the output |
| 7 | Findings: write `docs/findings/ux-test.md` (per task and width, then ranked findings). Each finding fixed or logged. | Findings file | Each fix has a test and its own commit naming the finding |
| 8 | Review findings in the pane: tool description wording first, measured on find-problems and review-last-commit only; then schema wording if needed. Description stays at or under 4,000 characters (existing test). Suite runs used: at most 3 including task 1. | Before and after scores | Eval numbers, cost |
| 9 | Unseen list: whatever the testers didn't reach, by hand if the cap has room; wiring tests for `turn.complete`, `prompt.submit`, `session.compact`, `prompt.context` through `register.tsx` if the kit allows. Post-compaction note stated as unseen. | Notes in findings; tests or a recorded kit limit | Tests pass |
| 10 | `docs/week-notes-template.md`. | Template | Read once |
| 11 | Close: full suite, validate, tsc on the final branch; eval suite final numbers; fresh-subagent review of the fixes against this plan (gaps, not style); log entry `Agent pass done.` plus the `question` for 6 about the skipped system-prompt layer. | Log entries | Everything passes |

## Parallel shape

Tasks 3 and 4 can run together; 8 can run beside 6; 10 beside anything. 5 needs 2 and 4, 7 needs 6, 11 needs the rest. They will run one after another.

## Eval budget

At most 3 suite runs: task 1 uses run 1; task 8 uses single-case runs of two cases for each attempt and counts as one run in total; task 11 uses run 3 for the final numbers.

## Recording

New rows in `docs/decisions.md` for each call (replay route, seed contents, any detector change, any wording change), marked (Claude's call), under a workstream 5 heading, in the same commit as the code.

## Risks

- A headless run may not fire the pane's hooks, so the replay falls back to tmux, which is slower and costs more per session.
- Testers' real sessions may not reach everything on the unseen list, which then stays unseen and is said so.
- The managed security plugin on this machine skips some layers, so the replay measures the tool description, session note, AskUserQuestion and nudge only.
