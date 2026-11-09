# UX test: first-time users at four widths

This document records what four fresh Sonnet agents did when they drove the decisions pane for the first time, with no briefing beyond the task, in tmux. Each had at most two real sessions: one seeded with a Pantry store (tasks 2, 4, 5, 7, 8) and one live (tasks 1, 3, 6). They are good at missing hints and unclear keys, poor at judging feel, so this sits beside Aaron's week of real use and doesn't replace it.

Two limits on what they could see. They read the screen as plain text (`tmux capture-pane -p`), so a highlight drawn only in reverse video was invisible to most of them. And the seeded assumptions all share one reason, so "which one is wrong" was a guess, not something the pane could tell them.

| Tester | Width and layout | What the pane looked like |
| --- | --- | --- |
| A | 160x45, fullscreen | docked on the right |
| B | 120x40, fullscreen | docked on the right, about 50 columns |
| C | 90x35, fullscreen (inline below 110) | inline above the prompt, about 9 rows |
| D | 150x40, main-screen layout | inline above the prompt, about 11 rows |

## Verdicts per task and width

PASS = done with no wrong key. TROUBLE = done with wrong keys or guesses. FAIL = could not do it as asked.

| Task | A 160 | B 120 | C 90 | D main-screen |
| --- | --- | --- | --- | --- |
| 1 Look at new decisions, get back to typing | FAIL | TROUBLE | TROUBLE | TROUBLE |
| 2 Answer decision 3 with the recommended one | TROUBLE | TROUBLE | TROUBLE | TROUBLE |
| 3 Ask why option 2 exists, keep the draft | TROUBLE | FAIL | TROUBLE | TROUBLE |
| 4 Mark the assumptions, one wrong | TROUBLE | TROUBLE | TROUBLE | TROUBLE |
| 5 Agree with the image upload size finding | TROUBLE | PASS | TROUBLE | TROUBLE |
| 6 Send | TROUBLE | PASS | PASS | TROUBLE |
| 7 Find what was parked | TROUBLE | TROUBLE | TROUBLE | PASS |
| 8 Go back to an answered decision and read its discussion | TROUBLE | TROUBLE | TROUBLE | TROUBLE |

Nobody gave up on a task outright except where "FAIL" is marked, and every task was finished by someone. Task 2 and task 8 were trouble at every width.

## What each tester did and where it hesitated

**A (160 wide).** Found `/decisions` by typing `/dec` and reading the autocomplete. Task 2: pressed `a` and `3` and saw nothing change (the highlight is reverse video only), thought the pane had frozen, then found Enter confirms; about 6 dead presses. Task 4: the batch screen was clear and the result line ("Answered 6 assumptions: 5 right, 1 wrong.") was good feedback, but no assumption said why it might be wrong, so it guessed. Task 5: no tab is called "PR review", so it inferred Image uploads from the findings in it; Up from the first row lands on the tab strip, and Enter there silently switched tab. Task 7: the Parked tab showed the item but no date. Task 8: reached d78's discussion only after two Ups from the footer. Task 1 (live): the pane opened by itself with keys off while a draft was in the prompt, and nothing said how to give it keys without disturbing the text; the `ctrl+s` stash advertised by `/help` made it worse, because the stash came back after `/decisions` and the next Enter sent "also remember the" to Claude.

**B (120 wide).** Same discovery. Task 2: first Down landed on d2, and Left (hoping for "back") sent the whole conversation to Claude Code's background-sessions screen. The footer of d2 (12 options) was off the bottom, so it guessed. Task 3: asking a question needs pane keys and pane keys need an empty prompt, so it had to delete its draft; `ctrl+s` sent it to Claude by accident. Task 5 passed first time (`1`, Enter). Task 6 passed: "Nothing is sent until you confirm" told it what to do. The right-hand pane was good for glancing at titles while Claude worked, but titles were cut off ("What a r…") and long decisions pushed the header and key hints out of view.

