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

When Claude has something for you to decide, it adds it to the pane and writes one line in the chat. The pane opens beside the transcript (fullscreen at 110 columns or wider) or above the prompt (narrower, or tmux's main-screen layout), without taking the keys from the prompt. Otherwise `/decisions` opens it.

The pane is one list of this session's decisions, grouped by the piece of work they belong to (a plan, a review). Each group is a heading: `◆ Sharing links · 2 waiting` in bold while something in it waits for you, folded to `▸ Pantry review · 4 answered` once nothing does (`enter` unfolds it). Groups with a reply you haven't read come first, then the ones with decisions waiting, newest first. Inside a group, "Claude's call" and "Already decided" are folded headings with counts. Parked and "For you to do" are headings at the bottom of the list.

A bar down the left of each row is coloured by its kind while it waits, green once answered and dim once sent. On a tall pane a row has a dim second line: the problem the decision is about (when it has one), its kind, how long ago it was asked and, once answered, your answer (`1 Red · only if in stock`).

If you resume a session (`claude --resume`), the pane takes back the decisions the conversation already had, even though Claude Code gives the resumed session a new id. When the pane is empty it also offers other sessions in the same repository with decisions waiting, and enter brings one's decisions here.

At the top, the session card shows `✻` and the session's title, the summary, `▶ now:` and what Claude is doing, how far through the plan it is and what's next, and its pull requests and pages (`#1 merged · 2 pages`). Enter on it opens the Session page (below). A short pane keeps only the title and the now line.

<!-- GIF: findings triage with folded sections (shot 4) -->

### Keys

The pane's keys work once the pane has focus. Its header says `keys on` when it has them, and names the focus key when the prompt has them. While decisions are waiting and the prompt has the keys, a line above the prompt says how many and which key reaches them, for example "3 decisions waiting · ctrl+x tab to answer, your draft stays" (with the pane drawn right above the prompt in a narrow fullscreen terminal, the pane's own top line says it instead). The row the ring is on starts with `›`, and the ring starts on the first decision waiting for you.

