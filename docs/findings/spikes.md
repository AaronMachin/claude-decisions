# Spike findings

Each spike answers one question about the mod API. Folder layout: `spikes/<name>/`.

## Task 4: pane, keys and widths

**Question:** Does a docked pane behave as the design says with Aaron's keys, at every width?

**What I did:** Built `spikes/pane`: `/decisions` opens pane `decisions` (`focus: true`) with six rows, a message Input and Buttons `b` (Back) and `h` (Hide, calls `$.ui.close`). `claude plugin test spikes/pane` passes on `terminal` and `desktop` (command opens the pane with `isPlaced: true` and `focus: true`, both hotkeys are drawn, pressing Hide raises `ui.close` for `decisions`) and `claude plugin validate` has no errors. The test cannot send a keypress to a pane (`ui.key` is for a `Client` only), so "pressing `h`" is tested as pressing the Hide Button. Then three real sessions in tmux (Sonnet, 40 rows, driven with `send-keys`, never asking the model anything): (1) `CLAUDE_CODE_NO_FLICKER=1` resized 150, 120, 100 and back; (2) no env var, 150; (3) `CLAUDE_CODE_NO_FLICKER=0` (main screen) at 150, 100 and 70. Aaron's `keybindings.json` (ctrl+q is `abovePrompt:focus`, ctrl+x tab unbound) was left as is. About 6 minutes of session time in total (roughly 255s, 40s and 75s), one stray 4-second Sonnet turn in session 3 (see below).

**What happened:**

| Layout and width | Where the pane sits | `/decisions` opens it | Reopen after Hide |
| --- | --- | --- | --- |
| Fullscreen, 150 cols | Docked right, 66 body columns (`placement: dock`), full height | Yes | Yes |
| Fullscreen, 120 cols | Docked right, 49 body columns | Yes | Yes |
| Fullscreen, 100 cols | Not docked: inline box above the prompt, 96 columns (`placement: inline`) | Yes | Yes |
| Main screen, 150 / 100 / 70 cols | Inline box above the prompt, 146 / 96 / 66 columns | Yes | Yes |

