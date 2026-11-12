# 9 look and session: spec

This document outlines workstream 9, which gives the pane a clearer look and a session page. It builds decisions 251 to 256 in `docs/decisions.md`; those rows say what and why, this says what each screen shows. Where the two differ, the decisions win. The mock pages Aaron chose from on 12 November are the reference for look: in the private prototype repository, `prototype/9-look/looks.html` (direction B), `more-ideas.html` (ideas 1 to 6) and `session-page.html`. Calls marked **(my call)** were made by Claude after a builder read this document, and can be overruled.

## Why

After 0.2.0 Aaron found the pane "a little bland": every line the same grey weight, one colour on screen (the tab chip), and nothing that tells the eye where to look. Separately, someone flicking between several Claude Code sessions has no way to see what each one is about, or find the PRs and pages it made, without scrolling its chat.

## Goals

- You can tell a decision's kind and state from its shape and colour before reading it.
- Text Claude writes (backticks, bold) reads as it does in the chat.
- After answering, you can see what Claude did with it without leaving the pane.
- Opening a session's pane tells you in a few seconds what the session is about, where it has got to, and where its PRs and pages are.

## Non-goals

- The stack map (254). The thinking timer and header progress line from direction C (251). A keys page, dots on tabs, marks in the status line, fixed answers side by side (252).
- Reading Claude Code's own task list (d78 chose Claude writing the plan).

## Anti-goals

It has failed, even if it works, if:

- it looks like a web page in a terminal (rounded buttons, mouse-first controls); the coloured bar is a single column of `▌`, not a box
- a short pane loses its key line or its option numbers to the new decoration
- the session page shows something stale without saying how old it is
- anything here answers or sends a decision by accident

## Constraints

- Only what a terminal draws through the mod's components: `Text` colour, bold, dim, italic, underline, strikethrough, background colour; `Box` borders; `Link` (a terminal hyperlink).
- Colours are the theme names the pane already uses: `claude`, `suggestion`, `success`, `warning`, `error`, dim. Nothing hard-coded, so light themes keep working.
- Hotkeys are one letter or digit. Left and right never reach the mod (234).
- Compact below 14 rows (`COMPACT_BELOW`) keeps working with the key line in view.
- No state or view writes while a `ui.render` hook draws.
- The repository is public: run the leak check before every commit.

## The look (251)

### The bar

Every list row and the decision screen's title and options get a one-column `▌` on the left, coloured by state:

| State | Colour |
| --- | --- |
| needs you, by kind: choice | `suggestion` |
| go-ahead | `warning` |
| finding | `claude` |
| question | `error` |
| assumption | plain (the theme's text colour) **(my call: one colour per kind from the theme names there are; `success` means answered, so it can't be a kind)** |
| answered (ready) | `success` |
| sent, parked | dim |
| the ringed row or option | the row keeps its colour and gets the selection background |

The kind's own colour also marks the kind word in the decision's header: an inverse label (` QUESTION `) in that colour. Inverse is fine here; 226 ruled out inverse key caps only because the number would show twice.

### The list

- Rows are two lines on tall panes: the title (the id in bold before it), then a dim line with the kind, the id's age (`asked 4m ago`) and, when answered, the answer in the person's words (`1 Red · only if in stock`, `Something else: …`). A row with an unread reply keeps 0.2.0's reply line in place of the dim line. Compact panes keep one line per row.
- Section headings get marks: `◆ Needs you`, `✓ Answered`, `▸ Claude's call` (folded), with the count dim after a ` · `.
- The keys-off line is one line: `<focus key> to use`, at the right of the header, not a sentence under it.
- The all-clear (extra 6): with nothing waiting, under `✓ Nothing needs you`, `Last sent <time> · <n> answers` and up to three of the latest sent decisions as rows, then `New decisions land here.` dim.

### The decision screen

- Header: the bar, the inverse kind label, the title in bold. Under it a dim line: id, group, and `asked 4m ago`. The "N of M answered" count shows only when the group has two or more decisions.
- What it waits on and holds up (extra 5), under the header when either exists: `waits on` then each id, title and state mark (`✓` answered, `◆` waiting), and `holds up` then the decisions that depend on it and the decision's `blocks` text. These move out of the `m` context lines.
- Options keep 0.2.0's content. The ringed option has the selection background across the row, not a bordered card, so the bar can show. Something else lines up with the options (same number column).
- The ask box has a border, its placeholder dim, and the cursor after the placeholder, not on it.
- The conversation reads as a chat: each entry `you · 2m` or `claude · now` (speaker in `suggestion` or `claude`), the text after it on the same line, wrapped under itself.
- The key line uses `enter answer` (key in `suggestion`, label dim, no colon).

## The extras (252)