| Key | What it does |
| --- | --- |
| `ctrl+x tab` | Moves between the prompt and an open pane, keeping whatever is half-typed in the prompt (Claude Code's `abovePrompt:focus`; see below to move it). It does nothing while the pane is closed |
| `/decisions` | Opens the pane and gives it the keys (with an empty prompt; see Limitations) |
| `esc` | Back to the prompt, draft still there |
| up / down | Move between rows. On a decision taller than the pane, they also reach the options out of view |
| `enter` | On the list, opens the decision under the ring, folds or unfolds a group heading, or opens the Session page from the session card. On a decision, answers with the highlighted option and goes back to the list. A decision opens with the ring on your answer, else Claude's recommendation, else option 1, so `enter` alone takes the recommendation. On Something else, `enter` opens a box to type your own answer |
| `1` to `10` | Highlights that option (`0` for 10, `1` then `2` for 12; reach 11 with the arrows). Pressing the highlighted option's number again, or `enter`, answers it. With ten or more options and the ring on option 1, a `1` waits a second for another digit before it answers |
| `a` | Highlights Claude's recommendation |
| `c` | On a highlighted option, opens a box for a condition (`Only if ...`). `enter` saves the option with its condition, without asking Claude; an empty `enter` cancels |
| `t` | On a decision, puts the ring in the box to ask Claude (`↓` past the last option does too); on a short pane it opens the whole thread |
| `o` | On a decision, opens the whole thread. On a short Session page, switches between the plan and the links |
| `r` | On a decision whose newest reply is a quick answer, asks the main session the same question. On the Session page, asks Claude to bring it up to date. On the assumptions batch, marks the rest right |
| `m` | On a decision, hides the detail (every option's text and the sources) and shows it again; on a short pane, shows the dependencies and sources instead. On the Session page, folds the plan's done items |
| `b` | Goes back |
| `p` | Parks the decision with a reason (it moves under Parked); `p` on a parked one brings it back |
| `n` / `o` | Next and earlier page of a long group, or newer and older messages on the thread screen. On a short pane, `o` also pages the assumptions batch and the send screen |
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

### A decision

A decision's header has its kind, the whole title and, under it in bold, one line on the problem it's about. Claude writes that line when it adds the decision; when it doesn't, a small model writes it shortly after and the line starts `◇`. Under the header are the id, the group, how long ago it was asked, and what the decision waits on and holds up.

On a tall pane a decision shows everything: the whole scenario, every option's text with the case for (`+`) and against (`−`) when Claude gave them, and the reason for the recommendation. Nothing is cut: when it's taller than the pane, the pane scrolls. Once a decision is sent, its answer shows when it went (`↗ sent 12:04`) and the first line of what Claude did next.

Under the options, "Talk it through with Claude" shows the newest reply (the newest unread one if there is one) and a box to ask. Type a question and press `enter`. With the default setting (see Settings), a small model answers first when the decision and its discussion already hold the answer, such as what an option means. Its answer shows as `quick answer`, lighter than Claude's, and `r` asks the main session the same question instead. Anything else goes to the main session, and `✻ Claude is replying…` shows until the reply lands. Messages only discuss: to answer, pick an option or type in Something else. If Claude's reply changes the decision (a new option, a different recommendation), the new option is marked `↻ new` for two minutes, and on the thread screen (`o`) a `↻` line shows what changed and opens the earlier version. While a question is waiting for the main session, `f` on the thread screen sends it to the fork instead.

Coming back after a while, groups with a reply you haven't read come first, marked `●`, with the reply's first line under the decision on a tall pane. The line above the prompt leads with it ("● 1 new reply on d43"), even while the pane is hidden. While the pane has the keys the list doesn't reorder under you; it sorts again when the keys leave.

<!-- GIF: a live discussion that adds an option (shot 2) -->

Nothing reaches Claude until you send. Answers (typed ones and conditions too) and parked decisions all wait in the pane until `s`. Questions asked from a decision are the exception: they go as you ask them. When you answer the last decision waiting, the pane goes straight to the send screen (`That was the last one.`): `enter` sends, `b` holds them. Until they're sent the list says `2 answers not sent yet · s sends them`, and so does the line above the prompt. With nothing waiting and nothing to send, the list says `✓ Nothing needs you` and shows the last answers sent.

If you answer a decision in the chat instead, Claude records your answer in the pane with your words quoted, so it's never sent twice.

<!-- GIF: the keyboard flow in and out (shot 5) -->

### The Session page

Someone flicking between sessions can see what each one is about from its Session page. Claude keeps it up to date as it works: a title, a short summary, a now line (what it's doing and the decisions that waits on), and the plan as a nested list (`✓` done, `▶` in progress, `·` to do). The pane adds the pull requests the session creates with `gh pr create` and the pages it publishes as links. A pull request's state (`✓ merged`, `open`) is checked with `gh pr view` when you open the page, at most every 5 minutes, and says how long ago.

`r` asks Claude to bring the page up to date. It sends one prompt, which starts a turn, and the page says `✻ asked Claude to refresh` until the record changes or the turn ends. `m` folds the done items, and on a short pane `o` switches between the plan and the links. The page follows the session through `/clear` and `/resume`.

<!-- GIF: the Session page (shot 6); a quick answer (shot 7) -->

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
| Discussion replies | auto, main session, fork, quick model | auto |
| Focus key | the key you bound to `abovePrompt:focus` | ctrl+x tab |

- **auto**: a small model gets the decision, its discussion and the session's title, summary and now line. It answers when those are enough (what a word or an option means, a trade-off the options already state) and hands the rest to the main session, exactly as main session does. Its answer is marked `quick answer`, and `r` asks the main session instead. Nothing it hands over is kept.
- **main session**: the question goes to the main conversation, marked with the decision it's about ("On decision 3 · Where share links live: ..."), and the reply shows in the chat as well as the thread. Full context and tools. If Claude is mid-task, the question waits for the turn to end, and the thread says so.
- **fork**: a copy of the conversation answers straight away, without touching the main one. It can't read project files.
- **quick model**: a single call that only sees the decision. Fastest, with no conversation and no files.

Focus key only changes what the pane and the line above the prompt tell you to press. The mod can't read your key bindings, so if you move the focus key (above), set this to match.

## Claude's tools

| Tool | What Claude uses it for |
| --- | --- |
| `decisions_add` | Adds a decision: the title, a scenario, options with what each changes, a recommendation with its reason, sources, and optionally a one-line problem |
| `decisions_update` | Revises a decision after a discussion: adds options, moves the recommendation, changes what it waits on or holds up, its section or its problem line. The earlier version is kept |
| `decisions_list` | Reads what's open, parked and recently answered, at the start of a conversation and after compaction or `/clear` |
| `decisions_answer` | Records an answer you gave in the chat, with your message quoted, and marks it sent so it never goes twice |
| `decisions_session` | Writes the session's title, summary, now line, plan and links for the Session page |

Claude's AskUserQuestion goes to the pane too: its questions become decisions there.

## How decisions are stored

Under `~/.claude/decisions/<repository>/`, one JSON file per decision with its whole discussion and every earlier version, stamped with the session that added it. The folder is worked out from the repository's git folder, so every worktree of a repository shares the folder. The pane, the status line and Claude's `decisions_list` show only the current session's decisions; the files stay after compaction, `/clear` and new sessions. Each session's record for the Session page sits beside them as `session-<session id>.json`. Outside a git repository the folder is keyed by the working folder instead. Delete a repository's folder to start again.

## Limitations

- **A half-typed prompt and the pane's keys.** With a draft in the prompt, `/decisions` hands the draft back and leaves the pane without keys. Use the focus key (`ctrl+x tab` unless you moved it) instead: it takes you into the pane and keeps the draft, and `esc` brings you back to it. Don't stash the draft with `ctrl+s` to get round this: the stash comes back after `/decisions`, and the next `enter` sends it to Claude.
- **This session's decisions only.** The pane shows the decisions added in the session you're in. `/clear` starts a new session, so decisions added before it are out of reach unless you go back to that session with `claude --resume`. Decisions stored before sessions were recorded aren't shown at all.
- **Short panes.** Under 110 columns, and in tmux's main-screen layout, the pane is about 9 to 11 rows. Below about 14 rows it uses a compact layout: one line per row and per option, the title cut to one line and no problem line, the description only for the highlighted option, and the keys under the title. Dependencies and sources are behind `m`, and the conversation is on the thread screen (`t` or `o`). A decision taller than the pane is drawn whole and scrolls.
- **The focus key's name.** The pane and the line above the prompt name `ctrl+x tab` unless you set Focus key in `/config`; the mod can't read your key bindings.
- **A managed security plugin** (on some organisations' machines) can skip some of the mod's hooks. Where that happens, the rules Claude gets in its system prompt, and the note after a compaction, don't arrive. The tool's own description, the note at the start of a session and the redirect of AskUserQuestion into the pane still work, so Claude still uses the pane, with less reminding.
- **Discussions.** A quick answer only sees the decision, its discussion and the session record, never the code; if it gets something wrong, `r` asks the main session. A fork reply can't read project files (set Discussion replies to main session and ask again). A question still waiting for the main session when the mod reloads gets its reply in the chat, but not in the thread.
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
