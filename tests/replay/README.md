# Replay harness

This folder replays question-heavy sessions against the mod and counts how many questions still land in chat (target none). It also holds the seeded session the first-time-user testers start from.

## Run it

```
npx -y tsx <repo>/tests/replay/run.ts [--sessions <folder>] [--text <folder>] [--flagged]
```

- It runs `claude -p` (headless, Sonnet, the plugin loaded from this repository) in a fresh Pantry git project per session, sending each prompt with `--resume`. Decisions the mod puts in the pane are not answered. It runs with `--permission-mode dontAsk` and read-only tools plus git: without that, a prompt that makes Claude reach for Edit hung the headless run until the timeout.
- The output is one line of counts per session and a total: turns, questions in chat, decisions added, turns the nudge detector would nudge after, turns where the detector and the counter agree, and how many flags came from the mid-text rule and the last-sentence rule. No prompt or reply text is printed, so the output is safe to log for private sessions.
- `--only <name>` runs one session by file name. A turn that times out is retried once, so a turn that added decisions before timing out can add them twice. Stores are left under the usual decisions folder (one per scratch project). A private session's `name` is printed, so give private files neutral names. Questions are counted over all the assistant text in a turn, not only its last message.
- `--text` and `--flagged` (refused together with `--sessions`) write or print reply text: use them on the made-up sessions only.
- Headless runs cannot show the real nudge (the reminder after a turn doesn't reach the transcript), so "would nudge" comes from the detector, not from watching it.
- The counter (`count.ts`) is separate code from the mod's detector on purpose: a disagreement is a finding.

## Sessions

A session is a JSON file: `{ "name": "...", "prompts": ["...", "..."] }`. The five in `sessions/` are made up for the Pantry app. To replay your own, point `--sessions` at a folder outside this repository.

## Seeded session for testers

`seed-ux.ts` fills the store of the git repository it is run from: three choices (one with 12 options, the first with a problem line the small model wrote), six assumptions, a Pantry review with an Image uploads group, a parked decision, an answered one with a discussion, a Recipe printing group (an unread reply, two answers and a quick answer from the small model) and a session record for the Session page. Set `DECISIONS_SESSION` to the id you then start Claude with (`claude --session-id`), since the pane shows only that session's decisions.

```
cd "$(mktemp -d)" && git init -q && npx -y tsx <repo>/tests/replay/seed-ux.ts
```
