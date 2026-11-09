# 7 ux-fixes: spec

This document outlines how workstream 7 fixes what the first-time-user test found hardest: reaching the pane with a half-typed message, number keys that don't work on a short pane, and three small things (the highlight, the assumptions row, cut titles). It builds decisions 157 to 159 in `docs/decisions.md`; findings 1, 2, 3, 6, 10 and 11 in `docs/findings/ux-test.md` are the evidence. A first draft for the controlling session to approve.

## What the engine tells the pane (checked in the types)

| Question | Answer | Where it matters |
| --- | --- | --- |
| Which element has the ring? | Every ring move is the `ui.focus` event first, with `element` the key taking it (absent on one of the engine's own stops). The person's arrows, Tab and clicks raise it with origin `person`; `$.ui.focus` and `autoFocus` with origin `plugin`. | `›` can follow the ring from the engine's own event, so it is built (decision 159). |
| Can a move be refused? | A `ui.focus` hook that returns without `next` keeps the ring where it was. | Up from the first row stays put instead of reaching the tab strip. |
| How tall is the pane? | `Pane` props `scroll.bodyRows`: the room's rows. Inline the frame fits the tree. | The compact threshold. |
| Is the pane placed, shown, focused? | `$.ui.panes()` gives `isPlaced`, `isShown`, `isFocused` per pane. An unasked open below 144 columns (110 once asked) waits undrawn, `isPlaced` false. | The band's wording. |
| What does the band get? | `AbovePrompt` props: `hasSurvey`, `isWorking`, `maxRows`, `bodyColumns`. A bare digit in an empty prompt answers a band Button, so the band draws no digit Buttons. | Band layout. |

Not answered by the types: whether `ctrl+x tab` goes to the pane or to the band when both are drawn above the prompt. The docs say both can take the keyboard by that chord. Session 1 checks this first (below), because the band's wording depends on it.

## The band (decision 157)

A `ui.render` hook on `{ component: 'AbovePrompt' }` in a new `hooks/band.tsx`, wired in `register.tsx`.

Shown only when all of these hold, otherwise `next(e)`:

- one or more decisions are waiting on the person (the status line's "open" count: "Needs you" and tasks, row 97)
- the pane doesn't have the keys
- the person hasn't hidden the pane (`h` or `ctrl+x x`); a hidden pane stays quiet, as row 60 says, and the status line still counts
- no survey holds the band

The text, one line, cut to `bodyColumns`:

```
3 decisions waiting · ctrl+x tab to answer, your draft stays
```

One count, the same one the status line shows, so the band and status line never disagree (my call: "2 need you of 5" was longer and the other three are folded away anyway).

When the pane is open but not placed (opened unasked below 144 columns), `ctrl+x tab` has no pane to reach. The band then holds one `autoFocus` Button that opens the pane focused when pressed, and reads:

```
3 decisions waiting · ctrl+x tab then enter to open, your draft stays
```

A press is the person asking, so the pane is placed at any width. This only works if `ctrl+x tab` gives the band the keys when no pane is placed; session 1 checks it. If it doesn't, the unplaced case falls back to "3 decisions waiting · /decisions to open" and I log it.

If session 1 shows the band takes `ctrl+x tab` even while the pane is placed, the placed case also gets the Button and the "then enter" wording, rather than naming a key that lands somewhere else. Either way the band names only keys that were seen working.

The band redraws when decisions change (already `$.ui.invalidate`) and when the pane gains or loses the keys: the pane's render hook notes `isFocused` and asks for a redraw only when it changed.

## Compact layout (decision 158)

**Threshold: compact when `scroll.bodyRows` is under 14** (my call). Inline at 90x35 the testers saw about 9 rows, main-screen at 150x40 about 11, docked at 120x40 about 36, so 14 sits clear of both groups. Session 1 logs the real `bodyRows` at 90 columns and session 2 on the main screen; the threshold moves (new row) if either is 12 or more.

Compact applies to the decision screen and the Send screen. Taller panes keep row 136's layout (D9) unchanged. The list already pages to `bodyRows`; the thread counts its rows (row 92); the batch screen is not changed here (open point 2).

**Decision screen, compact**, a 12-option choice at 90 columns, 9 rows, focused, option 9 highlighted:

```
Decisions · Image uploads > d2                               keys on
Which thumbnail size the upload page makes
1 2 3 4 5 6 7 8 9 0 · a rec · o more 7-12 · b back · p park · h hide
   7  Square 256
   8  Square 512
 › 9  Keep the original shape, longest side 400
      One file per image; the grid crops it in the browser
   10 Two sizes, 200 and 800 (recommended)
   Discuss
```

- One header line: the crumb joins "Decisions" (the tall layout keeps them on two lines). Keys off, a second line reads "keys off · ctrl+x tab to use, your draft stays".
- The title, cut to one line.
- The key line under the title: the digit Buttons, then `a` (only with a recommendation), `o` (only when the options don't fit), `b`, `p`, `s` (only when something is ready), `h`. If it is wider than the pane, the words go and the letters stay (`a o b p h`).
- One line per option. Only the highlighted option shows its description under it; for the recommended option the reason is added ("· why: ..."). Nothing highlighted, the scenario takes that line, under the title.
- Dependencies, sources and the parked reason aren't drawn in compact; they show once the pane is tall, and the thread screen is one `enter` away. (My call; open point 1.)
- `Discuss` stays last and keeps `autoFocus`, so `enter` with nothing highlighted still opens the discussion (D3).

**How many options show**: the rows left after the fixed lines (header, title, key line, description line, Discuss, one more when keys are off). At 9 rows that is 4, at 11 rows 6.

**`o` shows more**: moves to the next page of options, wrapping to the first. It clears the highlight and puts the ring on Discuss, so the ring is never left on an option that is no longer drawn. `o` is free on the decision screen (the list uses it for "earlier", a different screen).

**Number keys reach every option**: a digit (or `1` then a digit) sets the highlight first, which moves the page to the one holding that option, and only then asks the engine to move the ring there. `$.ui.focus` waits for an element not yet drawn, so the ring lands once the new page is drawn. This is the change that makes option 9 of 12 answerable at 90 columns. The same order is used in the tall layout, where it changes nothing visible.

Up and down walk the drawn options only. Down from the last option on a page goes to Discuss, not to the next page; `o` is how to see more (my call: paging on the arrow would need the hook to rewrite ring moves, and the key line already says `o more`).

**Send screen, compact**: the line saying what Enter and `c` do moves directly under "Send answers", and the tick rows page to what fits, so "c sends" never scrolls off (tester D's problem in finding 2).

## The three small fixes (decision 159)

**`›` on the ringed row.** The pane keeps the key of the element holding the ring in its view, written from the `ui.focus` hook once `next(e)` has moved the ring (a refused move writes nothing), and after each of the pane's own `$.ui.focus` calls that succeeds. While the pane has the keys, the row whose key that is gets `›` in its first column: list rows, the two folded headings, the assumptions row, options, Discuss, the batch rows and the Send screen's tick rows. With the keys off, no `›`, because there is no ring to show. It is the engine's own record of the ring, not a guess from the highlight, so it can't drift from what the reverse video shows. If session 1 shows the `›` disagreeing with the reverse video, I take it out and log it.

**Up from the first row doesn't reach the tabs.** The `ui.focus` hook keeps the ring where it is when the person's move (origin `person`) would land on a `tab:` element. `t` still moves to the next tab. The catch: a mouse click on a tab is also a person's move, so if the click's press is refused along with the ring move, clicking a tab stops working. Session 1 checks a click; if it stops, tabs become plain text and `t` is the only way, and I log it.

**The assumptions row** reads "Check 6 assumptions together (enter)".

**Meta dropped before titles are cut.** On a list row, the right-hand meta ("2 options · open", "✓ 1 Project root · ready to send") is drawn only when the title fits whole beside it. Otherwise the row is the id and as much of the title as fits. Applied at every width, not just 49 columns (my call). The "Answered" heading already says a row is answered, so a ready row with its meta dropped is still told apart.

## Files

| File | Change |
| --- | --- |
| `hooks/band.tsx` (new), `hooks/band.test.tsx` | The band |
| `hooks/register.tsx`, `hooks/register.test.tsx` | Wire the band; `ui.focus` keeps the ring off tabs and records it |
| `hooks/pane/decision.tsx`, `decision.test.tsx` | Compact decision screen, `o`, digit order, `›` on options |
| `hooks/pane/list.tsx`, `list.test.tsx` | `›` on rows, assumptions row text, meta rule, compact Send screen |
| `hooks/pane/kinds.tsx` | `›` on batch rows |
| `hooks/pane/render.tsx` | Passes `bodyRows` and the ring down; notes pane focus for the band |
| `types/index.d.ts` | `PaneView` gains `optionPage` and `ring`; the view's shape tag goes from `view-3` to `view-4` so an older stored view is declined |
| `README.md` | Keys (`o` on a decision, the band) and limitations (compact below about 14 rows) |
| `docs/design.md` | "The pane" and "Kinds of decision" for decisions 157 to 159 |
| `docs/decisions.md` | Rows for each "my call" above, in the commit that builds it |
| `docs/findings/ux-test.md` | Findings 1, 2, 3, 6, 10, 11 marked fixed with the commit |

No contract: every other workstream is merged and nothing built later depends on these shapes.

## Tests (each a `claude plugin test` beside its module)

- Band: shown with one decision waiting and the pane open unfocused; not shown with nothing waiting, with the pane focused, with the pane hidden, under a survey; the count matches the status line; the unplaced wording and its Button open the pane focused.
- Compact: at `bodyRows` 9 a 12-option decision draws every shown option on one line, the key line directly under the title, 4 options and `o more`; `o` shows options 5-8 and clears the highlight; digit 9 moves to the page with option 9 and asks the engine to focus `opt:9`; at `bodyRows` 30 the tall layout is unchanged.
- Ring: a person's move onto a `tab:` key is kept off; a move onto a row records the ring and draws `›` on it; no `›` with the keys off.
- Assumptions row text; meta dropped before the title at 49 columns and kept when the title fits.
- Send screen compact: the key line comes before the rows.

## Real sessions (at most 3, Sonnet, Pantry scratch project from `demo/make-pantry.sh --seed`)

1. 90x35 fullscreen (inline). Before anything else: does `ctrl+x tab` reach the pane with a band drawn and a draft typed, and is the draft intact? Then: log `bodyRows`, the `›` against the reverse video, Up from the first row, a click on a tab, and the unplaced band (open a new session at 90 columns so the pane waits undrawn, let Claude add one).
2. 150x40 main screen (`CLAUDE_CODE_NO_FLICKER=0`): log `bodyRows`; on the 12-option decision press `9` then enter and see it answered; `o`; the Send screen.
3. Spare, for whatever 1 or 2 changed.

## Open points

1. Compact drops dependencies, sources and the parked reason from the decision screen. The alternative is a second "more" key that swaps the options for them. I'd leave it out until someone misses them.
2. The batch screen (6 or more assumptions) isn't made compact here. At 9 rows its key line can still scroll off. Not in the findings' list for this workstream; one for a follow-up if session 1 shows it.
3. If `ctrl+x tab` goes to the band while the pane is placed, the band's text changes from decision 157's wording to "ctrl+x tab then enter". That is a change to Aaron's chosen text, so I'll log it as a question as well as building it.
