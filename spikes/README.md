# Spikes

Throwaway mods that each answer one question about the mod API before the real build. Run one with `claude --model sonnet --plugin-dir spikes/<name>` from an empty scratch folder, never from inside a real project. Findings go in `docs/findings/spikes.md`.

- `pane` - does a docked pane behave as the design says with Aaron's keys, at every width?
- `instructions` - can the mod alone teach Claude to use the decisions pane, and does it survive `/compact` and `/clear`?
- `ask` - what does Claude make of an AskUserQuestion call the mod answers, and can a turn that ends with questions in chat be detected?
- `discuss` - for each way of replying to a question about a decision (main session, fork, side agent, quick model), how long does it take, where does it show, and does anything leak into the main conversation?
