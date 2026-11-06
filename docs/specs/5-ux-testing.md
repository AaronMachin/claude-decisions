# 5 ux-testing: spec

This document outlines how workstream 5 finds out whether the decisions pane is intuitive to someone who didn't design it, at every width, and whether it cuts questions in chat. It is a first draft for the controlling session to approve.

## What we're answering

- Can a first-time user, with no briefing, do each task at each width, and where do they hesitate?
- On question-heavy sessions, how many questions still land in chat (target none)?
- Does the merged `main` pass every test and the eval suite, and do the layers earlier workstreams only proved against mocks work for real?

## State of `main` (read from the log)

| Workstream | Proved in real sessions | Only proved in tests (the "unseen" list) |
| --- | --- | --- |
| 1 core loop | add, open, answer with digit, `s` then `c`, `/clear` recovery, park, unpark, worktree sharing | two-digit options (`1` then `0`, the 1000 ms gap), more than 9 options, scrolling tabs, review untick, a failed send |
| 2 discussions | ask main (idle and busy), fork, quick, `m` to ask main after a fork, `/config` picker, earlier versions, `d` | pressing `f` on a queued question (the pane had lost the keys), a reload losing an in-flight question (as specified) |
| 3 kinds and reviews | five kinds' keys, folded sections, 47-finding fixture, park with reason, reopen on change, assumption batch | paging with `n`/`o` over more rows than fit, the Image uploads tab. Later: "Needs you" paging (eeca3a2, tests only) |
| 4 claude integration | description, session note, AskUserQuestion to the pane, `/compact` then `decisions_list`, subagent refusal | wiring of `turn.complete`, `prompt.submit`, `session.compact`, `prompt.context` through `register.tsx` (function tests only); the post-compaction note and the system-prompt section (a managed security plugin skips them on this machine, so they can't be seen here); both nudge guesses against real replies |

Real-session widths so far: only 150x40 fullscreen. The 110 to 143, under-110 and main-screen layouts have not been looked at since the Phase 1 spike, so the testers cover them for the first time.

## Part 1: first-time-user testers

Four Sonnet agents, one per width. Each has at most 2 real Claude sessions (8 in all), each session ended once its tasks are done. Cost is reported after the first agent finishes.

| Tester | Width and layout | tmux setup |
| --- | --- | --- |
| A | 144+ columns, fullscreen | 160x45, `CLAUDE_CODE_NO_FLICKER=1` |
| B | 110 to 143, fullscreen | 120x40, `CLAUDE_CODE_NO_FLICKER=1` |
| C | under 110, fullscreen | 90x35, `CLAUDE_CODE_NO_FLICKER=1` |
| D | main-screen layout | 150x40, `CLAUDE_CODE_NO_FLICKER=0` |

**Tasks** (the six from `docs/findings/prototype-test.md`, plus two):

1. "Claude added decisions while you were typing. Have a look at them, then get back to typing."
2. "Answer decision 3 with the recommended option."
3. "Ask why option 2 exists, then get back to Claude without losing what you were typing."
4. "Mark the assumptions; one of them is wrong."
5. "In the PR review, find the finding about the image upload size limit and agree with it."
6. "Send your answers to Claude."
7. "Find what you parked yesterday."
8. "Go back to a decision you answered and read its discussion."

**Session plan per tester.** Session 1 is seeded with no model turns (a seed script writes a Pantry store: three choices, six assumptions, a 47-finding review with one named "Image upload size limit", one parked decision, one answered decision with a discussion), so tasks 2, 4, 5, 7 and 8 can be tried without spending tokens on Claude adding things. Session 2 is live: the tester types a prompt that makes Claude add decisions (task 1), asks a question in a discussion and gets a real reply (task 3), then sends (task 6). The seed script is part of the work (`tests/replay/seed-ux.ts`, run with `npx -y tsx` from a scratch git repo, the same way workstream 3's seed script runs).

**Brief for every tester** (the only briefing they get; it names the tasks and how to drive tmux, nothing about keys or the pane):

- You are trying a terminal tool for the first time. You have not seen it before and no one will answer questions.
- Here is the tmux command to start it (a scratch folder, the plugin directory, Sonnet, the width).
- Do the tasks one at a time, in order. Before each action, write down in a log file what you expect to happen and what you are looking for on screen. After it, write what you saw. Note every hesitation, wrong key, thing you looked for and could not find, and anything you had to guess.
- Do not read the repository's source, `README.md`, specs or findings. Use only what is on the screen (and `/help` if you would really use it).
- After each task say pass (done without a wrong key), pass with trouble, or fail (gave up or could not tell).
- Finish with what you would change first.

Testers write into a log file in a scratch folder; I read the four logs, not their screens, and I put what matters in `docs/findings/ux-test.md`. If I can't dispatch the testers I write these briefs into the plan as-is and the controlling session dispatches them.

## Part 2: replay harness (`tests/replay/`)

Aaron's real transcripts never enter the repository and I never see them. I build a harness against made-up Pantry sessions, and the controlling session runs it privately on Aaron's sessions and logs only counts.

**Input.** One file per session: a JSON array of the person's prompts in order (`["Plan how we add recipe sharing", "yes, go with the second"]`), plus an optional `name`. The made-up set is five sessions that normally lead to question lists in chat: a plan, a review, a "what next", a vague feature request, and a refactor with several forks.

**Run.** For each session the harness makes a scratch git project (the evals' Pantry setup script), starts a Claude session with the mod loaded, sends the prompts one at a time, and waits for each turn to end. Answers to decisions the mod puts in the pane are not sent (the question being tested is only "did Claude ask in chat"). 

**Count.** From each turn's assistant text: questions in chat = lines ending in a question mark in a numbered or bulleted list, plus sentences starting "should I", "do you want", "would you prefer", "which would you prefer", "want me to", "shall I" that end in `?`. Also reported per session: decisions added to the store, whether the nudge text was appended after the turn, and whether the nudge detector agrees with the counter (`isQuestionsInChat`). The detector and the counter are deliberately different code, so a disagreement shows up.

**Output.** One line per session: `name | turns | questions in chat | decisions added | nudged | detector agrees`, then totals. No prompt or reply text goes in the output, so it can be pasted into the log from Aaron's sessions without leaking them. A `--text` flag writes the replies to a folder under the scratch directory for when I need to debug on the made-up sessions only.

**The two nudge guesses.** The replay is how I confirm or fix (a) the offer exemption ("Want me to carry on?" doesn't nudge, "Want me to drop the migration?" does) and (b) the mid-text "should I" rule. On made-up sessions I can only confirm them against what Claude actually writes in the Pantry cases; the controlling session's private run on Aaron's sessions is the real test, so the harness also prints, per session, every sentence the detector flagged only through rule (a) or (b) as a count (not text), and a `--flagged` mode prints the sentences for Pantry runs only.

**How it drives Claude** is an open point (below): `claude -p` with the plugin directory if the pane's tools and `turn.complete` run headless, otherwise tmux.

## Part 3: integration on `main` and what mocks hid

On the branch before any fix, so it is the merged `main`:

1. `claude plugin test .` and `claude plugin validate .` from the root, and `tsc -p .`. Numbers go in the log.
2. The eval suite: 5 cases, `--eval-dir evals`, Sonnet, at most 3 runs. Numbers per case and grader, with cost.
3. The "unseen" list above, by hand in real sessions where possible. The seed store has a choice with 12 options (two-digit keys, more than 9 options), 30 findings needing the person (paging) and an Image uploads group, so the testers' first sessions pass over them. Whatever they don't reach I try in my own sessions only if the cap of 8 has room, and I say what stays unseen.
4. Wiring tests for `turn.complete`, `prompt.submit`, `session.compact` and `prompt.context` through `register.tsx`, if the test kit allows them (workstream 4 deferred them). A kit limit is recorded.

## Part 4: review findings in the pane (workstream 4's carry-over)

Aim: on "review" and "find problems" prompts, Claude adds each finding as a decision instead of a chat report. Baseline is the three-run table already in the log (find-problems 2/3 and review-last-commit 2/3 in every run, graders decision-added). Steps: change the tool description wording first (kept at or under 4,000 characters, with the existing test), measure with the eval suite, then change the input schema wording if needed. Two cases, up to 3 suite runs in all, so each attempt is one run of the two relevant cases only, which costs about $0.12. I report before and after per case. If wording doesn't move it I log a `question` and stop; I don't add a system-prompt layer (the managed security plugin skips it here).

The post-compaction note can't be seen on this machine. I say so in the findings and don't retry.

## Part 5: week notes template (`docs/week-notes-template.md`)

One short file Aaron copies per day: date; questions that still appeared in chat (count and one example); anything that annoyed; anything lost; one line on whether the pane was open or hidden when it mattered. Filled by Aaron, not me.

## Fixing what's found

- Small layout, wording and key-hint fixes in `hooks/`: I make them, each its own commit naming the finding, each with a test.
- Anything that changes a decision in `decisions.md`: a `challenge` in the log, no change.
- Otherwise, a `question` in the log.
- Every finding ends up fixed (commit hash) or logged (entry), listed in `docs/findings/ux-test.md`, ranked by how many testers hit it and whether they failed or only hesitated.

## Files

| File | State |
| --- | --- |
| `docs/specs/5-ux-testing.md` | this file |
| `docs/plans/5-ux-testing.md` | after approval |
| `docs/findings/ux-test.md` | per task and width: what each tester did, where it hesitated, verdict; then the ranked findings |
| `tests/replay/` | harness, five Pantry sessions, `seed-ux.ts`, a README line on how to run privately |
| `docs/week-notes-template.md` | template |
| `docs/decisions.md` | new rows marked (Claude's call) for what I choose, under a workstream 5 heading |

## Calls I'm making (to be recorded in `docs/decisions.md`)

- Testers write a log file rather than being watched, so a finding comes with the tester's own words.
- The seed store is shared by the four testers' first sessions, rebuilt fresh per tester so one tester's answers don't change another's screen.
- The replay's counter and the nudge detector are separate code, so a disagreement between them is a finding.
- The replay output holds counts only, so private runs can be logged.

## Contracts

None. Nothing here is built against by another workstream: workstream 6 waits only on the log entry whose first line is `Agent pass done.`

## Open questions for the controlling session

1. Does the replay drive Claude through `claude -p`, or tmux? I won't know whether the mod's tools and `turn.complete` run headless until I try. I'd propose trying `claude -p` first (one short call, counted as a session within the 8 only if it uses the mod interactively) and falling back to tmux, which is slower but is what Aaron's sessions look like. Is a headless result good enough for the private run, or must it be tmux?
2. The prompt says "at most 2 real sessions each" for testers, 8 in all. Is the replay's use of Claude (5 Pantry sessions, several turns each, about $0.05 to $0.10 per session) outside that count, as eval runs are?
3. Should the testers be told to try typing in the prompt while a pane is open (task 3 needs it), or is the task wording enough? I'd leave it to the wording, since that is what Aaron had.
4. The security plugin on this machine skips `prompt.compose` and `prompt.context`, so the system-prompt layer has never been seen working. Do you want that recorded as a risk for the colleague test (design "Testing the user experience", item 4) in the findings?
