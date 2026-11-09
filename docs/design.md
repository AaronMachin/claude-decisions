# Decisions pane - design

This document outlines a Claude Code mod that takes decisions out of the chat. Claude adds each decision to a pane docked beside the transcript, every decision gets its own live discussion, and answers go back to Claude without the rest of the list scrolling away. The screens were prototyped privately. That prototype predates the Phase 1 findings (it still shows two rows of tabs and letter keys); where they differ, this document wins.

Written 6 November 2026. Items marked **(my call)** were not discussed with Aaron and can be overridden.

## Why

Today Claude puts decisions to Aaron in one of two ways, and both work badly.

- A numbered list in chat. It gets compact to fit, and a question on item 1 waits behind items 2 to 14 before it gets an answer.
- An HTML artifact. Every one has a different structure, reviewing in it is cramped, and opening it takes window focus.

Evidence from 147 of my own Claude Code sessions (15 Sep to 6 Nov 2026, counts rough):

- Batches have a median of about 3 items, a long tail to 19, and up to 47 in review registers.
- About 73 replies were "what do you mean?". Before answering, Aaron most often needed a concrete scenario, then a recommendation with its reason, then plain words for jargon.
- About 30% of answers picked an option and added a condition. Aaron sometimes proposed an option that wasn't on the list.
- Claude wrote "still open" / "still waiting on you" 253 times, re-carrying questions through prose. 38 compactions in the same window, and decisions were re-asked across sessions.
- Artifact comment threads were used 75 times, the nearest existing thing to discussing one decision on its own.
- About a third of large batches had one decision depending on another.

## Goals

