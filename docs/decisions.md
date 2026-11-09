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

## 6 November 2026: workstream 1, core loop (spec)

| # | Decision | Why |
| --- | --- | --- |
| 48 | Options are numbered by position (`id` 1 to 12), not lettered, and `recommendation.option` is that number **(Claude's call)** | Letter ids would sit next to the `a` key (highlight the recommendation) and read as the same thing. |
| 49 | A choice has 1 to 12 options; more is refused with "split it into two decisions" **(Claude's call)** | Digits reach 12 with the second-digit rule, and a longer list is more than a pane can show well. |
| 50 | Only the `choice` kind is accepted by `decisions_add` for now, though the type carries all five **(Claude's call)** | Claude must not add something the pane can't answer yet; workstream 3 widens the tool. |
| 51 | `dependsOn` is decision ids, `blocks` is plain words about the work it holds up **(Claude's call)** | Re-opening dependents needs ids; what a decision blocks is usually work, not another decision. |
| 52 | Decision ids are `d<n>`, one more than the highest file in the folder, retried if two sessions race **(Claude's call)** | The person says "decision 3", and a short number is what the pane and the answer prompt show. |
| 53 | Every render re-reads the decision files; no polling **(Claude's call)** | A second session's writes show on the next render with no extra machinery. Revisit if it feels slow. |
| 54 | Tabs are Buttons in the ring and `t` moves to the next one **(Claude's call)** | `[` and `]` aren't allowed as hotkeys; `t` is a letter and free. |
| 55 | Decisions answered by the person show under an "Answered" heading in their tab, with `ready` or `sent` **(Claude's call)** | An answered decision has to be findable to change before sending (D6), and the folded sections are workstream 3's. |
| 56 | Parked decisions show in a "Parked" tab, and `p` on one puts it back to `open` **(Claude's call)** | The design lists Parked as a tab; D4 doesn't say how a decision leaves it. |
| 57 | Parking asks for a reason in an Input; an empty `enter` cancels **(Claude's call)** | Every kind is parked "with a reason", and an Input swallows letter keys so `b` can't cancel. |
| 58 | `c` confirms the review screen, and `b` goes back **(Claude's call)** | `s` opens it, and a second `s` could send what was never read. |
| 59 | The mod marks decisions `sent` when the person confirms, before the prompt is delivered, and puts them back to `ready` if the submit fails **(Claude's call)** | There's no tool for Claude to mark them, and a second `c` must not send them twice. |
| 60 | The pane opens unfocused when Claude adds a decision, unless the person hid it (`h`) **(Claude's call)** | The design says so; the `/config` setting that turns it off belongs to a later workstream. |
| 61 | The pane header says `keys on` or `keys off` and doesn't name the focus chord **(Claude's call)** | The chord is the person's binding to move. |

## 6 November 2026: workstream 1, core loop (build)

| # | Decision | Why |
| --- | --- | --- |
| 62 | The "previous digit" is a plain object in the module, not in `PaneView` (replaces the `typed` field the spec listed) **(Claude's call)** | Two quick keys run before the first await settles, so it can't wait on a state write, and losing it on a reload costs nothing. |
| 63 | The pane's drawing and glue live in `hooks/pane/render.tsx`, so `register.tsx` stays wiring only **(Claude's call)** | CONTRIBUTING asks for one `on(...)` line per hook; the spec's file list had no home for the glue. |
| 64 | After the pane returns to the list, the ring is put on the list's first row 80 ms later (`$.clock.after`) **(Claude's call)** | In the real session the ring otherwise landed on whichever row the engine picked, so `enter` could open an answered decision instead of the one waiting. |
| 65 | Focusing the park Input is also done 80 ms after it appears **(Claude's call)** | `autoFocus` only applies when the pane first takes the keys, so typed words went to the pane's hotkeys. |
| 66 | The digit row is drawn as the engine draws a hotkey Button (`1: 1  2: 2`) and shown dim under the rule **(Claude's call, for a person to try)** | The spike drew it that way and it reads as a key hint; nobody has judged it yet. |
| 67 | The 1000 ms gap for a second digit stays **(Claude's call, for a person to try)** | The real session only used single digits, so there is still no data on what feels right. |
| 68 | `sendTicked` returns `{ sent, settled }`, where `settled` resolves with a notice if the submit failed **(Claude's call)** | The submit isn't awaited (it waits for Claude's turn to end), but a failure still has to put the answers back and tell the person. |
| 69 | A mod's `$` can't be put in an object or passed to an arrow function, and a state reference has to be written in the file that uses it, so state is read and written only through `setView` and `readView` in `decision.tsx` **(Claude's call)** | The engine refused to load the mod otherwise; it's a rule of the mod API, not a choice, but it shapes where code can go. |

## 7 November 2026: workstream 2, discussions (spec)

| # | Decision | Why |
| --- | --- | --- |
| 70 | The thread is its own screen, reached from the `Discuss` Button; `b` goes back to the decision **(Claude's call)** | D3 says `enter` with nothing highlighted opens the discussion, and the decision screen has no room for a growing thread. |
| 71 | The question box is closed until `enter` on an `Ask a question` Button; an empty `enter` cancels **(Claude's call)** | An open Input swallows hotkeys (row 57), so `d`, `f` and `b` would type letters. |
| 72 | `f` sends a stuck question to the fork; `o` and `n` page the thread; `d` highlights `Mark answered` **(Claude's call)** | None of them is used by another workstream's keys (D4), and `f` stands for fork. |
| 73 | A revision is a `claude` thread entry starting `↻ ` with a `revision` index into `revisions`, and the `↻` line is a Button that opens the earlier version **(Claude's call)** | One ordered thread, and the line goes out with the answer prompt with no change to `send.ts`. |
| 74 | `decisions_update` takes `id`, `summary`, `addOptions` and `recommendation`; it is refused for `sent`, `superseded` and `withdrawn` decisions **(Claude's call)** | The prompt asks for "add an option, move the recommendation"; a sent answer can't be revised under the person. |
| 75 | `d` then `enter` marks a decision `ready` with the text "settled in the discussion, see below" and no option **(Claude's call)** | The discussion holds what was decided and the answer prompt sends all of it. |
| 76 | Pending questions live in `$.state` with the id of the load of the mod that holds them, never in the thread **(Claude's call)** | A reload leaves a question nothing will answer, and the thread must never hold one as "queued". |
| 77 | A reply is written directly under its question, and a reply to a `sent` decision is kept without changing its state **(Claude's call)** | Two questions asked in a row each keep their own reply. |
| 78 | Resending a queued main-session question to the fork doesn't cancel it; its reply lands in the thread too **(Claude's call)** | `$.prompt.submit` can't be cancelled, and dropping a reply Claude already wrote loses information. |
| 79 | The main-session reply is matched by `plugin sent "On decision` and the sent text, not by order **(Claude's call, from Phase 1's wrong-turn bug)** | Two questions can queue, and the next turn to end may belong to something else. |
| 80 | The fork's prompt carries the decision and says it can't read files; the quick model gets only the decision; both answer in at most four sentences **(Claude's call)** | Spike 0 (S3) found the fork can't read files, and a pane reply has to be short. |
| 81 | `chooseOption`, `parkDecision` and `unparkDecision` re-read the file before writing **(Claude's call)** | A reply landing between a draw and a keypress would otherwise be overwritten with the older copy. |
| 82 | The thread shows the newest entries that fit the pane's rows, and `o` and `n` page through the rest **(Claude's call)** | Hotkeys only work for Buttons wholly in view, so the key row can't scroll out. |
| 83 | The setting is `discussionReplies` with the values `main session`, `fork`, `quick model`, read when the module loads **(Claude's call)** | M4 names the setting; a change in `/config` reloads the module. |
| 84 | After a fork or quick reply, `m` re-asks that same question to the main session, shown as `m ask main session` **(Claude's call, Aaron's coordinator asked for it if small)** | A fork reply that says it can't see files is otherwise a dead end short of changing the setting. |
| 85 | Anything that calls `$.model.fork` or `$.model.complete` is tested with a plain fake `$`, since the kit's `$` has no `$.model` and `on('model.fork')` doesn't stand in for it **(checked 7 November)** | The kit refuses the call with "undefined is not an object (evaluating '$.model.fork')". |

## 7 November 2026: workstream 2, discussions (build)

| # | Decision | Why |
| --- | --- | --- |
| 86 | `discuss.ts` reaches the pane's state through a branch (`setState`/`readState`) that tests can switch to an in-memory copy, not through a replaceable function **(Claude's call)** | The kit gives a test body no `$.state`, and the mod API only lets `$` be passed to a function declaration, so a swapped function can't take it. |
| 87 | `f` and `m` reuse the question already in the thread, so a resend adds a reply under it, not a second copy of the question **(Claude's call)** | The thread then shows one question with every reply it got. |
| 88 | The main-session reply turn is found by the sent text itself, with the `plugin sent` framing only as a second check, not by `plugin sent "On decision` **(Claude's call, from a real session on Claude Code 2.1.319)** | The engine's framing changed since Phase 1: the turn's text is now `The decisions plugin sent a message:` then the sent text, so matching the old quoted form never found the reply. |
| 89 | Opening a decision from the list, and going back to it from the thread, puts the ring on `Discuss` 80 ms later **(Claude's call, found in a real session)** | `enter` on a freshly opened decision pressed an option the ring happened to land on, so it answered the decision instead of opening the discussion (D3). |
| 90 | A reply goes at the end of its question's group (after the question and anything already under it, before the next question), not directly under the question (replaces row 77's placement) **(Claude's call, found in a real session)** | A late main reply after a fork reply landed above it, out of order, and the newest-first window then hid it. |
| 91 | `f` resends only the open decision's own stuck question; pending entries and waiters are matched by decision as well as by the question's time **(Claude's call, from the review)** | Two decisions can have a question at the same millisecond, and `f` on one thread must not send another's. |
| 92 | The thread counts 18 fixed rows and 15% more text rows than characters say, and a single entry too long for the room is cut with `…` **(Claude's call, from the review)** | The key row has to stay in view for the hotkeys to work, and words wrap earlier than characters alone suggest. |

## 7 November 2026: workstream 3, kinds and reviews (spec)

| # | Decision | Why |
| --- | --- | --- |
| 93 | The tool fills the options for go-ahead, assumption, finding and `isTask` decisions, and refuses options on them **(Claude's call)** | Every finding then reads the same, and the keys (D4) can't drift from the labels. |
| 94 | `isTask` is a flag on a `go-ahead` with options Done and Can't do it, not a sixth kind **(Claude's call)** | The design says "For you to do" isn't a kind. |
| 95 | The groups inside a tab run Needs you, Claude's call, Already decided, Answered **(Claude's call)** | D8 puts the two folded headings directly under "Needs you"; Answered would otherwise push them down. |
| 96 | A folded section opens with `enter` on its heading, and opening one folds the other **(Claude's call)** | `enter` acts on the ring everywhere (D3); one open section keeps the list to one page. |
| 97 | The status line and `decisions_list` count only "Needs you" and tasks **(Claude's call)** | 30 findings in "Claude's call" are not 30 things waiting on the person. |
| 98 | An open section pages with `n` and `e` when its rows don't fit **(Claude's call)** | A key only works when its Button is wholly in view, so a long list can't push the key row out. |
| 99 | The assumptions batch is its own screen, reached from one row at the top of "Needs you"; the individual rows stay in the list **(Claude's call)** | The person wants to see the assumptions together to spot the wrong one, and nothing should hide behind a screen. |
| 100 | On the batch screen `r` marks only unanswered, unmarked rows, then moves the ring to `Confirm` **(Claude's call)** | D3: a key highlights and `enter` confirms; a row already marked Wrong must survive `r`. |
| 101 | Changing a `ready` decision's answer reopens its `ready` dependents one level deep; `sent`, `parked` and open ones are left **(Claude's call)** | Claude can't un-act on a sent answer, and a cleared answer decided nothing for its own dependents. |
| 102 | A reopened decision carries `reopenedBy`, shown only while it is open or live, as a dim second line in the list and a line on its screen **(Claude's call)** | Answering again then clears it with no extra write, and the person sees what they had answered. |
| 103 | Parked rows show the group and reason on a dim second line, not at the right edge **(Claude's call)** | A long reason at the edge cut the title. |
| 104 | No field or check for a finding title starting with its area **(Claude's call)** | The area can't be told from the text; the rule stays in workstream 4's wording and evals. |
| 105 | `reopenDependents` is in a new `hooks/dependents.ts`, and the 47-finding fixture is seeded by a script through `addDecision` **(Claude's call, asked in the spec)** | A cycle between `decision.tsx` and `sections.tsx` otherwise; 47 model-made calls add cost, not evidence. |
| 106 | Section paging uses `n` (toward the end) and `o` (toward the start), the thread's keys, replacing `e` in row 98 **(approved by the coordinator)** | Paging reads the same on every screen. |
| 107 | `decisions_update` also takes `section`, refused for a `ready` or `sent` decision **(approved by the coordinator)** | Claude can move a finding into "Needs you" once a discussion shows it needs the person. |

## 7 November 2026: workstream 3, kinds and reviews (build)

| # | Decision | Why |
| --- | --- | --- |
| 108 | `options` and `recommendation` are no longer in the add schema's `required` list; the tool refuses a choice without them, with the reason **(Claude's call)** | Four of the five kinds must not carry options, and a schema that demands them would push Claude to invent some. |
| 109 | `FIXED_OPTIONS` carries a one-line `changes` for every fixed option, written by the tool **(Claude's call)** | Every finding reads the same and the pane's option lines are never empty. |
| 110 | The fixed options live in `hooks/kind-options.ts`, re-exported by `hooks/pane/kinds.tsx` **(Claude's call)** | `tool.ts` and the seed script run outside the pane, and `kinds.tsx` imports the pane's state module, which a plain Node run can't load. |
| 111 | On the batch screen `1` and `2` act on the row the pane last saw the ring on, or the first open row when it has seen none **(Claude's call)** | The digit keys are not tied to a row, so the ring's last known place is the only row there is. |
| 112 | `enter` on a marked batch row saves that row only and moves the ring to the next open row; `Confirm N` saves all marks and returns to the list **(Claude's call)** | One row at a time is how the person would walk down the list, and `Confirm` is the single step for `r`. |
| 113 | The fixture is `hooks/pane/review-47.ts` (an exported array), not a JSON file, and holds 12 findings for the person, 24 Claude's call and 11 already decided **(Claude's call; the spec's "6" for the person was an arithmetic slip, 6+24+11 is 41)** | The test kit refuses to load a `.json` import ("not named like code"). Answering six of the twelve gives the 6 / 24 / 11 / 6 split in the spec's mock-up. |
| 114 | A reopened dependent also moves to "Needs you", whatever section it was in **(Claude's call, found in a real session)** | It stayed under "Claude's call" at first, folded, so a decision that needed the person again was hidden. |
| 115 | Answered rows give way to a `N more answered` line when the pane is short: 3 while a folded section is open, otherwise what the pane has left **(Claude's call, from the review)** | With 47 findings the answered rows pushed the key row out of view, and the hotkeys only work for Buttons in view. |
| 116 | "Needs you" pages with `n` and `o` like the folded sections, using the same page number; while a folded section is open it stays on its first page with a line saying how many more need the person and to fold the section to page them **(Claude's call, asked by the coordinator)** | With many findings for the person the key row could leave the pane. The two lists share one page number, so only one is paged at a time. |

## 7 November 2026: workstream 4, Claude integration (spec)

| # | Decision | Why |
| --- | --- | --- |
| 117 | Every `AskUserQuestion` decision goes to one group, `Questions from Claude`, and the question's header starts the scenario **(Claude's call)** | Headers differ on every call and would give each question its own tab. |
| 118 | A multi-select question becomes kind `question` with its options listed in the scenario **(Claude's call)** | A choice takes one answer. |
| 119 | `AskUserQuestion` decisions carry no recommendation **(Claude's call)** | The tool has no such field and the store allows a choice without one. |
| 120 | A `decisions_update` or `AskUserQuestion` call with an `agentId` is refused like `decisions_add` **(Claude's call)** | A subagent editing the pane has the same owner problem. `decisions_list` stays open. |
| 121 | The nudge skips a turn that replies to a discussion question (last user message holds "On decision <n>") **(Claude's call)** | A reply in a thread may properly end with a question. |
| 122 | `isQuestionsInChat` gains a mid-text rule ("should I", "do you want", "would you prefer", "which would you prefer") and a narrow exemption for "want me to carry on?" offers **(Claude's call)** | The spike missed mid-text questions and would flag courtesy offers. |
| 123 | The nudge is two sentences naming the pane and the one-line rule **(Claude's call)** | The prompt left the text to the builder. |
| 124 | Five eval cases: plan-sharing, review-last-commit, what-next, ask-me-first, find-problems **(Claude's call)** | The prompt asked for plan, review, "what next" and a tempting prompt at least. |
| 125 | The compose section id is `decisions:rules`, a constant string, `scope: 'session'` **(Claude's call)** | Plugin sections are `<plugin>:<name>`; a constant keeps the prompt cache. |

## 7 November 2026: workstream 4, Claude integration (build)

| # | Decision | Why |
| --- | --- | --- |
| 126 | One `on` per event without a matcher: the nudge runs inside the existing `turn.complete` hook, after discussions' work **(Claude's call, forced by the engine)** | The engine refuses a second unmatched `on("turn.complete")` ("registered twice without a matcher"). Every hook this workstream adds to an event the mod already uses goes inside the existing one. |
| 127 | A free-text, number or multi-select AskUserQuestion becomes kind `question`; number questions add "Answer with a number from min to max" to the scenario **(Claude's call)** | A choice takes one answer and a question has no numbered options; the min and max would otherwise be lost. |
| 128 | The tool description is 3,947 characters, with a test at 4,000; its example loses one `changes` clause and the "keep every field plain" line; refusals are summarised **(Claude's call)** | Room for the four additions and a 96-character margin before the cut. |
| 129 | `RULE_PHRASES` in `integrate.ts` lists the phrases both the description and the system prompt section must carry, and the tests check both against it **(Claude's call)** | "Both say the same thing" (D10) is then a test rather than a hope. |
| 130 | The answer prompt says "Do not write decision records or other files about the answers unless the person asks." after the condition sentence **(Claude's call, wording; the line was asked for)** | Log 2026-11-07 00:10. |
| 131 | The session note is "The decisions mod is on: put questions in the decisions pane with decisions_add, and call decisions_list first."; it is appended at `session.start` (skipped when a reload finds it), on the first prompt when `turns()` is 1 or less, and on the first prompt after a compaction **(Claude's call)** | Spike 0 S2 found append reaches Claude at those points; the prompt after a compaction is a guess checked in a real session. |
| 132 | A `session.compact` hook (main conversation, not `precompute`) adds "Keep the ids and titles of the open, answered and parked decisions in the decisions pane." to the summary's instructions and flags the note for the next prompt **(Claude's call, approved in the plan)** | Appending inside the compact hook, mid-rewrite, was not tried. |
| 133 | The system prompt section and the context block are plain functions (`addRulesSection`, `addContextBlock`), wired in `register.tsx`, and nothing tries to avoid a managed security plugin that skips them **(Claude's call)** | D10. |
| 134 | The eval workspace's last commit is a deliberate bug (times shown multiplied by 60) under a misleading message **(Claude's call)** | "Review the last commit" then has a real finding to raise as a decision. |
| 135 | Every eval case allows `AskUserQuestion` and Bash limited to git, and shares one scaffold script through a two-line `fixture.sh` **(Claude's call)** | The temptation exists in every case; one script is kept in step. Falls back to a copy per case if the engine refuses the path. |
| 136 | `evals/results/` is git-ignored **(Claude's call)** | The eval writes its reports there. |
| 137 | The description names review findings and says they go in the pane one each, and the setup script leaves `last-commit.diff` beside the code **(Claude's call, from eval run 2)** | Without it, a "find problems" review gave the findings in chat and added none; and git was blocked in the eval sandbox, so "review the last commit" had nothing to read. |
| 138 | The first prompt after a session start that appended the note does not append it again **(Claude's call, found in a real session)** | The transcript doesn't show an appended message until a turn has run, so Claude saw the note twice. |
| 139 | Corrects rows 128 and 135: the description is 3,968 characters after row 137, and the eval cases allow plain `Bash` in `allowed_tools` (the run grants `Bash(git:*)` on the command line) **(Claude's call, from the review)** | Rows are not edited. |

## 7 November 2026: workstream 5, ux-testing (build)

| # | Decision | Why |
| --- | --- | --- |
| 140 | The replay harness drives Claude with `claude -p` (headless, `--plugin-dir`, `--resume` between prompts), not tmux **(Claude's call, approved route)** | A probe on a Pantry project showed the add tool, the store and the session note all work headless (the note reached Claude on every turn). The nudge text from `turn.complete` did not appear in the transcript after a turn that ended with a chat question, so the harness cannot observe "nudged" and reports what `isQuestionsInChat` says about the reply instead. |
| 141 | The testers' seed store has 78 decisions: 3 choices (decision 2 with 12 options, decision 3 recommended), 6 assumptions, the 47-finding review plus 20 more needing the person (32 in all), one parked, one answered with a discussion **(Claude's call)** | Covers the unseen list (two-digit keys, more than 9 options, paging, the Image uploads tab) without a model turn. The review's `dependsOn` ids are shifted by the choices added before it. |
| 142 | `hooks/pane/seed-review.ts` runs its `main` only when it is the script being run, so the seed script can import its store **(Claude's call)** | Avoids copying 25 lines. |
| 143 | The add description has a REVIEWS paragraph: when asked to review, audit, check or find problems (even "tell me what to do about them"), every problem is one finding decision, and the chat reply is only the count; other sentences trimmed to stay under 4,000 characters **(Claude's call, from workstream 4's carry-over)** | Before: find-problems 0.67 and review-last-commit 0.67 (0 decisions added in each, one run each on merged main). After: both 1.00 (3 and 1 decisions added), one run each. One run per case is a small sample. |
| 144 | The pane says what the keys do: "keys off: /decisions" in the header, "Type a number (or a), then enter to confirm." on option screens, and "Enter ticks or unticks a row, c sends." on the Send screen **(Claude's call, from tester A)** | Tester A made about 6 dead presses on option keys, could not tell how to get the keys while typing, and went back instead of sending. |
| 145 | The detector's rule is exposed as `whyQuestionsInChat` (list, last or mid) and `isQuestionsInChat` calls it, so the replay can report which rule flagged a turn **(Claude's call)** | No behaviour change; the replay needs the rule. |
| 146 | `turn.complete` is tested through `register.tsx` (a question list gets the nudge once, a statement gets none); `session.compact` is not, because the test kit's `next` hands the hook an argument without a messages list and the engine skips the module's hook **(Claude's call, kit limit)** | The function tests for `onCompact` stay; the hook was seen in a real session by workstream 4. |
| 147 | The store folder for a working folder is remembered once git has answered (a failed or empty git answer is not remembered) **(Claude's call, from testers A and B)** | Every redraw read the store, ran git, and a redraw replaced by a newer one aborted it and showed "ui.render hook skipped" in the conversation. |
| 148 | An empty discussion says "No discussion yet. Ask a question below."; a parked row shows "parked 6 Nov" (the day the decision was last changed, in UTC) **(Claude's call, from the testers)** | Four testers took an empty discussion for broken, and "what you parked yesterday" had no date to check. The date is the last change, so a later message in a parked decision's discussion moves it. |
| 149 | The pane's keys-off line reads "Press the pane focus key (ctrl+x tab unless you moved it) to use it with a draft kept, or run /decisions with an empty prompt." and replaces row 144's "keys off: /decisions" in the header **(Claude's call, replaces part of 144)** | `/decisions` hands a draft back and turns keys off; only the focus key keeps it. The mod can't read the person's own binding, so it names the default. |
| 150 | A parked decision records `parkedAt` and the Parked row shows that day in the person's local time; it replaces row 148's "last change" date **(Claude's call, from the branch review)** | A later thread message re-stamps `updatedAt`, so the earlier date moved. |
| 151 | The replay's counter counts every sentence ending in a question mark outside code (minus a bare offer to carry on), broader than the spec's list-and-phrases rule, and counts all assistant text in a turn (stream-json), not only the last message **(Claude's call)** | It must differ from the detector so disagreements show, and a question asked before a tool call still lands in chat. |

## 7 November 2026: workstream 6, release

| # | Decision | Why |
| --- | --- | --- |
| 152 | The repository is its own marketplace: `.claude-plugin/marketplace.json` is named `claude-decisions` and lists one plugin, `decisions`, with `source: "./"` **(Claude's call)** | That is what makes `decisions@claude-decisions` resolve, and keeps one install path (row 41). |
| 153 | The README's settings section lists only `Discussion replies` and says it is the only setting in 0.1.0; the `Open the pane` setting M4 names is not built **(Claude's call, approved by the controlling session)** | The README describes what exists. The pane opens when Claude adds a decision unless the person hid it (row 60). |
| 154 | The README shows the two install commands (`/plugin marketplace add`, then `/plugin install decisions@claude-decisions`), not the one-line `--marketplace` form, and the cold install uses exactly those two **(Claude's call, approved by the controlling session)** | The design settled on two commands; testing the ones the README shows is the point of the cold install. |
| 155 | The demo seed is 15 decisions in two tabs (2 choices, 5 assumptions, 8 findings across the three sections, one parked), and `make-pantry.sh` deletes the eval's `last-commit.diff` from the demo folder **(Claude's call, approved in the plan)** | Every shot fits one screen at 160 columns, and the diff is an eval aid, not part of the app. |
| 156 | The shot list opens the seeded pane with `/decisions` on an empty prompt, and shot 5 opens it and leaves with `esc` before the draft is typed **(Claude's call, from the trial sessions)** | The focus key does nothing while the pane is closed, and a seeded project's pane stays closed until something is added or `/decisions` runs. |

## 10 November 2026: Aaron, after the first-time-user test

| # | Decision | Why |
| --- | --- | --- |
| 157 | While decisions are waiting and the prompt has the keys, a one-line band above the prompt names them and the focus key: "3 decisions waiting · ctrl+x tab to answer, your draft stays" (Aaron, option C) | Testers lost or sent their half-typed message trying to reach the pane; the band sits where they are looking. The mod can't read a rebound key, so the band names the default. |
| 158 | Under about 14 rows the pane uses a compact layout: one line per option, the description only for the highlighted option, key hints in one line under the title, `o` for more options. Taller panes keep row 136's layout (D9) unchanged (Aaron, option B) | Under 110 columns and on the main screen the pane is 9 to 11 rows, and a number key only presses a button fully in view, so on tall decisions no number worked. |
| 159 | The highlighted row gets a `›` in front where the engine lets the pane know it; up/down no longer reach the tab strip; the assumptions row reads "Check N assumptions together (enter)"; at narrow widths the meta ("2 options · open") is dropped before the title is cut (Aaron) | Testers missed the reverse-video highlight, switched tab by accident, read the batch row as a heading, and couldn't tell truncated titles apart. |
| 160 | Aaron runs the cold install on a machine without the managed security plugin, which also shows whether the system-prompt layer arrives (Aaron) | A fresh HOME stops at the login screen, and that machine is the only place the system-prompt layer can be seen. |

## 10 November 2026: workstream 7, ux-fixes (spec)

| # | Decision | Why |
| --- | --- | --- |
| 161 | The pane uses the compact layout when `scroll.bodyRows` is under 14 **(Claude's call, to be checked against real `bodyRows` in sessions 1 and 2)** | The testers saw about 9 rows inline at 90 columns and 11 on the main screen, and about 36 docked at 120; 14 sits clear of both. |
| 162 | The band shows one count, the status line's "open" count, and stays quiet while the person has hidden the pane **(Claude's call)** | The band and the status line then never disagree, and a hidden pane stays quiet as row 60 says. |
| 163 | When the pane is open but not placed (opened unasked below 144 columns), the band holds one Button that opens the pane focused, and says "ctrl+x tab then enter to open" **(Claude's call, if session 1 shows the band takes ctrl+x tab)** | With no pane placed the focus key has nowhere to go; a press counts as the person asking, so the pane is placed at any width. |
| 164 | Compact decision screen: crumb on the header line, title on one line, key line under it, one line per option, the description only under the highlighted option (with the recommendation's reason on the recommended one), the scenario in that line when nothing is highlighted; dependencies, sources and the parked reason not drawn **(Claude's call)** | Every row has to earn its place in 9 rows; the dropped lines show once the pane is tall and the thread is one `enter` away. |
| 165 | `o` on the decision screen shows the next page of options, wrapping, clears the highlight and puts the ring on Discuss; a number key sets the highlight (and so the page) before moving the ring; up and down don't page **(Claude's call)** | The ring is never left on an option no longer drawn, and `$.ui.focus` waits for the option once its page is drawn. |
| 166 | The `›` follows the key the `ui.focus` event names, recorded once the move went through, and is drawn only while the pane has the keys **(Claude's call)** | It is the engine's record of the ring, so it can't drift from the reverse video. |
| 167 | The person's moves onto the tab strip are kept off in the `ui.focus` hook; `t` still changes tab **(Claude's call, a click on a tab checked in session 1)** | Up from the first row then stays on the list. |
| 168 | A list row's meta is drawn only when the title fits whole beside it, at every width **(Claude's call)** | Rows with cut titles couldn't be told apart; the section heading already says a row is answered. |
| 169 | Under the compact threshold the Send screen puts its key line under its heading and pages its tick rows **(Claude's call)** | "c sends" scrolled off the bottom on the main screen (tester D). |

## 10 November 2026: Aaron, the pane's look

| # | Decision | Why |
| --- | --- | --- |
| 170 | The pane's look at every width (Aaron, look A with look C's styling plus rules): a header of the title in bold with "keys on/off" at the right of the same line, then one dim line "<group> › dN · open · Claude recommends N"; a thin dim full-width rule between header, context, options and key hints (replacing the dashed rule); the context capped at 3 lines with `m more`, sources behind `m`; options as plain rows with the number in the suggestion colour and a green "recommended" tag; the highlighted option a rounded card bordered in the `claude` colour holding its label, description and "Why: ..." (recommended only), other options label only; number keys on the option rows themselves (no separate digit row); Discuss drawn as a key hint, still the autoFocus target; key hints as chips (inverse key, dim label), at most two lines. The list: tabs as filled chips (the active one on a `claude` background), section headings bold with dim counts, folded ones "▸ Claude's call  4" dim, the highlighted row as the same card, rules between header and tabs, sections and keys. Under 14 rows the card has no border (a tinted row with `›`) and the rules stay only if they fit. Theme keys only (claude, suggestion, success, subtle, inactive). Replaces the layout parts of rows 158 and 164 | Aaron found the decision screen hard to read on real work; one layout at every width, with the compact rules only where rows run out. |
