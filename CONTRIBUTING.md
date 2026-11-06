# Contributing

This guide sets out how the decisions pane is built and the principles every change has to keep. Read `docs/design.md` for how it works and `docs/decisions.md` for why.

## Principles

These come from the design's goals and anti-goals. A change that breaks one of them needs a decision first (see "Changing a decision" below), not a pull request.

- **Decisions live in the pane, not the chat.** If a change makes Claude more likely to ask in chat, it's going the wrong way. Chat gets one line saying what was added.
- **Every decision has the same structure.** Title, scenario, options with what each changes, recommendation with its reason, sources, discussion. Kinds only change what the numbered options say.
- **Nothing is lost.** Decisions and their whole threads survive `/clear`, compaction, new sessions and hiding the pane. Anything half-typed is kept in `$.state`, never only in an Input.
- **It belongs in the terminal.** Character cells, inverted focus rows, dim key hints. No chips, rounded buttons or mouse-first controls.
- **It never takes focus on its own, and `esc` always gets you back to the prompt** with your draft still there.
- **Keyboard first, and nothing happens by accident.** Numbers highlight, `enter` confirms. A stray key must never answer or send something.
- **Claude keeps working** on whatever doesn't depend on an open decision.
- **Test the experience, not just the code.** Is it intuitive? Could someone who didn't design it get through the tasks unaided?
- **Never work around an organisation's security controls.** If a managed plugin skips one of the mod's hooks, use another route or document the limitation.

## Running it locally

```
claude --plugin-dir /path/to/claude-decisions
```

Use a scratch project (`mktemp -d`, then `git init`), not a real one, while trying changes: the mod writes decisions under `~/.claude/decisions/<repo>/`.

## Checks every change passes

| Check | Command | Bar |
| --- | --- | --- |
| Tests | `claude plugin test .` | all pass; every behaviour has a test |
| Validation | `claude plugin validate .` | no errors |
| Types | `tsc -p .` (after the mod has loaded once, so `.claude-plugin/types/` exists) | no errors |
| Real session | `claude --plugin-dir .` in a scratch project | every layer you touched seen working, not only in tests |

The real-session check isn't optional. Twice during the spikes, the test kit accepted a shape the real engine refused (a tool result as an object, an AskUserQuestion result as a string). Say in your commit or PR what you tried and what you saw.

## Layout

| Path | What's there |
| --- | --- |
| `.claude-plugin/plugin.json` | the mod's manifest |
| `hooks/register.tsx` | wiring only: one `on(...)` line per hook, no logic |
| `hooks/*.ts`, `hooks/pane/` | the mod, one concern per file, tests beside each as `<name>.test.ts(x)` |
| `evals/` | `claude plugin eval` cases checking Claude uses the pane instead of asking in chat |
| `docs/design.md` | how it works |
| `docs/decisions.md` | every decision and why |
| `docs/findings/` | what prototypes, spikes and tests showed |
| `docs/specs/`, `docs/plans/` | a spec and a plan per piece of work |
| `spikes/` | throwaway experiments from early on; read them for working shapes, never import from them |

## How work is done

1. **Spec first.** A short spec in `docs/specs/` for anything bigger than a fix: what someone can do afterwards, how we'd know, the shapes other code depends on.
2. **Then a plan** in `docs/plans/`, broken into tasks that each end in a passing test and a commit.
3. **Test first**, then the code.
4. **Small commits** in the imperative ("Add the review screen before sending"), one task each.
5. **Branches** are `ws/<name>` for planned work and `fix/<name>` for fixes, merged into `main` when the checks pass.

## Changing a decision

Decisions in `docs/decisions.md` are settled. If you hit one you can't build as written, don't work around it quietly: open an issue (or, if you're working on it with Aaron, raise it directly) naming the decision's number and what you hit. If it changes, it gets a new numbered entry that names the one it replaces; old entries are never edited. Then update `docs/design.md` to match.

## Writing

Plain and direct, UK English (colour, behaviour, organisation), no em dashes (use `-`). Tables for lists of like things, prose for the rest. Examples use the made-up "Pantry" recipe app, never real projects, tickets, paths or transcripts: this repository is public.

## Licence

By contributing you agree your contribution is licensed under the MIT licence in `LICENSE`.