- Every decision has the same structure, so reading the tenth is as easy as reading the first.
- Each decision has its own live discussion. A question on decision 1 gets an answer on decision 1 straight away, and the discussion can change the decision (add an option, move the recommendation), not just end in yes or no.
- Claude keeps working on whatever doesn't depend on an open decision.
- Decisions are never lost: they survive compaction, `/clear` and new sessions (kept on disk; since 10 November the pane shows only the current session's, decision 192).
- It looks and behaves like part of Claude Code, and never takes window focus.
- The user experience is tested for whether it's intuitive, not just whether it works.
- Released as a public repository on Aaron's GitHub (AaronMachin) with quick install steps and GIFs.

## Non-goals

- An nvim integration. The mod lives in the Claude Code terminal.
- Answering from a phone (Telegram) or sharing decisions with other people.
- Writing decision records automatically when a decision is answered. A good follow-up, not v1.

## Anti-goals

It has failed, even if it works, if:

- the chat still fills with numbered lists of questions
- the pane steals focus or traps the keyboard (Esc must always get you back to the prompt)
- it becomes another place where decisions are forgotten
- it looks like a web page squeezed into a terminal (chips, rounded buttons, mouse-first)
- Claude stops working while decisions are open when it didn't need to

## What Aaron decided

- **A Claude Code mod**, not nvim and not artifacts. It should complement the terminal Claude runs in, not sit outside it.
- **A common machine-readable format** for decisions, with Claude taught how and when to use it by the mod itself. No separate skill.
- **Live discussions on each decision**, not a question at the end.
- **Who replies in a discussion is a setting**, chosen in `/config`: the main session, a fork, or a quick model call (the side agent was dropped from the first release after the spikes).
- **Screens look as close as possible to how a mod really renders**: character cells, inverted focus row, key hints as dim text.
- **Testing means the user experience**: is it intuitive, how does it feel.
- **Done means a public repository** under AaronMachin with a README of quick install steps and GIFs. Aaron captures the GIFs and wants prompting for them, with a shot list, once it's ready.
- **`ctrl+x tab` clashes** with Aaron's nvim, so the focus key has to be movable and the README must say how. Aaron's own setup now uses `ctrl+q` ("questions"), set in `~/.claude/keybindings.json` on 6 November.

## How it works

### Kinds of decision

Every decision has the same parts in the same order: a plain title that makes sense on its own, what happens today (a concrete scenario), the options with what each changes, a recommendation with its reason, sources (file:line or links), and the discussion. The kind only changes what the numbered options say: every kind answers with numbers, not its own letters (Aaron, 6 November, prototype test).

| Kind | What the person does | Keys |
| --- | --- | --- |
| choice | pick an option, accept the recommendation, or add a condition in the discussion | the option's number (`10` for a tenth) |
| go-ahead | yes or no to an action with side effects (push, write to staging) | `1` yes, `2` no |
| assumption | right or wrong, on something Claude already assumed and is carrying on with | `1` right, `2` wrong |
| finding | a review finding | `1` agree, `2` already decided, `3` disagree, `4` not sure |
| question | a fact only the person knows; typed in the discussion, then marked answered | `m` |

Choosing is two steps (Aaron, 6 November). Typing a number highlights that option without choosing it; typing more digits moves to the longer number (`1` then `0` highlights option 10), and up/down move the highlight. `enter` then confirms, saves the answer and takes you back to the list. `a` highlights the recommended option, also confirmed with `enter`. With nothing highlighted, `enter` opens the decision's discussion as before. **(my call)** `b` clears a highlight first, and goes back to the list when nothing is highlighted.

Every kind can be parked with a reason (`p`). A message in the discussion only discusses; it never answers the decision. Once the discussion has settled it, `d` (done) marks the decision answered, and Claude gets the answer together with the whole discussion. On the assumptions batch, `r` marks the rest right. Both are confirmed with `enter`.

Since 10 November (decision 170) each option row carries its own number key: pressed with the ring elsewhere it highlights that option, pressed again (or `enter`) on the highlighted option it answers. Options that don't all fit are paged with `o`, and the numbers of options on other pages stay in the key line, so every number works on a 9-row pane (decisions 172, 179). Things the person has to do themselves (sign in, run a command) are not decisions and sit in a separate "For you to do" group.

### States

open, live (a discussion is running), ready (answered, not yet sent), sent, parked (with a reason), superseded, withdrawn. History is kept: every revision of options or recommendation is recorded in the discussion as a `↻` line, and each earlier version of the decision can be opened from it, the way you'd scroll back in the chat. An answered decision still shows all its options with the chosen one marked, not only the answer.

A decision can name decisions that depend on it. Changing its answer re-opens them, and the pane says so.

A decision can be marked as blocking. Claude carries on with work that doesn't depend on open decisions, and says in one line what it's waiting on.

### Data format

One record per decision, grouped by the piece of work it belongs to (a ticket, a PR review, a plan). Fields, as a first pass:

- `id`, `group`, `kind`, `title`, `scenario`
- `options`: id, label, what it changes, and whether it came from a discussion
- `recommendation`: option id and reason
- `sources`: label and path or URL
- `dependsOn`, `blocks`
- `state`, `parkedReason`
- `answer`: chosen option (optional), free text, condition
- `thread`: who (person, Claude, fork, quick model), text, time
- `revisions`: what changed and when

Decisions belong to the project, not the session. **(my call)** The project is the repository, shared by all its git worktrees, so a decision made in a worktree shows from the main checkout too. They are stored as files outside the repository, under `~/.claude/decisions/<project>/`, one JSON file per decision, so they're readable by any tool and never committed by accident. The mod's tool definition defines the schema.

Since 10 November each decision also records the session that added it, and the pane shows only the current session's (Aaron, decision 192). The files still live per repository; a decision from before `/clear` is reached by resuming that session.

### What Claude does (taught by the mod's instructions and tool)

- Puts every decision in the pane through the mod's tool, and writes one line in chat ("Added 6 decisions to the pane for Sharing links, 3 blocks the plan"), never the list.
- Writes a scenario and a recommendation with a reason for every decision, with plain titles and no shorthand only Claude understands. A finding's title starts with the area it's about ("Image upload size limit: one user can use up another's quota"), so it can be found by scanning the list.
- Checks the pane before asking anything, and never re-asks something already answered or parked.
- Keeps working on anything that doesn't depend on an open decision.
- When answers arrive, acts on them and marks them sent. A condition in the answer is treated as part of the answer.
- For a large review, only the findings that need the person go in "needs you". The rest go in the folded "Claude's call" or "Already decided" sections.
- Diagrams in a discussion are drawn as text in the thread. The terminal's `Image` element can show a picture in kitty, Ghostty and iTerm2 3.5+. Anything bigger goes in an artifact that is linked from the decision and never opened automatically.

### Making Claude use it instead of asking in chat

Aaron asked for solid integration, so the pane replaces questions rather than sitting beside them. There is no skill: a skill only loads when Claude thinks it applies, and the mod can carry its own instructions. The mod uses several layers:

- **The essentials live in the tool's description (Aaron, 6 November, after the spikes).** On Aaron's machine, which has a managed security plugin, that plugin skipped the mod's `prompt.compose` and `prompt.context` hooks with the mod loaded through `--plugin-dir`, and only the tool's description reached Claude, cut at 4,096 characters. Whether a marketplace install is skipped the same way wasn't tested, and is why both routes are kept. So the rules, the format and a short example go in the first 4,096 characters of the tool description, the one route seen to work. The mod doesn't try to get round the security plugin.
- **Also in the system prompt where it's allowed.** While the mod is on, it adds a section through `prompt.compose`: put decisions, questions, assumptions and go-aheads in the pane, never as a list in chat; write one line in chat saying what was added; write a concrete scenario and a recommendation with its reason for every decision; plain titles; keep working on anything that doesn't depend on an open decision. Keep it short, because it's in context on every turn.
  On machines whose security plugin skips this hook, the tool description carries it alone, so the two must say the same thing. The section has to stay the same for the whole conversation: a system prompt that changes mid-conversation isn't sent, or costs the prompt cache.
- **The format lives in the tool.** The mod's tool definition (its description and input schema) carries the decision format and the kinds, so Claude sees them exactly when it's about to use them, and a malformed decision is refused with a reason. The tool is registered with `isDeferred: false` (otherwise it sits behind ToolSearch and Claude never sees the format) and returns a string.
- **What's open.** **(my call)** A `decisions_list` tool returns the open, parked and recently answered decisions, and the tool description tells Claude to call it at the start of a conversation and after compaction or `/clear` (in the spikes, Claude knew nothing after `/clear`). Where `prompt.context` isn't skipped, the full list also goes in at the start and after compaction or `/clear`, then each turn only carries what changed. To try early in the build: adding a short message to the conversation at those points (`$.session.append`), in case the security plugin lets that through.
- **AskUserQuestion goes to the pane.** A `tool.call` hook on `AskUserQuestion` turns its questions into decisions in the pane and returns straight away (a hook can't wait for a person: it gets 10 seconds). **(my call)** Claude carries on with other work, or ends its turn if nothing else can go on, and the answers wake it as a new prompt. The hook answers with an object, `{ questions, answers: {} }`, with "added to the decisions pane as 1-2" as context: in the spike Claude read that as pending and didn't invent answers. A plain string is refused, and `{ deny }` shows the person a red error row.
- **Only the main session adds decisions.** **(my call)** Subagents, review panels included, report back to the main session, which triages and adds to the pane. One owner per decision, and "needs you" stays a judgement the main session makes. Calls carry an `agentId`, so the tool can refuse a subagent with a reason.
- **A nudge when it slips.** When a turn ends with questions to the person written in chat (for example two or more numbered questions, or "should I...?"), the mod adds a reminder for the next turn to move them to the pane. How it detects them is left to the builder, but it needs tests for both a miss and a false alarm.
- **Answers arrive as one structured prompt.** Each answer comes with the decision's id, the choice, any condition, and the outcome of its discussion, so Claude knows exactly what was decided.

This gets tested like the rest of the experience: replay sessions that produced long question lists and count how many questions still appear in chat (target: none), plus an eval suite (`claude plugin eval`) of prompts that normally lead to questions. Each eval run starts with a setup script kept in the repository that makes a small git project with a few commits, so prompts like "review the last commit" have something to work on (Aaron, 6 November). About $0.13 per three-prompt run.

### The pane

- In the fullscreen layout the pane docks beside the transcript (from 110 columns, up to 45% of the width). On the main-screen layout (tmux's default) it sits inline above the prompt.
- It opens by itself when Claude adds decisions only if the terminal is at least 144 columns wide (110 once the person has opened it before). Otherwise the status line shows the count and `/decisions` opens it.
- The status line always shows open / discussing / ready counts.
- The pane shows whether it has the keys right now. `ctrl+q` is a toggle with no cue of its own, and in a spike a key meant for the pane went to Claude instead.
- The keys under an expanded item stand apart from its text (spacing and a different style), so they read as actions, not part of the description.
- Sending answers opens a review screen of everything ready, all ticked. Untick any to hold them back, then confirm (Aaron, 6 November, prototype test).
- **(my call)** A pane the person hid (`h` or `ctrl+x x`) stays hidden when Claude adds decisions. The status line count goes up, and `ctrl+q` / `/decisions` brings it back.
- **One row of tabs, sections inside (Aaron, 6 November, after the prototype test).** Each tab is where decisions came from (a ticket's work, a PR review, Parked). Inside a tab, "Needs you" is open at the top, with "Claude's call" and "Already decided" as folded headings with counts beneath. Nothing needing the person is hidden behind a filter. In the prototype test the old two rows of tabs weren't seen as tabs, and their purpose wasn't clear.
- Screens: the list, one decision with its discussion, assumptions batch, findings triage with "needs you" open at the top, and the main-screen layout. All prototyped privately, in their pre-findings form.
- **The band (Aaron, 10 November, decision 157).** While decisions wait and the prompt has the keys, one line above the prompt names how many and the focus key: "3 decisions waiting · ctrl+x tab to answer, your draft stays". It names the key from the Focus key setting (decision 190), since the mod can't read a rebound key.
- **The look (Aaron, 10 November, decision 170).** The title in bold with keys on/off at the right, a dim crumb under it, thin rules between header, context, options and keys, the highlighted option or row as a card bordered in the `claude` colour, key hints as `k: label`, tabs as chips with the open one on the `claude` colour.
- **Short panes (decisions 158, 161, 170 to 183).** Below 14 rows the pane is compact: no card borders (the ringed row is tinted and starts `›`), rules only where they fit, the keys under the title, and every screen paged with `o` so nothing scrolls and every number key stays armed. Taller panes page a decision's options too when they don't all fit.
- **The ring (decision 159, 166, 167).** The row the ring is on starts with `›`, taken from the engine's `ui.focus` event. Up and down don't reach the tab strip; `t` changes tab.
- **Tabs (Aaron, 10 November, decision 186).** The pane opens on the tab with the newest decision waiting, each tab shows its count, and a tab with nothing waiting says which tab has some.
- **This session only (Aaron, 10 November, decision 192).** The pane, the status line, `decisions_list`, sending and the session note show only the decisions the current session added.

### Keyboard

- `ctrl+x tab` (Claude Code's `abovePrompt:focus` action, `ctrl+q` in Aaron's setup) moves into the pane, and pressed again goes back to the prompt. `esc` always goes straight back to the prompt, and whatever was half-typed there is still there. A mod can't take `esc`.
- `enter` opens a discussion, `b` goes back to the list, `ctrl+x x` hides the pane, `/decisions` opens and focuses it.
- Hotkeys are single letters or digits only (the mod API refuses anything else).
- Inside an nvim terminal tab with Aaron's config, `ctrl+x` leaves typing mode, so no `ctrl+x` chord reaches Claude Code, `ctrl+x x` included. The pane needs its own hide key (`h`) so closing it never depends on `ctrl+x x`, and the README should mention that terminal multiplexers and editors can swallow `ctrl+x` chords.
- The README shows how to move `abovePrompt:focus` to another key in `~/.claude/keybindings.json`.

### Discussions

A message typed in a decision's discussion goes straight to whoever replies (it never waits for `s`), and the reply always shows in that decision's thread. With the main session replying, it also shows in the chat.

Every decision keeps its whole thread for good: questions, replies, revisions and the final answer. Switching between decisions, or going back to one that was answered, sent or closed days ago, shows the full discussion in the pane, whichever mode replied and however long ago it scrolled out of the chat or was compacted away (Aaron, 6 November). The reply can revise the decision: add an option, change the recommendation, re-open dependents.

Who replies is the `Discussion replies` setting: main session, fork or quick model. **The main session is the default (Aaron, 6 November: "it's the best option")**. The side agent is left out of the first release (Aaron, 6 November): in the spike its report also landed in the main conversation and Claude stopped mid-task to comment on it.

- **main session** (default): the question goes to the main conversation as a prompt marked as coming from the pane. Claude's reply appears in the main chat as normal, which Aaron is happy with (6 November), as long as the mod shows it properly: the question and reply are mirrored into the decision's thread, and in the chat the question row is labelled with the decision it belongs to ("on 3 · When a shared recipe link expires") so it doesn't read as a stray prompt. Full context and full tools, and every exchange uses the main conversation's context. In the spike the question only reached Claude when its current turn ended (20 to 29 seconds while Claude was busy), so the thread shows "queued, Claude is mid-step" and offers a key to send that one question to the fork instead (Aaron, 6 November). The mod can't relabel its own chat rows (the engine skips a plugin's hook for something the same plugin sent), so the question it sends starts "On decision 3 · When a shared recipe link expires:". The reply is the turn that begins with the engine's "The <plugin> plugin sent ..." text, not simply the next turn to end.
- **fork**: one call (`$.model.fork`) with the whole conversation so far, served from the prompt cache. Replied in 3.5 seconds in the spike without touching the main conversation, and knew the conversation. The reply arrives whole rather than streaming. Whether it can read files is untested; if it can't, the side agent comes back up.
- **quick model**: a single model call that only sees the decision. Fastest, but no conversation and no files.

### Settings (`/config`)

| Setting | Values | Default |
| --- | --- | --- |
| Discussion replies | main session, fork, quick model | main session |
| Send answers to Claude | when I press s, straight away | when I press s (suggested, Aaron to confirm) |
| Open the pane | when Claude adds one, only when I ask | when Claude adds one **(my call)** |

## Testing the user experience

The question is whether it's intuitive, not only whether it works. In order:

1. **Prototype test before code.** **(my call)** This is the first phase of the plan, and mod code waits for its findings. The screens are made clickable in a private prototype and Aaron tries tasks with no instructions ("answer decision 3 and get back to Claude", "ask why option 2 exists", "find what you parked yesterday"). Note every hesitation and wrong key. Change layout and keys before building.
2. **Fresh agents as first-time users, each build.** A few agents with no briefing drive the real mod inside tmux and think aloud through the same tasks, at four widths: 144+ columns, 110 to 143, under 110, and tmux's main-screen layout. Good at finding missing hints and unclear keys, poor at judging feel, so they sit alongside Aaron's own use rather than replacing it.
3. **A week of Aaron's real work.** A short note each day on what was annoying. Afterwards compare those sessions with the evidence numbers above: "what do you mean?" replies, re-asked questions, carried-forward "still waiting".
4. **One or two colleagues install it cold from the README** before the repository goes public. That tests the README and whether the pane makes sense to someone who didn't design it.

Behaviour tests with `claude plugin test` cover what each screen promises (kept across restart, dependents re-open, nothing sent before `s`, esc returns focus), but they are the builder's normal practice, not the testing asked for here.

## Release

- Public repository under github.com/AaronMachin. **(my call)** Name: `claude-decisions`.
- The README opens with a GIF, then install as two commands (`/plugin marketplace add AaronMachin/claude-decisions`, then `/plugin install decisions@claude-decisions`), then the keys, how to move the focus key, and the settings table.
- GIFs: Aaron records them. When the mod is ready, prompt Aaron with a shot list: the list filling as Claude adds decisions, a live discussion that adds an option, the assumptions batch, findings triage, and the keyboard flow in and out. Recorded against the made-up demo project.
- The public repository starts clean. The README and examples use a made-up demo project (Pantry, a recipe-sharing app), and limitations to do with managed security plugins are described in general terms in the docs.

## Open Questions

- Default for `Send answers to Claude` (wait for `s` suggested).

## Left to the builder

- The mod's internal structure, tool names and schema details, within the fields above.
- Whether the fork can read files. If it can't, the side agent comes back to Aaron as a choice.
- How the main-session reply mode delivers a question (for example `$.prompt.submit` labelled as coming from the pane) without confusing Claude about who asked.
- Exact layout and wording, matching the prototype except where this document changed it. Before building the list, update the prototype to one row of tabs with sections and have Aaron re-run test task 5 (find and agree with the image upload size limit finding).

Phase 1 findings (prototype test and spikes) are in `findings/summary.md`, with the evidence in `findings/prototype-test.md` and `findings/spikes.md`.
