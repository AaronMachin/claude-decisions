# 6 release: plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** someone on a machine that has never seen the mod installs it from the README with two commands and it works, and Aaron has a GIF shot list to record from.

**Architecture:** a marketplace file at `.claude-plugin/marketplace.json` makes the repository root installable as `decisions@claude-decisions`. A demo script reuses `evals/pantry-setup.sh` for the Pantry code and, with `--seed`, adds a GIF-sized set of decisions through the mod's own `addDecision` (the same route as `tests/replay/seed-ux.ts`). The README and the shot list are prose.

**Tech stack:** Claude Code mod API 2.1.318, `claude plugin test` (`claude-code/testing`), `npx -y tsx` for the seed, POSIX `sh`.

**Spec:** `docs/specs/6-release.md` (approved, with its four calls standing).

## Global constraints

- Version `0.1.0` (already in `plugin.json`, unchanged).
- Install is exactly `/plugin marketplace add AaronMachin/claude-decisions` then `/plugin install decisions@claude-decisions`. The cold install uses those two and nothing else; if they fail, that is the finding.
- The README's settings section says only `Discussion replies` exists in 0.1.0.
- No absolute local paths, company names or tickets in any committed file; the security plugin is "a managed security plugin". Leak check on staged changes before every commit, printing nothing.
- Each commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; push `ws/release` after each commit, never force.
- UK English, no em dashes.

## Review focus

1. A fresh `HOME` has no keybindings: the README and task 1 must work with `ctrl+x tab`, not `ctrl+q`. Checked in session 3.
2. `make-pantry.sh` run twice must give two separate projects with two separate stores (no decisions carried over). Checked in Task 3, step 3.
3. `make-pantry.sh` run from inside this repository must not write into it. Checked in Task 3, step 3.
4. The seed run without Node gives a clear message, not a stack trace. Task 3 checks for `npx` first.
5. The seed's review must show all three folded sections at 160 columns without paging. Test in Task 2.

---

### Task 1: marketplace file and the install decisions

**Files:**
- Create: `.claude-plugin/marketplace.json`
- Modify: `docs/decisions.md` (new heading "7 November 2026: workstream 6, release", rows from 152)

