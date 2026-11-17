# Real sessions

`run.sh` drives a real Claude Code with this mod in tmux and checks what is on the screen. It covers what the test kit can't, because the kit doesn't behave like Claude Code in those places: where the keys go, what typing does, and what the arrows move. The bugs that got past the tests so far were all of this kind (typing in the ask box went into Claude's prompt, enter did nothing until an arrow was pressed, arrows lost the ring).

```
tests/real/run.sh                 # 150x40 (the pane beside the chat) and 100x30 (the pane above the prompt)
tests/real/run.sh 120x35          # one size
KEEP=1 tests/real/run.sh 150x40   # leave the tmux session and scratch folder to look at afterwards
```

It needs tmux, node (for `npx tsx`) and a signed-in `claude` on your PATH. It isn't run on pull requests, since CI has no signed-in Claude Code. Run it before merging a change to the pane's keys, focus or typing, and say in the PR what it printed.

For each size it makes a scratch git repository in a temporary folder, seeds it with the testers' session (`tests/replay/seed-ux.ts`) under a fresh session id, and starts `claude --plugin-dir <this repo> --session-id <id>` in its own tmux session (named `decisions-real-<pid>-<size>`). It then opens the pane with `/decisions` and checks:

- the pane opens on the seeded session, with the ring on the first waiting row, and enter opens that decision
- down moves the ring from the recommended option to the next
- `t` and typing put the text in the pane's ask box and none of it in Claude's prompt, and a long burst typed in one go keeps every letter
- up leaves the ask box, `b` goes back to the list and the next decision opens with its ask box empty
- `h` hides the pane and Claude's prompt is still empty

Under 110 columns the pane sits above the prompt and is about 9 rows, and `t` opens the whole thread instead; there the run stops after the typing checks, since the thread's box has no way out but enter or esc.

No prompt is ever sent to Claude, so a run costs no model usage. Enter is only pressed while Claude's prompt is empty and no box in the pane has the keys; if text reaches the prompt anyway, the script clears it and stops that size. Afterwards it kills only its own tmux sessions and removes the scratch folder and the decisions it seeded. Claude Code keeps the session's transcript under `~/.claude/projects/`, as for any session.

Known failure: the check that the next decision's ask box starts empty fails today. The text typed in one decision's ask box shows up in the next decision's box when you go there through the list without closing the pane.
