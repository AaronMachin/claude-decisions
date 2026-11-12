# claude-decisions

<!-- GIF: the list filling as Claude adds decisions (docs/gif-shot-list.md, shot 1) -->

A Claude Code mod that moves Claude's questions and decisions out of the chat and into a pane beside it. Each decision has a plain title, a concrete scenario, numbered options with what each changes, Claude's recommendation and a discussion of its own. You answer by number or in your own words, then send the answers back to Claude when you're ready.

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

The pane's keys work once the pane has focus. Its header says `keys on` when it has them and `keys off` when the prompt does. While decisions are waiting and the prompt has the keys, a line above the prompt says how many and which key reaches them, for example "3 decisions waiting · ctrl+x tab to answer, your draft stays" (with the pane drawn right above the prompt in a narrow fullscreen terminal, the pane's own top line says it instead). The row the ring is on starts with `›`.

The pane opens on the tab with the newest decision waiting for you, and each tab shows how many wait in it. When the tab you're on has nothing to answer, the list says which tab has ("2 waiting in Sharing links · enter").

| Key | What it does |
| --- | --- |
| `ctrl+x tab` | Moves between the prompt and an open pane, keeping whatever is half-typed in the prompt (Claude Code's `abovePrompt:focus`; see below to move it). It does nothing while the pane is closed |
| `/decisions` | Opens the pane and gives it the keys (with an empty prompt; see Limitations) |
| `esc` | Back to the prompt, draft still there |
| up / down | Move between rows (they stay off the tab strip; `t` changes tab) |
| `enter` | On the list, opens the decision under the highlight. On a decision, answers with the highlighted option and goes back to the list. A decision opens with the ring on your answer, else Claude's recommendation, else option 1, so `enter` alone takes the recommendation. On Something else, `enter` opens a box to type your own answer |
| `1` to `10` | Highlights that option (`0` for 10, `1` then `2` for 12; reach 11 with the arrows). Pressing the highlighted option's number again, or `enter`, answers it. With ten or more options and the ring on option 1, a `1` waits a second for another digit before it answers |
| `a` | Highlights Claude's recommendation |
| `c` | On a highlighted option, opens a box for a condition (`Only if ...`). `enter` saves the option with its condition, without asking Claude; an empty `enter` cancels |
| `t` | On the list, next tab. On a decision, puts the ring in the box to ask Claude (`↓` past the last option does too); on a short pane it opens the whole thread |
| `o` | On a decision, opens the whole thread; when the options don't all fit, shows the next page of options instead (the numbers of options on other pages stay in the key line). On the list, the earlier page of a long section |
| `m` | On a decision, hides the detail (every option's text, the reason, the whole scenario) and shows it again. On a short pane, shows the dependencies and sources instead |
| `b` | Goes back |
| `p` | Parks the decision with a reason (it moves to the Parked tab); `p` on a parked one brings it back |
| `n` / `o` | Next and earlier page of a long list, or newer and older messages on the thread screen. On a short pane, `o` also pages the assumptions batch and the send screen |
| `s` | On the list, or on a decision that isn't answered, opens the review screen of answers ready to send: `enter` ticks or unticks a row, `c` sends the ticked ones to Claude, `b` goes back. On an answered decision, shows exactly what Claude will get for that one and which other answers stay behind; `enter` sends just it, `b` goes back to the decision |
| `h` | Hides the pane. `/decisions` (with an empty prompt) brings it back |

What the numbers mean depends on the kind of decision. Every kind ends with one more numbered row, Something else, where you type your own answer. It's saved without asking Claude and goes with your next send.

| Kind | Keys |
| --- | --- |
| Choice | `1` to `10`, one per option, and `1` then `2` for 12; the number after the last option is Something else |
| Go-ahead | `1` yes, `2` no, `3` Something else |
| Task (something Claude needs you to do) | `1` done, `2` can't do it, `3` Something else |
| Assumption | `1` right, `2` wrong, `3` Something else. "Check N assumptions together" opens them as a batch, where `1` and `2` mark each row and `r` marks the rest right; Something else is reached by opening the row with `enter` |
| Finding (from a review) | `1` agree, `2` already decided, `3` disagree, `4` not sure, `5` Something else |
| Question | `1` Something else: type the answer |

<!-- GIF: the assumptions batch (shot 3) -->

On a tall pane a decision shows everything: the whole scenario, every option's text and the reason for the recommendation. Under the options, "Talk it through with Claude" shows Claude's newest reply (the newest unread one if there is one) and a box to ask. Type a question and press `enter`. It goes straight to whoever replies (see Settings), and `✻ Claude is replying…` shows until the reply lands. Messages only discuss: to answer, pick an option or type in Something else. If Claude's reply changes the decision (a new option, a different recommendation), the new option is marked `↻ new` for two minutes, and on the thread screen (`o`) a `↻` line marks it and opens the earlier version. While a question is waiting for the main session, `f` on the thread screen sends it to the fork instead.

Coming back after a while, decisions with a reply you haven't read come first in their tab, marked `●`, with the first line of the reply under the title on a tall pane. A tab holding one ends `●`, and the line above the prompt leads with it ("● 1 new reply on d43"), even while the pane is hidden. While the pane has the keys the list doesn't reorder under you; it sorts again when the keys leave.

<!-- GIF: a live discussion that adds an option (shot 2) -->

Nothing reaches Claude until you send. Answers (typed ones and conditions too) and parked decisions all wait in the pane until `s`. Questions asked from a decision are the exception: they go as you ask them.

<!-- GIF: the keyboard flow in and out (shot 5) -->

### Moving the focus key

If `ctrl+x tab` clashes with something, bind `abovePrompt:focus` to another key in `~/.claude/keybindings.json`, then set Focus key in `/config` to the same key so the pane names it. For example, to use `ctrl+g` instead:

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
| Focus key | the key you bound to `abovePrompt:focus` | ctrl+x tab |

- **main session**: the question goes to the main conversation, marked with the decision it's about ("On decision 3 · Where share links live: ..."), and the reply shows in the chat as well as the thread. Full context and tools. If Claude is mid-task, the question waits for the turn to end, and the thread says so.
- **fork**: a copy of the conversation answers straight away, without touching the main one. It can't read project files.
- **quick model**: a single call that only sees the decision. Fastest, with no conversation and no files.

Focus key only changes what the pane and the line above the prompt tell you to press. The mod can't read your key bindings, so if you move the focus key (below), set this to match.

## How decisions are stored

Under `~/.claude/decisions/<repository>/`, one JSON file per decision with its whole discussion and every earlier version, stamped with the session that added it. The folder is worked out from the repository's git folder, so every worktree of a repository shares the folder. The pane, the status line and Claude's `decisions_list` show only the current session's decisions; the files stay after compaction, `/clear` and new sessions. Outside a git repository the folder is keyed by the working folder instead. Delete a repository's folder to start again.

## Limitations

- **A half-typed prompt and the pane's keys.** With a draft in the prompt, `/decisions` hands the draft back and leaves the pane without keys. Use the focus key (`ctrl+x tab` unless you moved it) instead: it takes you into the pane and keeps the draft, and `esc` brings you back to it. Don't stash the draft with `ctrl+s` to get round this: the stash comes back after `/decisions`, and the next `enter` sends it to Claude.
- **This session's decisions only.** The pane shows the decisions added in the session you're in. `/clear` starts a new session, so decisions added before it are out of reach unless you go back to that session with `claude --resume`. Decisions stored before sessions were recorded aren't shown at all.
- **Short panes.** Under 110 columns, and in tmux's main-screen layout, the pane is about 9 to 11 rows. Below about 14 rows it uses a compact layout: one line per option, the description only for the highlighted one, the keys under the title, and `o` for more options. Dependencies and sources are behind `m`, and the conversation is on the thread screen (`t` or `o`). On a taller pane where everything doesn't fit, a decision shows only the highlighted option's text.
- **The focus key's name.** The pane and the line above the prompt name `ctrl+x tab` unless you set Focus key in `/config`; the mod can't read your key bindings.
- **A managed security plugin** (on some organisations' machines) can skip some of the mod's hooks. Where that happens, the rules Claude gets in its system prompt, and the note after a compaction, don't arrive. The tool's own description, the note at the start of a session and the redirect of AskUserQuestion into the pane still work, so Claude still uses the pane, with less reminding.
- **Discussions.** A fork reply can't read project files (set Discussion replies to main session and ask again). A question still waiting for the main session when the mod reloads gets its reply in the chat, but not in the thread.
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