- [ ] **Step 1:** Write `marketplace.json`: `name` `claude-decisions`, `owner.name` `Aaron Machin`, one plugin `{ "name": "decisions", "source": "./", "description": <same as plugin.json> }`.
- [ ] **Step 2:** Run `claude plugin validate .`. Expected: "Validation passed", the icon warning the only warning, and the marketplace file read (named in the output).
- [ ] **Step 3:** Add rows (Claude's call unless marked): 152 the marketplace is the repository itself, source `./`; 153 the README lists only `Discussion replies`, because M4's `Open the pane` isn't built in 0.1.0 (approved by the controlling session); 154 the README shows the two install commands, not the one-line `--marketplace` form (approved).
- [ ] **Step 4:** Leak check, commit "Add the marketplace file so the mod installs from GitHub", push.

### Task 2: the demo seed

**Files:**
- Create: `demo/seed-data.ts`, `demo/seed-data.test.ts`, `demo/seed.ts`

**Interfaces:**
- Consumes: `validateAdd(input, ids)` and `addDecision(store, input)` from `hooks/tool.ts`; `store` from `hooks/pane/seed-review.ts`; `readOne`, `write` from `hooks/store.ts`.
- Produces: `export const DEMO: Record<string, any>[]` (in add order) and `export const PARKED_TITLE: string` in `demo/seed-data.ts`; `demo/seed.ts` adds `DEMO` in order, then parks the decision titled `PARKED_TITLE` with reason "waiting on the photo storage choice", and prints `Seeded <n> decisions.`

Content (made-up Pantry, plain titles, findings' titles start with their area per D16):

| Group | Kind | What |
| --- | --- | --- |
| Sharing links | choice | "Where share links live", 2 options, recommendation 1 (the discussion shot asks for a third) |
| Sharing links | choice | "What a receiver can do with a shared recipe", 3 options, recommendation 3 |
| Sharing links | assumption x5 | each with its own "if this is wrong" scenario, one plainly doubtful ("Nobody shares more than 100 recipes") |
| Pantry review | finding x8 | 4 needs-you (one is `PARKED_TITLE`), 2 `claudes-call`, 2 `already-decided` |

- [ ] **Step 1: failing tests** in `demo/seed-data.test.ts`:
  - `every demo decision passes the tool's own validation, in order` (same loop as `tests/replay/ux-fixture.test.ts`)
  - `the demo has two tabs, Sharing links and Pantry review` (set of `group` equals those two)
  - `the review has all three sections and fits one page` (needs-you, claudes-call, already-decided each present; needs-you count at most 6)
  - `the first choice has two options and a recommendation, and five assumptions have five different scenarios`
  - `the parked finding is one of the review's needs-you findings`
- [ ] **Step 2:** `claude plugin test .`: the new file fails (module not found).
- [ ] **Step 3:** Write `demo/seed-data.ts`, then `demo/seed.ts` (`// @ts-nocheck` and run only when it is the script being run, as `seed-ux.ts` does).
- [ ] **Step 4:** `claude plugin test .`: all pass (204 + 5). `tsc -p .`: clean.
- [ ] **Step 5:** Leak check, commit "Add a GIF-sized Pantry seed for the demo", push.

### Task 3: `demo/make-pantry.sh`

**Files:**
- Create: `demo/make-pantry.sh` (executable)

Usage: `demo/make-pantry.sh [--seed] [folder]`. No folder: `mktemp -d`. A given folder must be empty or missing, and the script refuses one inside this repository (`git -C <folder's parent> rev-parse --show-toplevel` equal to the repository). It runs `evals/pantry-setup.sh` inside the folder (found relative to the script, so it works from any working folder), deletes `last-commit.diff` (an eval aid, not part of the demo), and with `--seed` checks `npx` exists (else prints "--seed needs Node (npx) on PATH" and exits 1) and runs `npx -y tsx <repo>/demo/seed.ts` from the folder. Last line printed: the folder's path.

- [ ] **Step 1:** Run it with no arguments: prints a path; that folder is a git repository with 5 commits and no `last-commit.diff`.
- [ ] **Step 2:** Run with `--seed`: prints "Seeded 15 decisions." (or the count from Task 2) and a path; the store folder under `~/.claude/decisions/` for that project holds that many files.
- [ ] **Step 3:** Review focus 2 and 3: run `--seed` twice and check two different store folders; run with a folder inside the repository and see it refused with nothing written.
- [ ] **Step 4:** Leak check, commit "Add a script that makes the Pantry demo project", push. Remove the scratch stores this made under `~/.claude/decisions/` (only the folders for the scratch projects just made).

### Task 4: README

**Files:**
- Modify: `README.md` (full rewrite, order and content as the spec's "README order and content")

- [ ] **Step 1:** Find the minimum Claude Code version to name: the version the mod was built against is 2.1.318; check `claude --version` and the types for a stated minimum for function hooks. If nothing earlier can be shown, the README says "Claude Code 2.1.318 or later".
- [ ] **Step 2:** Build the keys table from the code, not memory: every `hotkey="…"` in `hooks/pane/*.tsx`, plus `/decisions`, the focus key, `esc`, digits, up/down, `enter`, and check each against D3 and D4. `d`, `r`, `f`, `m`, `n`/`o`, `t`, `h`, `s`, `c`, `b`, `p`, `a` each get one plain line saying when it applies.
- [ ] **Step 3:** Write the README. The keybindings example is the `bindings` array with `"context": "Chat"`, unbinding `ctrl+x tab` and binding the new key to `abovePrompt:focus` (a generic key, not Aaron's). Settings section: the one row, then "Only Discussion replies exists in 0.1.0." Limitations as the spec lists them, each as what happens then what to do.
- [ ] **Step 4:** Check every key and claim against the code (`grep` each hotkey; `hooks/store.ts` for the store path and the non-git fallback). `claude plugin validate .` passes.
- [ ] **Step 5:** Leak check, commit "Rewrite the README for installing and using the mod", push.

### Task 5: GIF shot list

**Files:**
- Create: `docs/gif-shot-list.md`

One table row or short section per shot: setup command (`demo/make-pantry.sh` with or without `--seed`, then `claude` in that folder at 160x45 fullscreen), what to press or type, what should be on screen at the end, and roughly how long (target under 20 seconds each). Opening lines: what to have (Node for `--seed`, a 160x45 terminal, `CLAUDE_CODE_NO_FLICKER=1`), and that the folder trust prompt needs "Yes" picked.

| Shot | Setup | Core action |
| --- | --- | --- |
| 1 The list filling | no seed | prompt "Plan sharing a recipe by link. Put anything you need me to decide in the decisions pane." |
| 2 A discussion that adds an option | seed | open "Where share links live", `enter`, ask "Could links expire on their own after a week? If that's worth weighing, add it as an option." |
| 3 The assumptions batch | seed | Sharing links tab, "Check 5 assumptions together", mark one wrong with `2`, `r` for the rest |
| 4 Findings triage | seed | `t` to Pantry review, agree with one, open a folded section |
| 5 Keyboard in and out | seed | type a draft, focus key into the pane, answer one with a number and `enter`, `esc`, draft still there |

- [ ] **Step 1:** Write the shot list.
- [ ] **Step 2:** Leak check, commit "Add the GIF shot list", push.

### Task 6: try the shots in real sessions (2 of 3)

Sonnet, tmux 160x45, `CLAUDE_CODE_NO_FLICKER=1`, `claude --plugin-dir <repo> --model sonnet`, in folders made by `demo/make-pantry.sh`.

- [ ] **Step 1:** Session 1 (seeded): shots 3, 4, 5 with keys only, then shot 2 (one model turn). Record keys sent, what was seen, minutes, turns.
- [ ] **Step 2:** Session 2 (not seeded): shot 1, one prompt.
- [ ] **Step 3:** Fix the shot list (and README if it was wrong) to what was actually seen. A shot that can't be made to work as written is reported, not hidden. Rows in `docs/decisions.md` for any call made. Leak check, commit "Correct the shot list from trying it", push. Remove the sessions' scratch stores.

### Task 7: review and first build stop

- [ ] **Step 1:** Fresh subagent reviews `git diff main...ws/release` against this plan and the spec (gaps, not style). Fix important findings in their own commits.
- [ ] **Step 2:** `claude plugin test .`, `claude plugin validate .`, `tsc -p .`; leak check on the whole branch diff prints nothing.
- [ ] **Step 3:** Log a status entry and STOP. The controlling session merges and pushes `main`.

### Task 8: cold install (after `main` is pushed; session 3)

- [ ] **Step 1:** `HOME=$(mktemp -d)` with a scratch Pantry project made by `demo/make-pantry.sh` (no seed) under that `HOME`, tmux 160x45, `claude --model sonnet`. If it can't sign in: stop, log it, report.
- [ ] **Step 2:** Type exactly `/plugin marketplace add AaronMachin/claude-decisions`, then `/plugin install decisions@claude-decisions`, answering the prompts as the README says. Record each screen.
- [ ] **Step 3:** Prototype test task 1: start typing a draft, ask Claude (in a previous prompt) for something that adds decisions, look at them with the focus key, come back with `esc`, draft kept.
- [ ] **Step 4:** Record what happened in the log and, if the README was wrong, fix it on a `fix/` branch reported to the controlling session (not on `main`). Report with the closing question: does it still serve the one line and the README's Outcome.

## Shape

Tasks 1, 2 and 5 don't depend on each other; 3 needs 2; 4 needs 1 (install) and is best after 3 (it points at the demo); 6 needs 3 and 5; 7 needs all; 8 waits for the merge. They run one after another.
