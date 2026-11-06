# claude-decisions

<!-- GIF here once the mod works -->

A Claude Code mod that moves Claude's questions and decisions out of the chat and into a pane beside it, each with its own discussion.

## Status

Work in progress, not installable yet. Phase 1 (a prototype test and API spikes) is done, and the build is next.

## How it will work

- The pane sits beside the transcript (inline above the prompt on narrow terminals) and never takes focus on its own.
- Every decision has the same structure: a plain title, a concrete scenario, the options with what each changes, and a recommendation with its reason.
- You choose by typing the option's number, then `enter` to confirm. `enter` on its own opens that decision's discussion.
- Replies in a discussion come from the main session by default. You can switch to a fork or a quick model call in `/config`.
- Decisions are kept per repository, so they survive `/clear` and compaction.
- `ctrl+x tab` moves focus between the prompt and the pane. If that clashes with your editor or terminal, rebind `abovePrompt:focus` in `~/.claude/keybindings.json`.

## Planned install

Neither of these works yet.

```
/plugin marketplace add AaronMachin/claude-decisions
/plugin install decisions@claude-decisions
```

## Repository

- `docs/design.md` - the design
- `docs/decisions.md` - every decision so far and why
- `CONTRIBUTING.md` - principles and how changes are made
- `docs/findings/` - what the prototype test and the spikes showed
- `spikes/` - throwaway experiments, one per question about the mod API

## Licence

MIT
