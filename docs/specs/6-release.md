# 6 release: spec

This document outlines how workstream 6 makes the decisions pane installable from GitHub by someone who has never seen it, and what Aaron needs to record the README's GIFs. It is a first draft for the controlling session to approve.

## What someone can do afterwards

- On a machine that has never had the mod, run the two install commands from the README and get a working pane, with no other setup.
- Read the README top to bottom and know the keys, how to move the focus key, the one setting, where decisions are kept, and what doesn't work yet.
- Aaron runs one script, gets a Pantry project ready for a GIF, and follows `docs/gif-shot-list.md` shot by shot.

## How we'd know

| Check | Bar |
| --- | --- |
| `claude plugin validate .` | passes with the marketplace file (the "no icon" warning stays; an icon isn't asked for) |
| `claude plugin test .` | passes, including the demo seed's own test |
| Cold install | in a fresh `HOME`, after `main` is pushed: both commands work, and prototype test task 1 ("Claude added decisions while you were typing. Have a look at them, then get back to typing.") works on the installed copy |
| Shot list | each shot has a setup command, what to press, what should be on screen and roughly how long, and each was tried once against the demo project |
| Review | a fresh subagent reviews the branch against the approved plan |

## What gets built

| File | What |
| --- | --- |
| `.claude-plugin/marketplace.json` | the marketplace file: name `claude-decisions`, owner Aaron Machin, one plugin `decisions` with `source: "./"`. That makes `decisions@claude-decisions` resolve. |
| `README.md` | rewritten, in the order the prompt sets (below) |
| `demo/make-pantry.sh` | makes the Pantry project in a new `mktemp -d` folder (or a folder given as the first argument) and prints its path. `--seed` also fills its decisions store for the GIFs |
| `demo/seed.ts`, `demo/seed-data.ts`, `demo/seed-data.test.ts` | the seed: a small set of Pantry decisions added through the mod's own `addDecision`, so each one is checked the way a real tool call would be, and a test that every one passes that check |
| `docs/gif-shot-list.md` | the five shots |
| `docs/decisions.md` | rows for this workstream's calls |

The Pantry code itself comes from `evals/pantry-setup.sh`, which the script runs rather than copies, so the evals and the demo stay the same app. The seed is GIF-sized (about 15 decisions across two tabs), not the testers' 78, so every shot fits on screen at 160 columns.

What the seed holds, by shot:

| Tab | Decisions | For |
| --- | --- | --- |
| Sharing links | 2 choices (one with a recommendation, ready for a question that adds an option), 5 assumptions | the live discussion, the assumptions batch, the keyboard flow |
| Pantry review | about 8 findings: some needing the person, some Claude's call, some already decided, one parked | findings triage with folded sections |

The first shot (the list filling as Claude adds decisions) starts from the project without `--seed`, so the pane is empty until Claude adds to it.

## README order and content

1. GIF placeholder (one per shot, commented out until Aaron records them).
2. What it is: two or three sentences.
3. Install: the two commands, in a code block, then what follows (`y` to add the marketplace, then a scope). Needs Claude Code at or above the version the mod was built against; the plan finds the minimum to name.
4. Keys: D3 and D4 as a table (open the pane, move in and out, choose, confirm, discuss, done, park, back, hide, tabs, send), then how to move `abovePrompt:focus` in `~/.claude/keybindings.json` with the JSON to paste, and a note that editors and terminal multiplexers can swallow `ctrl+x` chords (`h` hides the pane without one).
5. Settings: the table of what `/config` actually offers today, which is `Discussion replies` alone (see question 1).
6. How decisions are stored: `~/.claude/decisions/<repo>/`, one JSON file per decision, the folder shared by every worktree of a repository; outside a git repository the folder is keyed by the working folder.
7. Limitations, each as what happens and what to do instead:
   - A managed security plugin can skip some of the mod's hooks. On a machine with one, the rules Claude gets from the system prompt and the note after a compaction may not arrive; the tool's own description, the note at session start and the AskUserQuestion redirect still do. General terms only.
   - Pane keys and a half-typed prompt: `/decisions` with a draft in the prompt hands the draft back and leaves the pane without keys. The focus key (`ctrl+x tab` unless moved) takes you into the pane and keeps the draft. Don't stash with `ctrl+s` to get round it: the stash comes back and the next `enter` sends it.
   - Short panes: under 110 columns, and in tmux's main-screen layout, the pane is about 9 to 11 rows. A decision taller than that pushes its key hints out of view, and a number key only works for an option that is fully on screen; arrow keys and `enter` still work, or widen the terminal.
   - The highlighted row is shown in reverse video only.
   - Outside the mod: Claude Code's folder trust prompt defaults to "No, exit" in a new folder; `/help` doesn't list `/decisions` (typing `/dec` finds it); `Left` in the pane goes to Claude Code (use `b` to go back); the JSON of each tool call shows in the conversation.
   - A discussion reply from the fork can't read project files (`m` re-asks the main session); a question still waiting when the mod reloads gets its reply in chat but not in the thread.
8. Licence: MIT.

The README keeps a short "Repository" section after the licence for contributors (design, decisions, CONTRIBUTING), as today.

## Out of scope

The two questions with Aaron from workstream 5 (opening the pane with a draft, key hints in short panes) are described as they behave today, not designed around. Recording the GIFs is Aaron's. Pushing `main`, tags and GitHub releases are the controlling session's. `spikes/` stays where it is (`claude plugin test .` no longer runs its tests, so the 22:40 question from workstream 1 no longer applies).

## Real sessions (Sonnet, at most 3)

1. Demo project with `--seed`: walk the assumptions batch, findings triage and keyboard-flow shots, and ask one discussion question that should add an option (one model turn).
2. Demo project without `--seed`: the list-filling shot, one prompt.
3. Cold install in a fresh `HOME`, after `main` is pushed: the two commands, then prototype test task 1.

## Contracts

None. Nothing after this workstream builds on what it makes.

## Questions for the controlling session

1. **Settings table.** M4 names two settings, but only `Discussion replies` is built; `Open the pane` isn't in `plugin.json`, and the pane always opens when Claude adds a decision unless hidden. My call: the README lists what exists, and the gap is an open point in my report rather than something this workstream builds.
2. **Install line.** The plugin-authoring reference gives a one-line form (`/plugin install decisions --marketplace AaronMachin/claude-decisions`). The design settled on two commands. My call: the README shows the two, and the cold install tests exactly those.
3. **Signing in from a fresh `HOME`.** If the fresh `HOME` can't sign in (credentials may live in the system keychain rather than under `HOME`), I report it at the cold-install stop as the prompt says, with nothing else tried.
4. **Node for the seed.** `--seed` runs the seed with `npx -y tsx`, as the testers' seed does, so recording needs Node. Fine for Aaron; noted in the shot list.
