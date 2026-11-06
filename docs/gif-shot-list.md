# GIF shot list

This document lists the five GIFs the README needs and how to record each one against the made-up Pantry project. Each shot starts from a fresh project made by `demo/make-pantry.sh`, so nothing from an earlier take shows up.

## Before recording

- A terminal at 160 columns by 45 rows, so the pane docks beside the transcript.
- Fullscreen layout: start Claude Code with `CLAUDE_CODE_NO_FLICKER=1`.
- The mod installed (or `--plugin-dir <repo>` while trying it out), on Sonnet.
- Node on `PATH` for `--seed`.
- In a new folder, Claude Code's trust prompt starts on "No, exit": pick "Yes" before you start recording.
- "Focus key" below is `ctrl+x tab`, or whatever you bound `abovePrompt:focus` to.

Setups:

| Name | Command |
| --- | --- |
| empty | `cd "$(<repo>/demo/make-pantry.sh | tail -1)" && CLAUDE_CODE_NO_FLICKER=1 claude --model sonnet` |
| seeded | `cd "$(<repo>/demo/make-pantry.sh --seed | tail -1)" && CLAUDE_CODE_NO_FLICKER=1 claude --model sonnet` |

The seeded project has two tabs. "Sharing links" holds two choices ("Where share links live" and "What a receiver can do with a shared recipe") and five assumptions. "Pantry review" holds eight findings: four needing you (one of them parked), two Claude's call, two already decided.

## Shots

### 1. The list filling as Claude adds decisions

- **Setup:** empty.
- **Do:** type `Plan sharing a recipe by link. Put anything you need me to decide in the decisions pane.` and press `enter`. Don't touch anything else.
- **On screen at the end:** the pane open on the right with a new tab and three or more decisions under "Needs you", and one line in the chat saying what was added.
- **Length:** 15 to 30 seconds (trim the wait while Claude reads the code).

### 2. A live discussion that adds an option

- **Setup:** seeded.
- **Do:** focus key; `enter` on "Where share links live"; `enter` again (nothing highlighted) to open the discussion; type `Could links expire on their own after a week? If that's worth weighing, add it as an option.` and press `enter`.
- **On screen at the end:** Claude's reply in the thread, a `↻` line for the change, and a third option on the decision.
- **Length:** 20 to 30 seconds (trim the wait for the reply).

### 3. The assumptions batch

- **Setup:** seeded.
- **Do:** focus key; down to "Check 5 assumptions together" and `enter`; on "Nobody shares more than 100 recipes" press `2` then `enter`; press `r` to mark the rest right; `enter` to confirm.
- **On screen at the end:** the result line ("Answered 5 assumptions: 4 right, 1 wrong.") and the list with them answered.
- **Length:** about 10 seconds.

### 4. Findings triage with folded sections

- **Setup:** seeded.
- **Do:** focus key; `t` to the "Pantry review" tab; `enter` on "Recipe list: cooking times show in seconds"; `1` then `enter` to agree; open the folded "Claude's call" heading with `enter`.
- **On screen at the end:** "Needs you" with one answered, "Claude's call" open with its two findings, "Already decided" still folded with its count.
- **Length:** about 15 seconds.

### 5. The keyboard flow in and out

- **Setup:** seeded.
- **Do:** type `also remember the` in the prompt and stop; focus key (the header turns to `keys on`); `enter` on "Where share links live"; `a` to highlight the recommendation, `enter` to confirm; `esc`.
- **On screen at the end:** the prompt with `also remember the` still in it, the pane showing the decision answered and `keys off`.
- **Length:** about 10 seconds.
