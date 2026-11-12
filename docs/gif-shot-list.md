# GIF shot list

This document lists the seven GIFs the README needs and how to record each one against the made-up Pantry project. Each shot starts from a fresh project made by `demo/make-pantry.sh`, so nothing from an earlier take shows up.

## Before recording

- A terminal at 160 columns by 45 rows, so the pane docks beside the transcript.
- Fullscreen layout: start Claude Code with `CLAUDE_CODE_NO_FLICKER=1`.
- The mod installed (or `--plugin-dir <repo>` while trying it out), on Sonnet.
- Node on `PATH` for `--seed`.
- In a new folder, Claude Code's trust prompt starts on "No, exit": pick "Yes" before you start recording.
- "Focus key" below is `ctrl+x tab`, or whatever you bound `abovePrompt:focus` to. It does nothing while the pane is closed.
- In a seeded project the pane stays closed until Claude adds something or you run `/decisions` (with an empty prompt), which opens it with the keys.
- The ringed row has the selection background and starts `›`. Look before pressing `enter`.
- On a machine with a managed security plugin, a note that a hook was skipped can show in the chat after a prompt the pane sends (shot 2). Frame the pane, or trim it.

Setups (`<repo>` is where you cloned this repository):

| Name | Command |
| --- | --- |
| empty | `cd "$(<repo>/demo/make-pantry.sh | tail -1)" && CLAUDE_CODE_NO_FLICKER=1 claude --model sonnet` |
| seeded | `cd "$(<repo>/demo/make-pantry.sh --seed | tail -1)" && CLAUDE_CODE_NO_FLICKER=1 claude --session-id "$(cat .git/pantry-session)" --model sonnet` |

The pane shows only the decisions of the session that added them, so the seeded setup starts Claude in the session the seed stamped them with. The seeded project has two groups. "Sharing links" holds two choices ("Where share links live" and "What a receiver can do with a shared recipe") and five assumptions. "Pantry review" holds eight findings: four needing you (one of them parked), two Claude's call, two already decided.

## Shots

### 1. The list filling as Claude adds decisions

- **Setup:** empty.
- **Do:** type `Plan sharing a recipe by link. Put anything you need me to decide in the decisions pane.` and press `enter`. Don't touch anything else.
- **On screen at the end:** the pane opened by itself on the right, with a new group heading and two or more decisions under it, each with its problem line, and a short summary in the chat. In the trial run Claude added 2 decisions in about 26 seconds, then also asked about the cooking-time bug in the chat; if it does that, take it again.
- **Length:** 15 to 30 seconds (trim the wait while Claude reads the code).

### 2. A live discussion that adds an option

- **Setup:** seeded.
- **Do:** `/decisions`; `enter` on "Where share links live" (highlighted to start with); `t` to put the ring in the ask box under the options; type `Could links expire on their own after a week? If that's worth weighing, add it as an option.` and press `enter`.
- **On screen at the end:** `✻ Claude is replying…` under "Talk it through with Claude", then a third option marked `↻ new` and Claude's reply in the conversation, all on the decision screen. `o` opens the whole thread with its `↻ Added option 3, ...` line. In the trial run (on the old thread screen) the revision showed in about 8 seconds and the reply soon after; the main chat shows the same exchange beside it.
- **Length:** 20 to 30 seconds (trim the wait for the reply).

### 3. The assumptions batch

- **Setup:** seeded.
- **Do:** `/decisions`; `Up` once (from "Where share links live" to "Check 5 assumptions together") and `enter`; `Down` four times to "Nobody shares more than 100 recipes" and press `2` (it shows `wrong?`); `r` marks the rest `right?`; `enter` on "Confirm 5".
- **On screen at the end:** the result line ("Answered 5 assumptions: 4 right, 1 wrong.") and the list with them answered.
- **Length:** about 10 seconds.

### 4. Findings triage with folded sections

- **Setup:** seeded.
- **Do:** `/decisions`; `Down` to the "Pantry review" group and on to "Recipe list: cooking times show in seconds" (check the highlight) and `enter`; `1` then `enter` to agree (the ring starts on the recommendation, so if that is Agree, `enter` alone does it); after it returns to the list, `Down` to "▸ Claude's call · 2" and `enter`.
- **On screen at the end:** the "◆ Pantry review" heading with what still waits, "▾ Claude's call · 2" open with its two findings, "▸ Already decided · 2" still folded, and the agreed finding with `1 Agree` on its dim line.
- **Length:** about 15 seconds.

### 5. The keyboard flow in and out

- **Setup:** seeded.
- **Before recording:** `/decisions`, then `esc`, so the pane is open without the keys.
- **Do:** type `also remember the` in the prompt and stop; focus key (the header turns to `keys on`); `Down` to "What a receiver can do with a shared recipe" and `enter`; the ring is already on the recommendation, so `enter` confirms it; `esc`.
- **On screen at the end:** the prompt with `also remember the` still in it, the pane showing the decision answered and `keys off`.
- **Length:** about 10 seconds.

### 6. The Session page

- **Setup:** empty.
- **Do:** type `Plan sharing a recipe by link, and keep the session record up to date. Put anything you need me to decide in the decisions pane.` and press `enter`; once the pane has decisions, focus key; `Up` to the session card (`✻` and the session's title) and `enter`; `m` to fold the done items; `r`.
- **On screen at the end:** the Session page with the title, the summary, `▶ now` and the plan as a nested list, then `✻ asked Claude to refresh` and, once Claude has written, `updated just now by Claude`. If Claude didn't write a record before adding decisions, the card isn't there yet: take it again.
- **Length:** 20 to 40 seconds (trim the waits).

### 7. A quick answer

- **Setup:** seeded, with Discussion replies on `auto` (the default).
- **Do:** `/decisions`; `enter` on "Where share links live"; `t`; type `What does a short code in the address mean?` and press `enter`; once the answer shows, `r`.
- **On screen at the end:** `quick answer · now` and its answer in the conversation within a few seconds, with no turn in the chat, then `r` sending the same question to the main session and Claude's reply landing under it.
- **Length:** 15 to 25 seconds.
