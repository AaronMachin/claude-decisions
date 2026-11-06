# GIF shot list

This document lists the five GIFs the README needs and how to record each one against the made-up Pantry project. Each shot starts from a fresh project made by `demo/make-pantry.sh`, so nothing from an earlier take shows up.

## Before recording

- A terminal at 160 columns by 45 rows, so the pane docks beside the transcript.
- Fullscreen layout: start Claude Code with `CLAUDE_CODE_NO_FLICKER=1`.
- The mod installed (or `--plugin-dir <repo>` while trying it out), on Sonnet.
- Node on `PATH` for `--seed`.
- In a new folder, Claude Code's trust prompt starts on "No, exit": pick "Yes" before you start recording.
- "Focus key" below is `ctrl+x tab`, or whatever you bound `abovePrompt:focus` to. It does nothing while the pane is closed.
- In a seeded project the pane stays closed until Claude adds something or you run `/decisions` (with an empty prompt), which opens it with the keys.
- The highlighted row is reverse video only. After `t` the highlight doesn't always land on the first row, so look before pressing `enter`.
- On a machine with a managed security plugin, a note that a hook was skipped can show in the chat after a prompt the pane sends (shot 2). Frame the pane, or trim it.

Setups (`<repo>` is where you cloned this repository):

| Name | Command |
| --- | --- |
| empty | `cd "$(<repo>/demo/make-pantry.sh | tail -1)" && CLAUDE_CODE_NO_FLICKER=1 claude --model sonnet` |
| seeded | `cd "$(<repo>/demo/make-pantry.sh --seed | tail -1)" && CLAUDE_CODE_NO_FLICKER=1 claude --model sonnet` |

The seeded project has two tabs. "Sharing links" holds two choices ("Where share links live" and "What a receiver can do with a shared recipe") and five assumptions. "Pantry review" holds eight findings: four needing you (one of them parked), two Claude's call, two already decided.

## Shots

### 1. The list filling as Claude adds decisions

- **Setup:** empty.
- **Do:** type `Plan sharing a recipe by link. Put anything you need me to decide in the decisions pane.` and press `enter`. Don't touch anything else.
- **On screen at the end:** the pane opened by itself on the right, with a new tab and two or more decisions under "Needs you", and a short summary in the chat. In the trial run Claude added 2 decisions in about 26 seconds, then also asked about the cooking-time bug in the chat; if it does that, take it again.
- **Length:** 15 to 30 seconds (trim the wait while Claude reads the code).

### 2. A live discussion that adds an option

- **Setup:** seeded.
- **Do:** `/decisions`; `enter` on "Where share links live" (highlighted to start with); `enter` again (nothing highlighted) to open the discussion; `enter` on "Ask a question"; type `Could links expire on their own after a week? If that's worth weighing, add it as an option.` and press `enter`.
- **On screen at the end:** a `↻ Added option 3, ...` line in the thread, then Claude's reply under it. `b` once shows the decision with its third option. In the trial run the revision showed in about 8 seconds and the reply soon after; the main chat shows the same exchange beside it.
- **Length:** 20 to 30 seconds (trim the wait for the reply).

### 3. The assumptions batch

- **Setup:** seeded.
- **Do:** `/decisions`; `Up` once (from "Where share links live" to "Check 5 assumptions together") and `enter`; `Down` four times to "Nobody shares more than 100 recipes" and press `2` (it shows `wrong?`); `r` marks the rest `right?`; `enter` on "Confirm 5".
- **On screen at the end:** the result line ("Answered 5 assumptions: 4 right, 1 wrong.") and the list with them answered.
- **Length:** about 10 seconds.

### 4. Findings triage with folded sections

- **Setup:** seeded.
- **Do:** `/decisions`; `t` to the "Pantry review" tab; move to "Recipe list: cooking times show in seconds" (check the highlight) and `enter`; `1` then `enter` to agree; after it returns to the list, `Down` twice to "▸ Claude's call (2)" and `enter`.
- **On screen at the end:** "Needs you (2)", "▾ Claude's call (2)" open with its two findings, "▸ Already decided (2)" still folded, and the agreed finding under "Answered" as `ready to send`.
- **Length:** about 15 seconds.

### 5. The keyboard flow in and out

- **Setup:** seeded.
- **Before recording:** `/decisions`, then `esc`, so the pane is open without the keys.
- **Do:** type `also remember the` in the prompt and stop; focus key (the header turns to `keys on`); `Down` to "What a receiver can do with a shared recipe" and `enter`; `a` to highlight the recommendation, `enter` to confirm; `esc`.
- **On screen at the end:** the prompt with `also remember the` still in it, the pane showing the decision answered and `keys off`.
- **Length:** about 10 seconds.