1. **Claude's text.** In scenarios, option text, reasons and thread entries: `` `code` `` is drawn in `suggestion` without the backticks, `**bold**` as bold, `_italic_` or `*italic*` as italic. Wrapping measures the text without the markers. Anything unbalanced is drawn as typed.
2. **Clickable sources.** Each source is a `Link`: a URL as it is; a file path as a `file://` link to the file (with the line as `:N` in the label, since terminals differ in opening at a line). Label first, path dim after it.
3. **What changed.** A `↻` entry in the thread is followed by what changed against the version before it: `+ N  <label>` (`success`) for an added option, `★ recommendation A → B` (`warning`), `~ N  <old label> → <new label>` for a renamed one, with the old label struck through. The earlier version is already in `revisions`.
4. **A receipt.** A sent decision shows, under its answer, `↗ sent <time>` and `claude: <first line of the reply to the turn that carried it>`. This needs new matching: the mod recognises the turn whose `turn.start` text is its answer prompt (it starts `Answer from the decisions pane` or `Answers from…`), including one queued behind a running turn, the same way it matches `On decision N ·` discussion prompts today. The receipt is the first non-empty line of that turn's final answer (`turn.complete`'s `answer`), recorded on each decision the prompt carried. **(my call)** On the list, a sent row's second line is `↗ sent 12:04 · <answer>`.
5. **Waits on and holds up**, as above.
6. **The all-clear**, as above.

## The session record and page (253, 255, 256)

### The record

One file per session, beside the decisions, named by the session id:

```
{
  "version": 1,
  "session": "<session id>",
  "title": "Decisions pane: inbox, then the look",
  "summary": "Built and merged the inbox (0.2.0). Now redesigning how the pane looks.",
  "now": { "text": "Choosing what goes in with B", "waitsOn": ["d76", "d77"] },
  "plan": [
    { "text": "Inbox", "status": "done", "note": "merged in #1" },
    { "text": "The look, direction B", "status": "active", "steps": [
      { "text": "Pick the extras", "status": "active", "waitsOn": ["d76"] }
    ] }
  ],
  "links": [
    { "url": "https://github.com/o/r/pull/1", "label": "#1 Workstream 8", "kind": "pr", "state": "merged", "addedBy": "mod" }
  ],
  "updatedAt": "…",
  "updatedBy": "claude"
}
```

- `status` is `done`, `active` or `todo`. Steps nest one level (plan item, then steps). `note` and `waitsOn` are optional.
- Claude writes `title`, `summary`, `now` and `plan` through the `decisions_session` tool. Each call replaces the fields it gives and leaves the rest.
- Links: only links the session made, not every link it saw **(my call)**. The mod's `tool.call` hook adds a link when an Artifact publish result gives an artifact URL (the first publish of that URL in the session), or when a Bash call whose command runs `gh pr create` prints a pull request URL. Calls from subagents count, since they work for the session. Each gets a label from the result (the artifact's title, `#<n>` and the PR title when the command gave one) and `addedBy: "mod"`. A `gh pr list` or a fetched page adds nothing. Claude can add, label or mark the state of links through the tool too (`state`: `open`, `merged`, `closed`). Links are never removed automatically.
- The tool's description says when to call it: at the start of real work, when the plan or focus changes, and when a plan step finishes. It stays within the tool description's length limit (the existing test).

- **The record follows `/clear` and `/resume` (my call).** When the session id changes on `/clear` or an in-process `/resume` (the mod already sees `session.end` with that reason), the record is copied to the new id with `continuedFrom` set to the old one, so the page keeps showing the same work.
- **A `decisions_session` call doesn't open the pane (my call).** The pane opens as today, when Claude adds a decision or the person asks; the Session tab is there whenever it's open. Writing a summary is not a reason to push the pane open.

### The page

The first tab, ` ✻ Session `, before the decision tabs, shown once the session has a record or a link. Top to bottom: the title in bold; the summary (dim, wrapped); `▶ now  <text>` with `· waits on d76, d77`; `Plan` with the nested list (`✓` `success`, `▶` `claude`, `·` dim; numbering `1`, `2.1`; a note dim at the right, cut with `…`); `Links` as `Link`s with `✓ merged` or `open` after a PR; then `updated 2m ago by Claude` dim. `m` folds done items to `✓ N done`, as in Claude Code's own task list. On a compact pane: the title, the now line, and the plan with done items folded; links behind `o`.

### Refresh (256)

`r` on the session page sends one prompt through the mod's existing route: `Refresh the session record with decisions_session: title, summary, now line and plan, from where the work is now.` It starts a turn, like asking in a discussion does, and the page shows `✻ asked Claude to refresh` until the record's `updatedAt` changes or that turn ends, whichever comes first; if the turn ends with no update, the line becomes `Claude didn't update it` until the next draw after a key **(my call)**. `r` on the assumptions batch keeps its meaning there.

## Left to the builder

- How the bar is drawn on Ink (a `Text` per row or a left border on a `Box`), as long as it costs one column.
- Exact row budgets on short panes, as long as the key line and every option number stay in view.
- Where the session file lives inside the store directory and how it's named.
- How labels are pulled from tool results for links.

## Open questions

- Whether `file://` links open at the line in Aaron's terminal; if not, the label still names the line.
- Whether the receipt's "first line of the reply" is useful or mostly "Done." (try it in a real session before polishing).
