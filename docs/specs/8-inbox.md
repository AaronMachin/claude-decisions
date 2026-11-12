# 8 inbox: spec

This document outlines workstream 8, which makes the pane easier to come back to and easier to answer from. It builds decisions 205 to 232 in `docs/decisions.md`. Those rows say what and why; this says exactly what each screen shows. Where the two differ, the decisions win. The clickable mockup Aaron tried on 12 November is the reference for look and flow, with the changes 219 to 232 made after it.

## What changes for the person

- Coming back after a while, the list and the line above the prompt say which decision has a new reply from Claude, and the row shows the first line of it.
- A decision shows everything on a tall pane: the whole scenario, every option's text, the reason for the recommendation. `m` hides the detail.
- Every decision ends with a numbered "Something else" row. Typing an answer there, or a condition on an option with `c`, saves it without starting a turn.
- Claude's latest reply and a box to ask sit under the options. `t` or `↓` past the last option reaches the box. The whole thread is a page away with `o`.
- `s` on an answered decision previews exactly what Claude will get for that one decision, and `enter` sends only that.
- `enter` works the first time the pane gets the keys.

## The list (208 to 210, 222, 223)

Tabs stay. Inside a tab's "Needs you", rows with an unread reply come first, then the rest in today's order. While the pane has the keys the order doesn't change (209); it is worked out again when the keys leave.

A row with an unread reply starts `●` in the `claude` colour, and on tall panes its second line is `claude · 2m ago: <first line of the reply>` in the `claude` colour, cut with `…`. Compact panes keep one line per row, with the `●`. A tab chip whose decisions hold an unread reply ends ` ●`.

"Unread" means a reply from Claude (main, fork or quick) whose `at` is later than the time the person last opened that decision. The times are kept in `$.state` under their own key, never in the decision file (232). A decision never opened counts from its `createdAt`.

## The line above the prompt (223)

With one or more unread replies, the line leads with `● N new repl(y|ies) on dX · ` (`dX` is the newest), then today's text. With unread replies and nothing waiting: `● 1 new reply on d43 · <focus key> to read it`. Unread replies show even when the pane is hidden or inline in fullscreen; waiting counts alone keep today's rules.

## The decision screen (205 to 207, 216, 217, 219, 220, 225 to 229)

Top to bottom, on a pane 14 rows or taller:

1. Header (title, keys on/off) as today. The crumb becomes `<KIND>  dX · <group>   ●●○ 2 of 3 answered`, the kind in bold in its colour (choice `suggestion`, go-ahead `warning`, finding `claude`, assumption and question dim), the dots counting answered decisions in the same group.
2. The whole scenario. Then `⚑ Blocks <blocks>` when set, and today's dependency and source lines.
3. Each option: `N: <label>`, `  ★ recommended` in `success` for the recommendation, `  ✓ your answer` once chosen, `  ↻ new` while the option came from a discussion in the last two minutes. Under it, its `changes` in full (dim), and for the recommendation `Why: <reason>` in full (`success`). Under a chosen option: `⤷ only if <condition>` or `⤷ <typed answer>`.
4. The last option is always `N: Something else`, with the line `Type your own answer. It's saved without asking Claude and goes with your next send.`
5. A rule, then `Talk it through with Claude`, then ` · N messages` and ` · ● N new` when there are any. Under it, the newest unread reply, or else the newest reply, as `claude · 2m ago` and its text (at most 6 lines, cut with `…`), then `N earlier messages · o: whole thread` when there are more. With no thread: `Ask why an option exists, what it would cost, or for another option. Claude replies here and can change the decision.`
6. While a question is waiting for its reply: `✻ Claude is replying…`, the mark turning through `✻ ✳ ✢ ·` every 250 ms only while it waits (227).
7. The ask box: an Input with placeholder `Ask Claude about this decision…`. Its draft survives hiding the pane, as today's `drafts` do.
8. The key line.

`m` hides the detail: options show their label line only, except the highlighted one. The scenario keeps its first 3 lines. Below 14 rows the screen keeps today's compact layout (228), with the Something else row added and the conversation reached through `o`.

When the screen opens, the ring is on the chosen option if answered, else the recommended one, else option 1 (219). There is no Discuss row.

### Keys on the decision screen

| Key | Does |
| --- | --- |
| number | highlights that option; pressed again, answers it (as today) |
| `enter` | answers the highlighted option; on Something else, opens the answer box |
| `c` | on a highlighted option (not Something else), opens the condition box |
| `a` | highlights the recommendation |
| `t` | puts the ring in the ask box (`↓` past the last option does too) |
| `o` | opens the whole thread (today's thread screen without `d` and with `m` gone, 229); on a compact pane pages options first |
| `m` | hides or shows the detail |
| `s` | answered: opens the preview for this decision; otherwise, the Send screen for everything ready, as today |
| `b`, `p`, `h`, `f` | as today |

### The answer and condition boxes (205, 206)

Opened under the highlighted option: `Your answer ` or `Only if `, then a dim line `enter saves it, Claude isn't asked · empty enter cancels`. `enter` with text saves: a typed answer as `{ text }`, a condition as `{ option, condition }`, the decision becomes ready, dependents reopen as for a chosen option, and the notice is `Saved dX · <answer> · s sends it`. Empty `enter` closes the box. Drafts survive hiding the pane.

## Sending (213, 221)

`s` on an answered decision opens the Send screen with only that decision ticked, titled `Send this decision to Claude`, showing `Exactly what Claude gets:` and the decision's block from `buildAnswerPrompt` as dim lines, then `N other answer(s) stay ready and aren't sent.` when others are ready. `enter` sends, `b` goes back. The prompt's `Chosen:` line for a typed answer reads `Something else: <text>`.

## Kinds (207, 230)

Every kind gets Something else. A question has only that row, and the tool description's question line says the person types the answer in the pane. On the assumptions batch, Something else is reached by opening the row (`enter`), not with `3`.

## The spike (214, 231)

Before the rest, a throwaway mod in `spikes/prompt-drop` checks that returning `{ drop }` from `prompt.submit` keeps a prompt from Claude and clears the prompt. The finding goes in `docs/findings/spikes.md`. Nothing else in this workstream depends on it.

## Not in this workstream

Answering from the prompt (`d11 1`) is not built here, whatever the spike finds. Changes to the fork and quick reply modes, beyond keeping `f`.
