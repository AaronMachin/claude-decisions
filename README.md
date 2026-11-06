# claude-decisions

<!-- GIF: the list filling as Claude adds decisions (docs/gif-shot-list.md, shot 1) -->

A Claude Code mod that moves Claude's questions and decisions out of the chat and into a pane beside it. Each decision has a plain title, a concrete scenario, numbered options with what each changes, Claude's recommendation and a discussion of its own. You answer by number, then send the answers back to Claude when you're ready.

## Install

Needs Claude Code 2.1.318 or later. At the prompt of a Claude Code session in a terminal:

```
/plugin marketplace add AaronMachin/claude-decisions
/plugin install decisions@claude-decisions
```

The first asks to add the marketplace (answer `y`). The second shows the mod's details and asks for a scope: user scope (the first one) installs it for every project. It's active straight away in that session and in every session after.

Decisions are kept per repository, so start Claude Code in a git project.

## Using it

When Claude has something for you to decide, it adds it to the pane and writes one line in the chat. The pane opens beside the transcript (fullscreen at 110 columns or wider) or above the prompt (narrower, or tmux's main-screen layout), without taking the keys from the prompt. Otherwise `/decisions` opens it. Tabs along the top are where the decisions came from (a plan, a review, Parked). Inside a tab, "Needs you" is open, and "Claude's call" and "Already decided" are folded with counts.

<!-- GIF: findings triage with folded sections (shot 4) -->

### Keys

The pane's keys work once the pane has focus. Its header says `keys on` when it has them and `keys off` when the prompt does.

| Key | What it does |
| --- | --- |
| `ctrl+x tab` | Moves between the prompt and an open pane, keeping whatever is half-typed in the prompt (Claude Code's `abovePrompt:focus`; see below to move it). It does nothing while the pane is closed |
| `/decisions` | Opens the pane and gives it the keys (with an empty prompt; see Limitations) |
| `esc` | Back to the prompt, draft still there |
| up / down | Move between rows |
| `enter` | On the list, opens the decision under the highlight. On a decision, confirms the highlighted option and goes back to the list; with nothing highlighted, opens the discussion |
| `1` to `12` | Highlights that option (`1` then `0` for 10). Nothing is answered until `enter` |
| `a` | Highlights Claude's recommendation |
| `b` | Clears a highlight, then goes back |
| `p` | Parks the decision with a reason (it moves to the Parked tab); `p` on a parked one brings it back |
| `t` | Next tab |
| `n` / `o` | Next and earlier page of a long list, or newer and older messages in a long discussion |
| `s` | Opens the review screen of answers ready to send: `enter` ticks or unticks a row, `c` sends the ticked ones to Claude, `b` goes back |
| `h` | Hides the pane. `/decisions` (with an empty prompt) brings it back |

What the numbers mean depends on the kind of decision:

| Kind | Keys |
| --- | --- |
| Choice | `1` to `12`, one per option |
| Go-ahead | `1` yes, `2` no |
| Assumption | `1` right, `2` wrong. "Check N assumptions together" opens them as a batch, where `r` marks the rest right |
| Finding (from a review) | `1` agree, `2` already decided, `3` disagree, `4` not sure |
| Question | type the answer in the discussion |

<!-- GIF: the assumptions batch (shot 3) -->

In a discussion, type a question and press `enter`. It goes straight to whoever replies (see Settings), and the reply shows in the thread. Messages only discuss: once you're done, `d` marks the decision answered and Claude gets the whole discussion with the answer. If Claude's reply changes the decision (a new option, a different recommendation), a `↻` line marks it and the earlier version can still be opened from that line. While a question is waiting for the main session, `f` sends it to the fork instead; after a fork or quick reply, `m` asks the main session the same question.

<!-- GIF: a live discussion that adds an option (shot 2) -->

Nothing reaches Claude until you send. Answers, parked decisions and the `d` from a discussion all wait in the pane until `s` and `c`. Questions asked in a discussion are the exception: they go as you ask them.

<!-- GIF: the keyboard flow in and out (shot 5) -->

### Moving the focus key

If `ctrl+x tab` clashes with something, bind `abovePrompt:focus` to another key in `~/.claude/keybindings.json`. For example, to use `ctrl+g` instead:

```json
{
  "bindings": [
    {
      "context": "Chat",
      "bindings": {
        "ctrl+x tab": null,
        "ctrl+g": "abovePrompt:focus"
      }
    }
  ]
}
```

Editors and terminal multiplexers can swallow `ctrl+x` chords before Claude Code sees them (inside an editor's terminal, `ctrl+x` can leave typing mode). If yours does, move the focus key to one that gets through. `h` hides the pane without a chord.

## Settings

In `/config`:

| Setting | Values | Default |
| --- | --- | --- |
| Discussion replies | main session, fork, quick model | main session |

Only Discussion replies exists in 0.1.0.

- **main session**: the question goes to the main conversation, marked with the decision it's about ("On decision 3 · Where share links live: ..."), and the reply shows in the chat as well as the thread. Full context and tools. If Claude is mid-task, the question waits for the turn to end, and the thread says so.
- **fork**: a copy of the conversation answers straight away, without touching the main one. It can't read project files.
- **quick model**: a single call that only sees the decision. Fastest, with no conversation and no files.

## How decisions are stored

Under `~/.claude/decisions/<repository>/`, one JSON file per decision with its whole discussion and every earlier version. The folder is worked out from the repository's git folder, so every worktree of a repository shares the same decisions, and they're still there after `/clear`, compaction and new sessions. Outside a git repository the folder is keyed by the working folder instead. Delete a repository's folder to start again.

## Limitations

- **A half-typed prompt and the pane's keys.** With a draft in the prompt, `/decisions` hands the draft back and leaves the pane without keys. Use the focus key (`ctrl+x tab` unless you moved it) instead: it takes you into the pane and keeps the draft, and `esc` brings you back to it. Don't stash the draft with `ctrl+s` to get round this: the stash comes back after `/decisions`, and the next `enter` sends it to Claude.
- **Short panes.** Under 110 columns, and in tmux's main-screen layout, the pane is about 9 to 11 rows. A decision taller than that (many options, a long finding, a long review screen) pushes its key hints out of view, and a number key only works for an option that is fully on screen. Arrow keys and `enter` still work, or widen the terminal past 110 columns in fullscreen.
- **The highlight.** The highlighted row is shown in reverse video only, with no marker beside it.
- **A managed security plugin** (on some organisations' machines) can skip some of the mod's hooks. Where that happens, the rules Claude gets in its system prompt, and the note after a compaction, don't arrive. The tool's own description, the note at the start of a session and the redirect of AskUserQuestion into the pane still work, so Claude still uses the pane, with less reminding.
- **Discussions.** A fork reply can't read project files (use `m` to ask the main session). A question still waiting for the main session when the mod reloads gets its reply in the chat, but not in the thread.
- **Things in Claude Code itself:**
  - The folder trust prompt in a new folder starts on "No, exit"; pick "Yes" to go on.
  - `/help` doesn't list `/decisions`; typing `/dec` finds it.
  - `Left` in the pane goes to Claude Code (its background sessions screen), not back a step. Use `b`.
  - Each time Claude adds a decision, the tool call's JSON shows in the conversation.

## Licence

MIT, see `LICENSE`.

## Repository

- `docs/design.md` - the design
- `docs/decisions.md` - every decision so far and why
- `CONTRIBUTING.md` - principles and how changes are made
- `docs/findings/` - what the prototype test, the spikes and the first-time-user tests showed
- `docs/gif-shot-list.md` - how the GIFs above are recorded
- `demo/make-pantry.sh` - makes the made-up Pantry project the GIFs use