- The environment variable made no difference in tmux here: session 2 (no env var) was fullscreen and docked, the same as session 1. Only `CLAUDE_CODE_NO_FLICKER=0` gave the main-screen layout, so fullscreen is this machine's default even inside tmux (the reference says tmux defaults to main screen, so that may be a setting of Aaron's, which I did not look at).
- Nothing opened by itself: both sessions started with no pane. I did not test a plugin-made open, which the types say waits undrawn below 144 columns (110 once the person has asked for that id).
- Shrinking the window from 120 to 100 while the docked pane was open made it disappear (no pane, no message). It was not restored. Widening to 150 afterwards showed the docked pane again without a new open. Opening with `/decisions` at 100 gave the inline box.
- A pane opened by `/decisions` with `focus: true` already holds the keys. Pressing `h` straight after opening hid it. A key the pane does not use (I tried `z`) goes to the composer and the pane stops holding the keys, so a following `h` does nothing.
- `ctrl+q` toggles the pane's focus, it does not only grant it. Pressed while the pane already holds the keys it hands them back (the next keys land in the composer); pressed after that it gives them back to the pane. So the same `ctrl+q` is "focus" or "unfocus" depending on state, and a pane that is not visibly focused gives no cue which it is.
- The Input is not focused by `ctrl+q` alone. After `ctrl+q`, `Down` moves the ring onto the Input and typing then goes into it. `Tab` did not do that.
- `esc` with half-typed text in the Input: the text stays in the Input, the pane stays open, and focus returns to the composer. Pressing `ctrl+q`, `Down` again found the text still there.
- Hide then `/decisions`: the pane opens again at every width tried, but the Input's text did not survive (it came back empty), so anything that must outlive a hide has to be kept in `$.state`, not in the Input.
- `ctrl+x tab` does nothing (Aaron's config unbinds it).
- A slip in session 3: `ctrl+q` then `h` when the pane already held the keys typed `h` into the composer, and the next `/decisions` was sent to the model as `h/decisions`. That is the same toggle as above: with `ctrl+q` bound to a toggle, a half-sent key is easy to send to the model by mistake.

**So the design should:**
- Plan for what I saw: docked at 150 and 120 columns in fullscreen (66 and 49 body columns), inline above the prompt at 100 columns in fullscreen and at 150, 100 and 70 on the main screen (146, 96 and 66 body columns). The boundary between docked and inline is somewhere between 100 and 120 and was not bisected (the types say 110, unverified). Draw to `bodyColumns`, never to the terminal width.
- Treat the docked pane going away on shrink (observed once, 120 to 100) as possible: keep decisions in `$.state` and let `/decisions` bring it back, rather than assuming the pane is there.
- Not rely on `ctrl+q` to enter the pane. It is a toggle, and only reaches the Input via `Down`. Give the person a clear way in that works from the composer (the `/decisions` command with `focus: true` already does), and show whether the pane holds the keys.
- Decide whether Esc in the pane should close it: Esc left the pane open and kept the draft, which suits a pane that holds a pending question (add `closeOnEscape` only if we want it to close).
- Keep drafts out of the Input's own state, since Hide loses them.

**Open (not answered within three sessions):** whether the pane opens on its own below 144 columns (needs a plugin-made open); how `ctrl+q` behaves with a band drawn above the prompt at the same time; a pane with several panes open.

## Task 5

**Question:** Can the rules and the format reach Claude without a skill, and does Claude still know the open decisions after `/compact` and `/clear`?

**What I did:** Built `spikes/instructions` (plugin `instructions-spike`): a `prompt.compose` section `decisions-rules` (`scope: 'session'`, 15 lines of rules), a tool `decisions_add` registered in `session.start` with `isDeferred: false`, a 6,137 character description and the design's data format as its input schema, an in-memory list, a `tool.call` hook that refuses a missing or empty `scenario`, `group`, `kind` or `title` (and a bad kind, no options, or a recommendation that names no option), and a `prompt.context` hook that adds a `decisions` block with the open list. `claude plugin test spikes/instructions` passes 4 of 4 (failed 4 of 4 before the implementation) and `claude plugin validate` passes with warnings about the repository root only. Then three real sessions in tmux (Sonnet, 150 columns, `--plugin-dir`): (1) "plan adding a config file to this project", then asking it to add two decisions, `/compact`, "what's still open?"; (2) "review the last commit", asking it to add one decision, `/clear`, "what's still open?"; (3) "what should we do next?", run with `--debug-file`. Roughly 6, 4 and 2 minutes, and about 6, 3 and 1 model turns (eight tool-free tmux waits between them). Sonnet stands in for Opus, so how often Claude still asks in chat may differ on Opus.

**What happened:**

| Check | Result |
| --- | --- |
| `prompt.compose` section reached Claude | No. Every session printed "its prompt.compose hook was skipped. managed-security-plugin runs first and sent the event on past it". The debug log says "prompt.compose bypassed by managed-security-plugin (tier user); beneath runs" and "managed-security-plugin@builtin seated outermost: this machine has managed settings" |
| `prompt.context` block reached Claude | No, bypassed the same way, in all three sessions |
| `decisions_add` visible without ToolSearch | Yes. Claude called it by name straight away when asked, with every field filled |
| 6,137 character description accepted | Registered and used, but the engine printed "the description of decisions_add (6137 characters) reaches the model up to its first 4096". The rest is cut. The two examples and the "Refusals" section sit after character 4,096, so they were probably cut (not checked directly) |
| Tool result | A result that is an object is refused by the engine: "tool.call step resolved ... with a result that does not match its output shape ... expected string, received object". Claude saw an error twice and did not retry. Returning a string worked |
| Prompt 1, "plan adding a config file" | 1 question in chat, 0 decisions. The user's `superpowers:brainstorming` skill loaded and asked the question. With the rules section bypassed, nothing told Claude about the pane |
| Prompt 2, "review the last commit" | 0 questions, 0 decisions (it found nothing to ask) |
| Prompt 3, "what should we do next?" | 1 question in chat ("Which of these are you after?") with three options listed in chat, 0 decisions. It did notice the plugin was loaded and offered to try the pane |
| After `/compact` (two decisions open) | Claude listed both, with their recommendations, correctly. Observed once. The `prompt.context` hook was bypassed, so this came from the compaction summary, not from the open list. It then asked a question in chat |
| After `/clear` (one decision open) | Claude knew nothing: "I can't see any open or parked decisions in my context", though the plugin's in-memory list still held it. Observed once |

- Typing `/clear` while a turn was still running queued it as text. It did not clear anything and the next question was answered with the old conversation. I sent it again once the turn had ended.
- When asked outright to add decisions, Claude wrote good scenarios and recommendations from the schema and the (cut) description alone.

**So the design should:**
- Not rely on `prompt.compose` or `prompt.context` on a machine with managed settings: the built-in security plugin sits outermost there and skips a user-tier mod's hooks on both. Whether a mod installed at another tier (not `--plugin-dir`) is also skipped was not tested. This needs an answer before the "always in the system prompt" and "what's open" layers are built.
- Put everything Claude must see in the tool description, within its first 4,096 characters (the rules, the format, a short example), since that is the only layer that reached Claude. The rest is cut.
- Have the tool return a string.
- Expect a way to recover the open list after `/compact` and `/clear` other than `prompt.context` (for example `$.session.append` with `type: "user"` as the reference suggests, or a read tool that returns the list), because after `/clear` Claude had no way to know.
- Not assume the rules cut chat questions yet: with the rules section bypassed, the three prompts still asked in chat. That test has to be re-run with the section delivered.

**Open (not answered within three sessions):** whether the rules section cuts chat questions at all; whether `prompt.context` survives `/compact` and `/clear` when it is delivered; whether a second compose answer that differs mid-conversation is dropped as the reference says.

## Task 6

**Question:** What does Claude make of an AskUserQuestion call the mod answers, and can a turn that ends with questions in chat be detected?

**What I did:** Built `spikes/ask` (plugin `ask-spike`): a `tool.call` hook on `AskUserQuestion` that never calls `next`, records one pending decision per question and answers with "Added to the decisions pane as 1-2. The person will answer there; carry on with other work." (the range is worked out from the count); variant A answers with `{ result }`, variant B with `{ deny }`, chosen by a constant `VARIANT`. A `turn.complete` hook that, once the turn ends, reads the turn's assistant text from `$.session.messages()` (every assistant message since the last prompt, not only `answer`) and, when `isQuestionsInChat` is true, calls `$.session.append` with a user-role reminder to use the pane. `isQuestionsInChat` is true when the last sentence ends in `?` or two or more numbered or bulleted lines each end in `?`. `claude plugin test spikes/ask` passes 5 of 5 (failed 5 of 5 against an empty stub first) and `claude plugin validate` passes with the usual warnings (no icon, no README at the root). Then three real sessions in tmux (Sonnet, 150 columns, `--plugin-dir`, `--debug-file`), each asked "use AskUserQuestion to ask me two things about this project": (1) variant A with a string result, about 106 seconds, 2 prompts, 4 model requests; (2) variant A with an object result, about 91 seconds, 2 prompts, 3 requests; (3) about 203 seconds, 3 prompts, 5 requests: variant A again by mistake (my edit to the constant did not apply), then I switched the file to variant B, the session hot-reloaded the mod, and I asked for two other questions in the same conversation, so Claude had already seen an A call. Sonnet stands in for Opus.

**What happened:**

| Check | Result |
| --- | --- |
| `tool.call` and `turn.complete` hooks bypassed by `managed-security-plugin` | No. The debug log shows only `prompt.context` bypassed ("ask-spike: prompt.context bypassed by managed-security-plugin (tier user); beneath runs"). The mod's `tool.call` hook is logged as "answered tool.call without next() ... nothing beneath it ran", and `turn.complete` settled after every turn. The security plugin's own event list at load does not include either event. Seen in all three sessions |
| A string `{ result }` for AskUserQuestion | Refused: "tool.call step resolved AskUserQuestion with a result that does not match its output shape ... expected object, received string". Claude saw an error twice, stopped trying, and wrote its two questions in chat. The unit test passed with the string, so passing tests and real behaviour disagree here: the test kit does not check a result against the tool's output shape |
| A `{ result }` that is an object: `{ questions, answers: {} }` plus the text as `context` | Accepted. Claude said "I asked both questions, but you haven't answered them yet. They are in the decisions pane as 1-2. There is nothing else to do in the meantime, so I will wait for your answers." Asked next "what did I choose for the first one?" it said: "You haven't chosen anything yet. The tool returned "The user did not answer the questions", and the only other thing I got was a note that the questions were added to the decisions pane as 1-2." It did not invent an answer and did not carry on with other work (there was none). Seen in sessions 2 and 3 with the same reading |
| `{ deny }` | Claude was shown "Error: Added to the decisions pane as 1-2. The person will answer there; carry on with other work." as an error row in the transcript, and then said "I have asked both questions: which branch to work on, and how often to check with you before acting. They are in your decisions pane ... I am waiting for your answers." It did not retry and did not treat it as a failure. Observed once, after an earlier variant A call in the same conversation, so it may have copied that. The person sees a red error row either way |
| Does Claude believe the questions were answered | No, in A (object) and B. It treated the text as "queued, waiting", and in A it also read the empty `answers` as "did not answer" |
| The nudge | Fired once, in session 1: the failed tool made Claude write two numbered questions in chat, `isQuestionsInChat` was true, the hook appended the reminder, and the next turn began "I didn't add anything to the decisions pane. I have no tool for it, and AskUserQuestion, the only route I had, failed twice." So Claude read the reminder, but it had no working way to follow it. Observed once, and not seen again because Claude asked in chat nowhere else |
| False alarm on the live turns | None: the reminder was not appended after any of the other six turns |

- The test kit needs `on('turn.complete', ...)` and `on('session.messages', ...)` answered with `{ value }` beneath the plugin before `$.turn.complete` or `$.session.messages()` will run in a test.
- A reload (editing the file in a running session) emptied the mod's in-memory list, so the second pair of questions was numbered 1-2 again. The real mod stores decisions on disk, so this does not apply to it.
- The nudge is aimed at turns that end with questions. It would miss a question in the middle of a turn's text, and would flag a turn that ends with a rhetorical or an offer-style question ("Want me to carry on?"). Neither was tried against real text beyond the one hit.

**So the design should:**
- Answer AskUserQuestion with an object, `{ questions, answers }`, never a string. Put the "added to the pane" text in `context`, which Claude reads after the result. With `answers: {}` Claude reads it as "the user did not answer" and still understands the questions are pending in the pane.
- Treat `{ result }` (object) as the working variant. `{ deny }` also worked once, but it shows the person a red error row and rests on one observation after an A call.
- Not rely on the security plugin skipping `tool.call` and `turn.complete` on this machine: they ran. That differs from `prompt.compose` and `prompt.context`, so the AskUserQuestion and nudge layers work where the system prompt layers do not.
- Keep the nudge as a second layer only. It reached Claude, but a reminder is useless unless the tool it points at works, and the AskUserQuestion route is the one that already worked.
- Test the real tool's output shape in a real session, not only in the test kit.

**Open (not answered within three sessions):** whether the nudge fires and helps with a real working pane tool; whether `{ deny }` behaves the same in a fresh conversation; how often Opus asks in chat at all; how the detection does on real turn text (false alarms and misses).

## Task 7

**Question:** For each way of replying to a question about a decision (main session, fork, side agent, quick model), how long does the reply take, where does it show, and does anything leak into the main conversation?

**What I did:** Built `spikes/discuss` (plugin `discuss-spike`). `/discuss` opens a pane with the thread for decision 3 and an Input that takes "main: ...", "fork: ...", "agent: ..." or "quick: ...", and calls `ask($, mode, '3', text)`. `main` calls `$.prompt.submit` with "On decision 3: ..." and takes the answer of the turn that prompt starts (found through `turn.start` and `turn.complete`); `fork` is `$.model.fork`; `agent` is `$.agent.register` (read-only tools, sonnet) then `$.agent.spawn`, answered by that agent's own `turn.complete`; `quick` is `$.model.complete` on haiku. A `ui.render` hook on `UserMessage` tries to relabel the question row "on 3 · When a shared recipe link expires", and a `prompt.submit` hook and a `turn.step` hook only record what they see. `claude plugin test spikes/discuss` passes 4 of 4 (it failed before `register.tsx` existed: "no hooks module to load") and `claude plugin validate` passes with the usual warnings (no icon, no root README). Two real sessions in tmux (Sonnet, 150 columns, `--plugin-dir`, `--debug-file`), each with Claude kept busy by "read these eight files one at a time with a separate Read call each, then read them all again" (about 35 seconds a turn): (1) about 7.5 minutes, 9 turns: four main asks, one fork, and one quick call I sent by mistake; (2) about 1.7 minutes, 2 turns plus the agent's own run: one agent ask and one quick ask. A third session was not needed. Sonnet stands in for Opus.

**What happened:**

| Mode | Seconds to reply | Streamed | In chat | Label rendered | Leaked into the main conversation | Could read a file |
| --- | --- | --- | --- | --- | --- | --- |
| main | 19.6 (asked 21s into a turn that ended at 38.8s; the reply turn took 1.7s). The other three were about 27, 28 and 29 | In chat, as a normal turn (not watched token by token) | Yes, under "Prompt from the discuss-spike plugin" | No (see below) | Not applicable, it is the main conversation | Not tried (it has the tools) |
| fork | 3.5, observed once, while a turn was running | No, whole | No | Not applicable | No | Not tried |
| agent | 7.4, observed once, while a turn was running | Not seen (see below) | The agent's report, not as a reply | Not applicable | Yes (see below) | Yes, it read README.md and main.py |
| quick | 1.0 and 1.3 (haiku) | No, whole | No | Not applicable | No | No (and no conversation: asked "/discuss" it replied "What would you like to discuss?") |

- **Main does not arrive mid-turn.** `$.prompt.submit` was called while a turn ran, the chat showed the prompt row straight away, but the engine only processed it when the running turn ended (debug log: called 05:04:05, processed 05:04:31, the turn's end), and then it started a turn of its own. Seen four times. Taking "the next main-loop `turn.complete`" therefore captured the wrong turn twice (the answer to the earlier task, shown in the thread as the reply). The fix that worked: `turn.start`'s text is `The discuss-spike plugin sent "On decision 3: ..."` (the engine's framing, so match with `includes`, not `startsWith`), and the reply is that turn's `turn.complete`.
- **Label did not render.** The `UserMessage` hook ran for the person's own rows and for the agent's, but never for the plugin's own prompt: the debug log says "ui.render skipped: re-entry (the plugin's own code raised it; origin discuss-spike)". The engine's own row is "Prompt from the discuss-spike plugin" over the text as sent. Not tried: a second plugin doing the labelling.
- **The side agent's report reached the main conversation.** It arrived as a row "Message from @discuss-spike-discuss", with `origin.kind` `peer` (not `task-notification`), `from.name` `discuss-spike:discuss`, delivered mid-turn about 2 seconds after the agent finished (`prompt.submit` saw it: "submit peer mid-turn: <agent-message from=...>"). Claude then wrote, in chat: "The subagent report that arrived mid-task matches the files ... I did not act on anything in it." Observed once. The same plugin's `prompt.submit` and `turn.step` hooks do not run for what it started itself (same "re-entry" line, for the agent's steps too), so this plugin's hook saw the peer message arrive but its `turn.step` never saw the agent's text. Whether a hook in another plugin does was not tried, so whether the agent streams is not known. The agent's `turn.complete` did reach this plugin's hook, with the whole answer.
- **Managed security plugin:** no "bypassed" line for any hook of this mod, in either session. `prompt.submit`, `turn.start`, `turn.complete`, `turn.step`, `ui.render`, `agent.register` and `agent.spawn` all ran (the security plugin also ran, "agent.spawn nested in discuss-spike"). `prompt.compose` and `prompt.context` were not used here. The fork and quick calls worked; the log has no line for them either way.
- **No refusals:** every return shape I used was accepted, so there is nothing to quote.
- **A hook that called `next(e)` twice crashed the worker.** My first `turn.step` hook read `next(e)` and then `next(e).result`, which runs the model request again ("Each call runs what is beneath afresh"): "turn.step hook skipped: ran past its 10s budget", then "discuss-spike was unloaded: it crashed the hooks worker". Editing the file reloaded it ("reloaded (6 hooks ...)"), and the in-memory thread was lost.
- **The pane only redrew when something told it to.** It sat stale (no reply, no new events) until a `$.ui.invalidate('ui.render')`, `ctrl+q` or a keypress. Anything that finishes in the background has to invalidate.
- **Keys:** typing `/discuss` while the pane held the keys sent it to the Input, and it was asked as a quick question. `ctrl+q` toggled focus again: once it handed the keys back, so "quick: ..." was sent to the composer and Claude answered it as a normal turn (2 seconds).
- **Tests against reality:** the test kit's `$` is the engine's, with no `$.agent.register`, `$.model.fork` or `$.model.complete`, so the tests hand `ask` a fake `$`. The test file and the engine load separate copies of the module, so state set by the engine's hooks is invisible to the test: the main and agent tests mount the hooks on the test's own `on`. `setTimeout` never fires under the kit's mocked clock (a wait of 20ms timed out at 5 seconds), so the tests flush microtasks instead. The first version of the main test passed with the wrong turn captured, because it never raised a `turn.start`; reality showed it.

**So the design should:**
- Not promise that a main-session question arrives within seconds. Observed: it waits for the running turn to end (19 to 29 seconds here), then gets a one-to-two second turn. Say so in the pane ("queued behind Claude's current step") and let the person pick fork or quick if they cannot wait.
- Take the reply to a main-session question from the turn that begins with the engine's "The <plugin> plugin sent ..." text, not the next turn to end.
- Not rely on relabelling the question row from the same plugin that submitted it. Either put "on 3 · <title>" into the text it submits (Claude reads it too, and the engine's row then shows it), or test a second plugin doing the labelling.
- Treat the side agent's report as something that lands in the main chat by default (a `peer` message delivered at the next tool round, which Claude reads and comments on). The "filter it with a `prompt.submit` hook" idea needs a hook outside the spawning plugin, and was not tried, so it is unproven. Fork and quick do not leak.
- Prefer fork where a reply in a few seconds that knows the conversation is wanted (3.5 seconds, saw the conversation: it named the first file read), quick where no context is wanted (1 second, does not know the conversation), and the side agent only where reading files matters (7.4 seconds, read two files).
- Invalidate the pane whenever a reply lands, and keep the thread in `$.state` or on disk (a reload lost it).

**Open (not answered within two sessions):** whether a hook in a second plugin sees the side agent's streamed text, filters its report, or relabels the question row; whether a main-session question is ever delivered mid-turn (all four waited, including ones sent while Claude was between tool calls); whether the fork can read a file or only answer from the conversation (not asked); how long the fork takes on a long conversation or a cold cache; Opus replies.

## Task 8

**Question:** Can `claude plugin eval` score "no questions in chat, decisions added instead" across a set of prompts?

**What I did:** Read `claude plugin eval --help` and https://code.claude.com/docs/en/plugin-evals (the claude-code-guide agent was not used). Wrote three cases in `spikes/eval/evals/` (the Task 5 prompts: "plan adding a config file to this project", "review the last commit", "what should we do next?"), each with three graders: `tool_used` on `mcp__instructions-spike__decisions_add` (at least 1), and two `regex` graders on the final message that port the two rules of `isQuestionsInChat` (last sentence ends in `?`; two or more list lines ending in `?`). Ran from `spikes/` with `claude plugin eval . --eval-dir eval/evals --runs 1 --ablation none --model sonnet --no-publish --trust-plugin --allow-tools mcp__instructions-spike__decisions_add`. Two runs, sonnet only, one run per case. The first attempt (before the two runs) failed at load in 2 seconds and cost nothing, because a case may only name plugins under the directory the command runs from.

**What happened:**
- The tooling works and the mod loaded. In both runs the plan prompt called `decisions_add` twice and scored 3/3; "review the last commit" and "what should we do next?" called it 0 times and scored 2/3 (suite score 77.8%, 1 of 3 cases at threshold, same in both runs). The security plugin did not appear to stop the mod in the eval's isolated session, but I did not test that.
- The two failing cases are mostly the workspace, not the mod. Each run starts in an empty temporary directory with no project and no commits. The review run said there was no commit to review; the next-step run said the directory was empty and listed three things it needed from the person, as bullets ending in full stops, so neither question grader fired. Whether this suite measures the behaviour needs a fixture repository, which needs `--scaffold` (it runs a bash script as me, so I did not use it).
- `isQuestionsInChat` cannot run in an eval. The docs say "There are no custom-code graders". The only options are `regex`, `tool_used`, `tool_order`, `file_exists` and the LLM graders. I ported both rules to regex and checked them with node on four strings. The regex has no equivalent of `lastSentence` (it strips trailing markdown, then takes the last sentence), so it only checks the final line of the text.
- Isolation: each run is a fresh `claude -p` with only the plugin loaded. My user settings, CLAUDE.md, MCP servers, memory and other plugins are absent; managed policy still applies. The mod's `decisions_add` tool is an MCP-style tool, so it needs an `--allow-tools` grant or it is removed.
- The graders only see the final message and the tool-call trace, so the check "one line saying what was added" and "does not repeat the list" would need an `llm` grader (haiku by default, extra calls).
- Cost: run 1 took 34 seconds and $0.148 (list-price estimate). Run 2 took 44 seconds and $0.127; per case 19, 14 and 10 seconds, 6, 8 and 3 turns. The JSON report shows cost, not tokens. The kept trace for run 2 gave tokens: 26 input, 3,003 output, 173,554 cache-read and 19,839 cache-creation across the three runs. Default would have been 3 runs per case, plus a no-plugin arm, so 18 runs; I set `runs: 1` and `--ablation none`.
- Reading the results: `--json` gives per-grader verdicts, cost and turns, and `--report` gives an HTML page. Neither includes the final message text. To see it I had to use `--keep-temp` and open `out/trace.jsonl` in the kept directory.

**So the design should:** treat `claude plugin eval` as usable for "decision added" (a `tool_used` grader works as is) and for a regex version of the question check, but not for the real `isQuestionsInChat`. Keep a separate unit test for that function. Give the cases a fixture project (scaffold script) before trusting any score on the review and next-step prompts. Add an `llm` grader if the one-line chat summary matters. Budget about $0.13 and under a minute for three cases at one run each.

## Phase 2 spike: keys, append, fork, storage

**Question:** Can the mod API do the key scheme in decisions.md D3 and D4, reach Claude with a message at session start and after `/clear`, let `$.model.fork` read project files, and store decisions under `~/.claude/decisions/<key>/` with one key for every worktree?

**What I did:** Built `spikes/keys` (plugin `keys-spike`). `/keys-a` opens a pane with twelve option Buttons (`opt:1` to `opt:12`), a `Discuss` Button with `autoFocus`, and ten digit Buttons (`hotkey` "1" to "0", plain) whose `onPress` calls `$.ui.focus` on the option. `/keys-b` opens a pane holding one `Client` whose `onKey` handles digits, up, down and return itself and posts each key to the hooks. `/keys-append`, `/keys-fork` and `/keys-store` run Questions 2 to 4. `claude plugin test spikes/keys` passes 7 of 7 and `claude plugin validate` passes with the usual warnings. Two real sessions in tmux (Sonnet, 150 columns, `--plugin-dir`, `--debug-file`) in a scratch git project and one worktree of it: (1) about 9 minutes, 6 prompts, answered Questions 1, 2, 3 and half of 4; (2) about 1 minute, 1 command, answered the other half of 4. Sonnet stands in for Opus.

### 1. Keys

Route A works (Buttons and `$.ui.focus`), seen five times in session 1.

| Key | Result |
| --- | --- |
| Digit, pane holds the keys | The digit's Button runs its `onPress` (debug: `ui.press keysa element=digit:5`). `$.ui.focus({ requestId, key: "opt:5" })` answered `{}` and the debug log says `ui.focus Pane keysa (plugin) onto keys-spike's opt:5: moved`. The option is drawn inverted |
| `1` then `0` | 473 ms apart: option 1, then option 10. Typed 1 ms apart (one `tmux send-keys` call): see the race below. No gap is needed to move the highlight; a gap only decides whether a second digit joins the first (11, 12), see "Gap" |
| Up, down | Move the ring between option Buttons: `ui.focus keysa element=opt:9 origin={"kind":"person"}`, no plugin code needed. The ring also passes over the Discuss and digit Buttons, in draw order |
| Enter on a ring Button | Raises `ui.press` for that key and its `onPress` runs (`CHOSEN 10`) |
| Enter with nothing on the ring | Nothing. The pane held the keys (a digit worked right after) but no `ui.press`, `ui.focus`, `ui.input` or prompt came, and the composer stayed empty. Seen once |
| Enter with the ring on a Button drawn with `autoFocus` | A pane opened with `focus` starts the ring on the `autoFocus` Button; Enter pressed it (`DISCUSS pressed`). Seen once |
| Esc | Returns the keys to the composer (engine takes it first). `ctrl+x tab` gives the pane the keys back; `ctrl+x x` did not close it here |

- **Race.** Two digits sent together ran their handlers one after the other without waiting for the first `$.ui.focus` to answer. My first version updated the "previous digit" after that await, so `0` was read as 10 (correct) but `1` then ran as a fresh digit and the highlight ended on 1. Debug: `digit 0 (1075ms after previous) -> option 10` then `digit 1 (1081ms after previous) -> option 1`. The fix (state set before the await) has a test. Seen once.
- **Gap.** I measured only 473 ms for a deliberate "1" then "0", so I have no data on what feels right. The rule I built: a "1" followed by a digit within 1500 ms joins ("10", "11", "12" when the option exists), else the second digit stands alone. This is an inference about feel, not measured: with at most ten options a gap is not needed at all (`1` then `0` is the only way to reach option 10, as `0` alone also means 10 in my version). With more than ten, a gap is the only way to tell "1 then 1" (11) from "1, pause, 1". I propose 1000 ms, to be tried by a person.
- **Digit Buttons are visible.** Each hotkey needs its own Button, drawn as `1: 1`, `2: 2` and so on in one row. A press carries no hotkey/Enter flag (`ui.press` has `plugin`, `element`, `component`, `requestId`, `surface`), so a hotkey on the option Button itself could not be told apart from Enter. I did not try an empty label or a dim one-line hint row.
- **Route B (a `Client`).** Handles every key itself: `1` then `0` (531 ms) gave highlight 10, up/down moved it, `return` posted `choose` with the highlight, and `return` with no highlight posted `discuss` (`ui.message {"kind":"discuss","key":"return",...}`), seen once each. But the Client only gets keys after a click on it. `$.ui.focus({ requestId: "keysb", key: "kb" })` answered `{"deny":"no element of its own is drawn under that key"}`, `/keys-b` opened the pane as a tab without the keys (digits went to the composer), Tab did not reach it, and only a mouse click (sent as an SGR mouse sequence) did. Route B is not usable as the default.

**So workstream 1 should:** use route A. Draw option Buttons keyed `opt:<n>`, digit hotkey Buttons that call `$.ui.focus` (state updated before the await), up/down from the engine's ring, Enter from the Button's `onPress`, and a `Discuss` Button with `autoFocus` as the "nothing highlighted" case (Enter on it opens the discussion; moving the ring off it is the highlight). State plainly in the spec that Enter with the ring on nothing does nothing. Decide whether the digit row is shown or dimmed. Not tried: more than twelve options, a pane that scrolls, the desktop surface.

### 2. Conversation message

- **At session start:** `$.session.append({ message: { type: "user", content: [text] } })` in `session.start` was stored (`"role":"user","isMeta":true`) and reached Claude. Asked "is there a codeword anywhere in what you have been told this session?" it quoted "Note from the keys-spike plugin: the startup codeword is PLUM-7421." and said "in your message", so it treats the note as the person's own words. The debug log has no "bypassed" line for it: `managed-security-plugin: session.append nested in keys-spike#0` and `settled in 1.0ms`. Seen three times (the reload also re-ran it).
- **After `/clear`:** `session.start` does not fire again, so nothing is appended. The mod's `classic.SessionStart` hook (source `clear`) is skipped: `keys-spike: classic.SessionStart bypassed by managed-security-plugin (tier user); beneath runs`. I did not try to get round that. Seen twice.
- **Route that worked after `/clear`:** a `prompt.submit` hook that, when `$.session.turns()` is 1 or less (the count already includes the prompt being sent, so 0 never appears), appends the note before `next(e)`. After `/clear`, Claude quoted only "the first-prompt codeword is QUINCE-3308", so the earlier startup note was gone and the new one arrived. Seen once. Mod hot-reload also fires `session.start`, which re-appends into the current conversation (a confound I hit once, then removed).

**So workstream 4 should:** append the open decisions on `session.start` and again from a `prompt.submit` hook when `turns() <= 1` (covers `/clear` and a fresh session), not rely on `classic.SessionStart`; word the note knowing Claude reads it as the person's message; keep a read tool for the list as the fallback. Not tried: after `/compact`, a resumed session.

### 3. Fork reading files

`/keys-fork` called `$.model.fork` with "Open the file SECRET.txt in the project directory and reply with the code written in it. If you cannot read files, reply exactly: NO FILE ACCESS." (the file held "The secret code is MANGO-9047."). It answered `NO FILE ACCESS`, seen twice. A second prompt asking which codeword was mentioned earlier in the conversation was answered "PLUM-7421", so the fork sees the conversation, including the appended note. The types agree: `ModelForkRequest` has only `prompt` and `effort`, and the reference calls the fork tool-less. This is a no for files.

**So workstream 2 should:** use the fork only for what the conversation already holds. For a reply that must read project files use a side agent with read-only tools (Phase 1's discuss spike, 7.4 seconds, read two files) or the main session.

### 4. Storage

- **Write and read back:** the mod's `$.fs.write("<home>/.claude/decisions/<key>/<id>.json", text)` created the directories and the file; `$.fs.read` returned it; `$.fs.list` listed it. `$.fs.list` on a missing folder rejects (`ENOENT`). The home folder came from `$.env.get("HOME")` (the name must be a string literal). Seen twice.
- **New session:** a second session started in the worktree listed the first session's file and read it.
- **Same key from a worktree and the main checkout:** `$.process.run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"])` answered `<main checkout>/.git` from both (the worktree's cwd was `<main checkout>-wt`). `$.session.repo()` gave `root` as the main working tree in both. My key is the folder name plus the first 8 hex of SHA-256 of that common directory (`keys-scratch-2v3n-da0af65a`), identical in both. Seen once each. A repository with no commits, a bare repository and a submodule were not tried.

**So workstream 1 should:** store at `~/.claude/decisions/<repoKey>/<id>.json` through `$.fs`, compute the key from `git rev-parse --path-format=absolute --git-common-dir` (`$.session.repo().root` is a second route, but its `remote` and `name` can be null), handle a missing folder as "empty", and read the folder again on each `session.start`.

### Cleanup

Everything the spike wrote under `~/.claude/decisions/` (one folder, two files) was deleted, and so was the `decisions` folder itself, which was empty and which the spike created. The scratch project and its worktree are in a `mktemp` folder under `/tmp`.

### Other points

- The test kit gives "no implementation for ui.focus" when a Button's `onPress` calls `$.ui.focus` inside `$.ui.mount`, even with `on('ui.focus')` registered (answers `{}` and `{ value: {} }` both tried), so the focus logic is a plain function (`pressDigit` in `hooks/logic.ts`) tested with a fake `$`.
- A hook for `ui.focus` of the mod's own `$.ui.focus` calls is skipped ("re-entry (the plugin's own code raised it; origin keys-spike)"); a person's moves do reach it.
- Not answered: the desktop surface, Opus, more than twelve options, scrolling panes.

## prompt-drop (12 November 2026, decisions 214 and 231)

Question: can a `prompt.submit` hook keep a line like `d1 2` from Claude, so an answer could be typed in the prompt?

Run in tmux at 150x40 with `claude --model sonnet --plugin-dir spikes/prompt-drop`, Claude Code 2.1.322, on a machine with a managed security plugin. The hook returns `{ drop: 'saved d1 2 as an answer' }` for a line matching `d<n> <n>` and `next(e)` for anything else.

- **Dropped:** typing `d1 2` started no turn. Claude never saw it.
- **What shows:** one line in the transcript, `⏺ Prompt dropped by a hook: saved d1 2 as an answer` (the drop reason, so it can read as a confirmation). The security plugin did not skip `prompt.submit`.
- **The prompt keeps the text.** `d1 2` stayed in the prompt box after the drop, and had to be cleared by hand (`ctrl+u`). A real build would need `$.prompt.fill` or similar to clear it, not checked.
- **Next prompt unaffected:** a normal prompt typed after it reached Claude and was answered.

**So:** answering from the prompt can be built. The open part is clearing the prompt after a drop. Nothing in workstream 8 depends on it.

## Left and right in the pane (12 November 2026, decision 233)

Question: why do left and right take the keys out of the pane?

Run in tmux at 150x40 with `claude --model sonnet --plugin-dir .` from the `ws/pane-inbox` branch, with the pane's `ui.focus` hook writing every event it got to the status line.

- **Right** on a list row and on a decision's option raised no `ui.focus` event and did nothing.
- **Left** raised no `ui.focus` event either. Claude Code took it as its own key and opened the background agents view (the `← 2 agents` hint in the status bar), which hid the pane's keys behind "describe a task for a new session".
- So neither arrow reaches the mod. The pane can't refuse the move, because there is no move to refuse.

**So:** decision 233 can't be built inside the mod. What's left is the person's own key settings (whatever Claude Code binds left to while the prompt is empty) or a request to Claude Code that a focused pane keeps its arrows.
