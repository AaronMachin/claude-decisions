# Screen sizes

`sizes.test.tsx` draws every screen of the pane at 6 widths (40 to 200 columns) and 8 heights (8 to 50 rows), from the seeded session the testers use (`tests/replay/ux-fixture.ts`) plus a go-ahead, a question, a task, a decision with a long unbroken word, and one written in Chinese, Japanese and emoji. It runs with the other tests (`claude plugin test .`).

The screens are the list, a decision of each kind and state, the answer box, the whole thread, the Session page, the Send screen, the assumptions batch and the empty pane offering other sessions. At each size it checks:

- no Button, and no Text set to cut, is wider than the room it is drawn in, since the terminal would cut it
- the key line is drawn
- on a decision, the key line is in view without scrolling, and every option (Something else too) has its row
- on a decision 14 rows or taller, the title and every option's label are drawn whole, not only cut with `…`

A Text that wraps is allowed to: the terminal wraps it, and `layout.ts` gives it the rows it wraps onto, so it only fails a check by pushing something out of view.

The kit hands a test the drawn tree, not the painted screen, so `layout.ts` lays the tree out the way the terminal stacks it (columns stack, rows sit side by side, borders and padding take room). It is close, not exact. The real-session script (`tests/real/run.sh`) reads the real screen.

Text that takes two columns a character (Chinese, Japanese, Korean, emoji) is in the seeded text. The pane measures text in terminal columns (`hooks/pane/width.ts`), not characters, wherever it fits or cuts it, and `layout.ts` measures the same way.