**C (90 wide, inline).** The pane was about 9 rows. Task 2: keys 3, d, n, arrows, Enter did nothing it could see; it finished with the mouse. The option row and the key line were below the visible rows, which matches the engine's rule that a bare digit arms only Buttons fully in view. I could not reproduce "no key reaches the pane" on a short decision (see finding 6). Task 1: used `ctrl+s` to stash the draft, which worked but is a trick the pane doesn't mention. Task 6 passed (`s`, `c`).

**D (main-screen layout, about 11 rows).** Task 2: Enter always opens the first row and typed digits went to the chat prompt, so it sent four stray messages and answered d1 and d2 to reach d3. Task 6: "c sends" was clipped off the bottom of the Send screen until it pressed Down twice. Task 7 passed. Task 8: the Discuss button has no key in the footer.

## Findings, ranked

Ranked by how many testers hit it and whether it made someone fail.

| # | Finding | Hit by | Outcome |
| --- | --- | --- | --- |
| 1 | The pane's keys and a half-typed prompt don't coexist the first time: `/decisions` hands the draft back and turns keys off, `ctrl+s` is a trap, and nothing on the pane said the focus key keeps the draft | A, B, C, D (two FAILs) | Fixed (0254915, 0fa2f57, c111c07): a line above the prompt names the focus key while decisions wait (the pane's own line does on a narrow fullscreen terminal), and the Focus key setting makes it name a moved key |
| 2 | Key hints and the header scroll out of view when a decision is taller than the pane (12 options, long findings, the Send screen) | B, C, D | Fixed (a4167c8, e4528cc, c5610ef): below 14 rows every screen is compact and paged with `o`, so the keys stay in view |
| 3 | The highlighted row is reverse video only, so it can't be seen in plain text, and arrow, Up and tab-strip order surprised people (Up from the first row reaches the tab strip, Enter there switches tab) | A, B, C, D | Fixed (90c4eb2, a243818): `›` marks the ringed row, Up and Down stay off the tab strip |
| 4 | Option screens never said a number only highlights and Enter confirms | A, B, C | Fixed (6849319) |
| 5 | The Send screen didn't say what Enter and `c` do; Enter on a tick row unticks it | A, D | Fixed (1e2b8b4) |
| 6 | At under 110 columns and on the main screen the pane is 9 to 11 rows, and digit hotkeys only arm for Buttons fully in view, so on a tall decision no number key works | C, D | Fixed (a4167c8, c5610ef): option rows carry their own keys, options page when they don't fit, and other pages' numbers stay in the key line; `9` then enter answered option 9 of 12 at 90 columns |
| 7 | "ui.render hook skipped: threw decisions: $.process.run(git) aborted" lines in the conversation on most redraws | A, B | Fixed (7e3dc7a): git is run once per working folder |
| 8 | An empty discussion looked broken (two divider lines and nothing between) | A, B, C, D | Fixed (d3bba23) |
| 9 | No date on a parked decision, so "what you parked yesterday" couldn't be checked | A, B | Fixed (1964d01) |
| 10 | "Check 6 assumptions together" reads as a heading, not a row you press (B needed three tries, D took it for a heading) | B, D | Fixed (9148cc2): "Check 6 assumptions together (enter)" |
| 11 | Titles truncate hard at 49 columns ("What a r…") so rows can't be told apart | B, D | Fixed (9148cc2): the meta is dropped before the title is cut |
| 12 | The tab names are the groups, so a task that says "PR review" finds no such tab | A, B, C, D | Not a defect of the pane: the seeded group names were mine. Noted for the colleague test: name tasks after what is on screen |
| 13 | Outside the mod: the trust prompt defaults to "No, exit", `/help` doesn't list `/decisions`, `Left` in the pane falls through to Claude Code, and raw tool JSON fills the conversation | B, C, A | Not ours to change. Go in the README's limits |

Before this test the wording on option screens, the Send screen and the pane header said nothing about Enter or the focus key. The fixes are wording and a dim line, each its own commit with a test.

## Baseline on merged main

188 tests passed, `claude plugin validate .` passed with warnings, `tsc -p .` was clean. The first eval run (five cases plus the spike cases) cost $0.44 in all, about $0.30 for the five. After the fixes: 204 tests, validate and tsc as before.

## Where the questions are

The "question logged" entries are in the shared planning log (`.superpowers/phase-2/log.md`, git-ignored, so not in this repository), under 5 ux-testing, with the one about the skipped system-prompt layer.

## Does it serve the one line

Partly. Every task was finished by someone, so the pane is usable, but nobody found their way without help on tasks 1, 2 and 8, and tasks 1 and 3 can only be done today by throwing away the draft or knowing the focus key. The pane isn't yet intuitive for someone who sits down to it cold, most at the narrow and main-screen layouts, where the keys can't be seen or pressed at all on tall decisions. That is why finding 1 stays partly open and findings 2, 3 and 6 are logged for Aaron.

## Replay on the made-up Pantry sessions

The harness (`tests/replay/`) runs headless (`claude -p`, Sonnet, one run per session, two prompts each) and prints counts only. The first runs hung on a prompt where Claude reached for Edit (a headless run with no permission mode waits); the harness now runs with `--permission-mode dontAsk` and read-only tools plus git. Headless runs show the add tool, the store and the session note working, but not the nudge, so "would nudge" is what the detector says about the reply.

| Session | Turns | Questions in chat | Decisions added | Detector agrees |
| --- | --- | --- | --- | --- |
| plan-sharing | 2 | 0 | 2 | 2/2 |
| refactor-forks | 2 | 0 | 1 | 2/2 |
| review-commit | 2 | 0 | 5 | 2/2 |
| vague-feature | 2 | 0 | 4 | 2/2 |
| what-next | 2 | 1 | 1 | 2/2 |
| total | 10 | 1 | 13 | 10/10 |

This is the second full run (questions counted over all assistant text in a turn). The first full run had the same totals (1 question in chat, 13 decisions added, 10/10 agreement) spread differently: there the question was in refactor-forks and review-commit added none. One run per session means this moves from run to run.

The one question in chat ended a what-next turn ("Want me to make the fix now?", after adding one decision), so the detector flagged it by the last-sentence rule. It is an offer, but not one of the "carry on" offers the exemption covers, so flagging it is as designed. The two guesses from workstream 4 were not exercised in either run: no Pantry reply contained a "carry on" offer or a mid-text "should I", so I can neither confirm nor fix them here. The private run on real sessions is the test.

## Evals

Five cases, `--eval-dir evals`, Sonnet, one run each (the engine still picks up the Phase 1 cases under `spikes/`, which score separately and are ignored here). Graders: decision-added, no-final-question, no-question-list.

| Case | Before the description's REVIEWS paragraph (merged main) | After |
| --- | --- | --- |
| ask-me-first | 1.00 | 1.00 |
| find-problems | 0.67 (0 decisions added) | 1.00 |
| plan-sharing | 1.00 | 1.00 |
| review-last-commit | 0.67 (0 decisions added) | 1.00 |
| what-next | 1.00 | 1.00 |

Three suite runs in all (merged main; the two review cases after the change; all five after). One run per case is a small sample: workstream 4 saw what-next miss once in three, and the replay's review-commit session added no decisions in one full run and five in the other.

## Not seen

The post-compaction note and the system-prompt section can't be seen on this machine, because a managed security plugin skips `prompt.compose`, `prompt.context` and `session.compact`; I did not retry. From the unseen list: two-digit option keys (`1` then `0`), the Image uploads tab paging and `n`/`o` paging stayed unreached by the testers; the seeded store held them (a 12-option choice, 32 findings needing the person) but nobody pressed them. `session.compact` can't be tested through `register.tsx` because the test kit hands the hook an argument without a messages list (decision 146).
