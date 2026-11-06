# Decisions

This document records every decision made about the decisions pane so far, in the order they were made, with the reason for each. `design.md` describes how the mod works; this is the history of why. Decisions are made by Aaron unless marked **(Claude's call)**, which means Claude made it while building and Aaron can overturn it.

A decision that changes later gets a new entry that names the one it replaces. Old entries are never edited.

## How to read this

| Column | Meaning |
| --- | --- |
| # | Stable id, referenced from specs, plans and commits |
| Decision | What was decided |
| Why | The reason, in a sentence |

## 6 November 2026: what it is

| # | Decision | Why |
| --- | --- | --- |
| 1 | Build it as a Claude Code mod, not an editor plugin, a file or an HTML page | It has to complement the terminal Claude runs in, not sit outside it. HTML pages had a different structure every time, felt cramped and stole window focus. |
| 2 | No separate skill; the mod carries its own instructions to Claude | A skill only loads when Claude thinks it applies, and the mod can say what Claude needs itself. |
| 3 | Every decision is a live discussion, not a question at the end of a list | In a numbered list, a question about item 1 waits behind items 2 to 14. |
| 4 | Screens look as close as possible to how a mod really renders: character cells, inverted focus row, dim key hints | The first mock-ups looked like a web page squeezed into a terminal. |
| 5 | Testing means the user experience (is it intuitive, how does it feel), not only whether it works | A mod that works but confuses people has still failed. |
| 6 | Done means a public repository with quick install steps and GIFs; Aaron records the GIFs from a shot list Claude writes | Aaron wants to share it, and recording is quicker to do by hand. |
| 7 | The focus key must be movable, and the README says how (`abovePrompt:focus` in `~/.claude/keybindings.json`) | `ctrl+x` chords never reach Claude Code inside some editors' terminals. Aaron uses `ctrl+q`. |
| 8 | Who replies in a discussion is a `/config` setting, and the main session is the default | The main session has the full context and is "the best option"; the others are there for when it's busy. |
| 9 | Main-session replies may show in the main chat, as long as the pane mirrors them into the decision's thread | Revisiting a decision days later has to show its whole discussion, whichever mode replied. |
| 10 | Every decision keeps its whole thread for good | Switching between decisions, or reopening an old one, must show everything that was said. |
| 11 | Decisions belong to the repository, shared by all its worktrees, stored outside it under `~/.claude/decisions/<repo>/` as one JSON file each **(Claude's call)** | Decisions must survive `/clear`, compaction and new sessions, be readable by any tool, and never be committed by accident. |
| 12 | Only the main session adds decisions; subagents report back to it **(Claude's call)** | One owner per decision, and "needs you" stays a judgement the main session makes. |
| 13 | Prototype and test the experience before writing mod code | Layout and keys are cheaper to change in a prototype than in a mod. |

## 6 November 2026: after the prototype test

The prototype test gave Aaron six tasks one at a time with no instructions. These came out of it.

| # | Decision | Why |
| --- | --- | --- |
| 14 | `ctrl+q` takes you out of the pane as well as into it | It's a toggle in Claude Code, and the prototype only went one way. |
| 15 | Answering a decision saves it and takes you back to the list | Staying on the decision after answering felt wrong. |
| 16 | Sending opens a review screen of ready answers, all ticked; untick any to hold them back, then confirm | You might not want to send all of them, and you might want a last look. |
| 17 | A message in a discussion only discusses; marking the decision answered is a separate step, and Claude then gets the answer with the whole discussion | Discussing and answering are different things, and answering should be the person's choice. |
| 18 | Every kind of decision answers with numbers, not its own letters | Different letters per kind felt like random keybindings. |
| 19 | An answered decision still shows all its options, with the chosen one marked | You should always see what the choice was between. |
| 20 | When a discussion changes a decision, its earlier versions stay viewable | In the chat you can scroll back; the pane shouldn't lose that. |
| 21 | The keys under an expanded item stand apart from its text | They weren't distinct enough from the description. |
| 22 | A finding's title starts with the area it's about ("Rate limit: one user can spend another account's quota") | A finding couldn't be found by scanning because its title didn't name its area. |
| 23 | The pane shows whether it has the keys right now | `ctrl+q` is a toggle with no cue, and in a spike a key meant for the pane went to Claude. |

## 6 November 2026: after the API spikes

Five throwaway spikes tried the riskiest parts in real sessions (`findings/spikes.md`). These choices followed (`findings/summary.md` has the options that were weighed).

| # | Decision | Why |
| --- | --- | --- |
| 24 | The rules and format live in the first 4,096 characters of the tool's description, and also in the system prompt on machines that allow it | A managed security plugin skipped the mod's system-prompt hooks on one machine; the tool description reached Claude, but only its first 4,096 characters. Most people installing it won't have such a plugin. |
| 25 | A `decisions_list` tool Claude calls at the start and after `/compact` or `/clear` | After `/clear`, Claude knew nothing about the open decisions. |
| 26 | Main-session replies stay the default; while Claude is mid-step the thread says the question is queued, with a key to send it to the fork instead | A main-session question waits for Claude's current step (20 to 30 seconds while busy); the fork answers in about 3.5. |
| 27 | No side agent in the first release; main session, fork and quick model only | The side agent's report also landed in the main conversation and interrupted Claude. It comes back if the fork turns out unable to read files. |
| 28 | One row of tabs for where decisions came from; inside each, "Needs you" open at the top and "Claude's call" and "Already decided" folded with counts | Two rows of tabs weren't seen as tabs, and their purpose wasn't clear. A filter could hide something that needed you. |
| 29 | The eval suite starts each run with a setup script that makes a small git project | Each eval run starts in an empty folder, so "review the last commit" had nothing to review. |
| 30 | AskUserQuestion is answered with an object `{ questions, answers: {} }` plus a note that the questions are in the pane | A plain string was refused; an object was read by Claude as "pending, waiting for the person". |

## 6 November 2026: keys

| # | Decision | Why |
| --- | --- | --- |
| 31 | Review findings answer `1` agree, `2` already decided, `3` disagree, `4` not sure | All four came up as useful answers. |
| 32 | Choosing is two steps: typing a number highlights that option (`1` then `0` highlights option 10), up and down move the highlight, `enter` confirms | Ten or more options can't each have a one-key shortcut, and confirming with `enter` stops a stray key answering something. |
| 33 | `enter` with nothing highlighted opens the decision's discussion | Discussion stays one key away. |
| 34 | `a` highlights the recommended option (then `enter`), `d` marks a discussed decision done, `r` marks the rest of an assumptions batch right, `p` parks, `b` clears a highlight then goes back | Keeps the recommended option one key away, as in the prototype test that passed. |
| 35 | Answers aren't sent until you press `s` **(Claude's call)** | Sending on every keypress would make the review screen pointless. |

## 6 November 2026: how it gets built and shared

| # | Decision | Why |
| --- | --- | --- |
| 36 | The repository is public under MIT, starting from a clean history with made-up examples | The first notes were written alongside other work; only the parts that are about the mod are published. |
| 37 | The build is split into workstreams run one after another: a spike on keys and storage, then core loop, discussions, kinds and reviews, Claude integration, UX testing, release | Each workstream delivers something you can see working, not a layer. |
| 38 | Each workstream has its own branch, merged into `main` locally; `main` is pushed when a phase ends; no pull requests | Keeps `main` on GitHub at a working state without a review click per piece. |
| 39 | Real Claude sessions used for testing run on Sonnet, at most three per workstream | Real sessions are the expensive part of testing a mod. |
| 40 | The build runs autonomously, with sensible commits at each step, and keeps this document and `CONTRIBUTING.md` up to date | Aaron asked for it to carry on without stopping at each gate. |
| 41 | The repository root is the mod; `spikes/` stays as reference **(Claude's call)** | One install path, matching the README's `/plugin install` commands. |
| 42 | Every task's commit is pushed to GitHub straight away; `main` is pushed after each merge. Replaces the "pushed when a phase ends" part of 38 | Aaron wants the work visible as it happens. |

## 6 November 2026: after spike 0 (keys, append, fork, storage)

| # | Decision | Why |
| --- | --- | --- |
| 43 | Digits move a highlight with `$.ui.focus` and `enter` presses the highlighted option; an `autoFocus` Discuss button stands for "nothing highlighted" | The spike showed this works in a real session; `enter` on nothing reaches no handler. |
| 44 | A second digit within 1000 ms extends the number (`1` then `0` is 10) **(Claude's call)** | 473 ms worked in the spike; a person needs to try what feels right. |
| 45 | The fork stays in v1 even though it can't read project files; its replies say so, and questions about code go to the main session **(Claude's call)** | The side agent, the one mode that reads files, leaked into the main chat (27). |
| 46 | The rules note is appended to the conversation at session start and on the first prompt after `/clear`, as well as living in the tool description | The spike saw an appended note reach Claude where the system-prompt hooks didn't. |
| 47 | Decisions are keyed by `git rev-parse --git-common-dir`, falling back to the folder path outside a git repository **(Claude's call for the fallback)** | Worktrees of one repository share the key; the spike confirmed it. |
