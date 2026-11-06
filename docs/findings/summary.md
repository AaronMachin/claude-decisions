# Phase 1 findings summary

This document lists the changes to `docs/design.md` that the prototype test and the five spikes point to. Each one is for Aaron to accept or reject; the design doc doesn't change until then. Evidence is in `prototype-test.md` and `spikes.md`. All spike sessions ran on Sonnet, so Opus may behave differently, and most observations were made once or twice.

## Changes that need a choice

### 1. Getting the rules to Claude

The design puts the rules ("put questions in the pane, not in chat") in the system prompt, and adds the open list to every turn. On this machine neither arrives: an organisation's managed security plugin runs first and skipped this mod's `prompt.compose` and `prompt.context` hooks (loaded through `--plugin-dir`; a marketplace install wasn't tried). Everything else the mod does (its tool, `tool.call`, `turn.complete`, the pane) ran normally. That plugin is an organisation control, so the mod must not try to get round it.

What this changes: with no rules in the system prompt, Claude asked in chat in 2 of 3 test prompts. After `/clear` it didn't know any decisions were open ("I can't see any open or parked decisions in my context").

The one route that did reach Claude is the tool's own description, and only its first 4,096 characters.

- **A. Tool description only.** Rules, format and a short example inside 4,096 characters, plus a `decisions_list` tool Claude can call to get the open list back after `/compact` or `/clear`. Works everywhere, including here. Less room for rules, and Claude has to choose to call the list tool.
- **B. A, plus the system prompt where it's allowed.** Keep the `prompt.compose` and `prompt.context` hooks for people without a managed security plugin (most people installing the public repo). On a managed machine they're skipped and A carries it. More to test: two routes, and they must not contradict each other.
- **C. A, plus a message added to the conversation** at session start and after `/compact` or `/clear` (`$.session.append`). Not tested yet, so it may be skipped too.

Recommendation: B, and test C early in the build. Separately, we could ask whoever owns the managed plugin whether there's an approved way for a mod to add to the system prompt; that's a question for them, not something to work around.

### 2. Main session replies wait for Claude's current step

A question asked in a decision's thread, answered by the main session, only reaches Claude when its current turn ends. In the spike that was 20 to 29 seconds (while Claude was busy reading files), then a 2-second reply. The fork answered in 3.5 seconds and knew the conversation; the quick model answered in 1 second but knew nothing about it.

What this changes: you ask "why does option 2 exist?" while Claude is mid-refactor and the thread shows nothing for half a minute.

- **A. Keep main as the default, and say it's queued.** The thread shows "queued, Claude is mid-step" and a key to send that one question to the fork instead.
- **B. Make the fork the default.** Replies in seconds, but they don't show in the main chat and the main session doesn't learn from the discussion until you mark the decision answered.

Recommendation: A. You said main is the best default; the wait is the cost, and the one-key switch covers the times you can't wait.

Related, no choice needed: the mod can't relabel its own question rows in the chat (the engine skips a plugin's hook for something the same plugin sent), so the text it sends will start "On decision 3 · When a shared recipe link expires:", which both Claude and the chat row then show.

### 3. The side agent's reply lands in the main chat

The side agent read files and answered in 7.4 seconds, but its report also arrived in the main conversation as "Message from @discuss-spike-discuss", and Claude commented on it mid-task. Fork and quick didn't leak.

- **A. Drop the side agent from the settings for now.** Main, fork and quick remain. Loses the one mode that reads files without touching the main session.
- **B. Keep it, with a note in `/config`** that its reply also shows in the main chat.
- **C. Try a second, small plugin to filter the report out.** Untested, more work, may not be possible.

Recommendation: A for the first release; revisit if the fork turns out unable to read files (not tested yet).

### 4. The two rows of tabs

In the test it "took ages" to see the tabs, and once seen it wasn't clear what they were for. The top row is where decisions came from (a ticket's work, a PR review, Parked); the second row filters by who has to act (needs you, Claude's call, already decided, all).

- **A. Label the rows.** "From: Sharing links · Search review · Parked" and "Show: needs you · Claude's call · ...". Smallest change; still two rows to learn.
- **B. One row of tabs for where they came from, and sections inside instead of filters.** "Needs you" open at the top, "Claude's call" and "Already decided" as collapsed headings beneath with counts. One row to learn, and nothing needing you is ever hidden behind a filter.

Recommendation: B, then re-test task 5 on the prototype.

### 5. Running the evals against a real project

`claude plugin eval` works for "did Claude add a decision instead of asking in chat", but each run starts in an empty folder, so "review the last commit" has nothing to review. A fixture project needs `--scaffold`, which runs a bash script as you.

- **A. Allow a scaffold script** (kept in the repo, makes a small git project with a few commits). About $0.13 per three-case run.
- **B. No scaffold;** use only prompts that don't need a project. Cheaper to set up, but it doesn't test reviews or planning.

Recommendation: A.

## Changes from the prototype test (your asks, to confirm)

1. Answering a decision saves it and takes you back to the list.
2. Send opens a review screen of ready answers, all ticked. Untick any to hold back, then confirm.
3. A message in a thread only discusses. A separate key marks the decision answered, and Claude gets your answer with the whole discussion.
4. Every kind uses numbered options (an assumption: 1 correct, 2 wrong; a finding: 1 agree, 2 disagree, 3 not sure).
5. An answered decision still shows all its options, with yours marked.
6. When a discussion changes a decision, its earlier versions stay viewable in the pane.
7. The keys under an expanded item stand apart from its text.
8. Claude is told a finding's title names the area it's about ("Image upload size limit: one user can use up another's quota"), so you can find it by scanning.
9. The pane shows whether it currently has your keys. `ctrl+q` is a toggle with no cue, and in one spike session a key meant for the pane was sent to Claude.

## For the build, no decision needed

- AskUserQuestion is answered with an object (`{ questions, answers: {} }`, the "added to the pane" text as context). A plain string is refused.
- The tool returns a string, not an object.
- Drafts and threads live in `$.state` or on disk: hiding the pane or a reload loses anything held only in the Input.
- The docked pane vanished once when the window shrank from 120 to 100 columns; `/decisions` must always bring it back.
- Draw to the pane's body width, not the terminal's.
- Anything finishing in the background (a reply, a new decision) redraws the pane.
- The test kit passed things reality refused twice; every layer gets a real-session check, not just unit tests.

## Worked as designed

Pane docks beside the transcript at 120 columns and up, inline above the prompt below that; Esc returns to the prompt and keeps the draft; Claude treats questions sent to the pane as pending and doesn't invent answers; the in-chat question nudge fired once with no false alarms over six turns; the fork knows the conversation; the tool is visible to Claude without a search; evals can check that the tool was used.
