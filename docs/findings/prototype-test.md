# Prototype test

The clickable prototype was a private mockup, tried in its play mode. Click the terminal once before the keys work. Tasks were given to Aaron one at a time with no other instructions.

## Tasks

1. "Claude added decisions while you were typing. Have a look at them, then get back to typing."
2. "Answer decision 3 with the recommended option."
3. "Ask why option 2 exists, then get back to Claude without losing what you were typing."
4. "Mark the assumptions; one of them is wrong."
5. "In the PR review, find the finding about the image upload size limit and agree with it."
6. "Send your answers to Claude."

## What happened

- Task 1: done with no trouble ("otherwise this is fine"). Aaron's only question was whether `ctrl+q` also takes you back to the prompt as well as into the pane. In real Claude Code it does (the pane spike found it is a toggle), but the prototype only went one way, with Esc as the only way back. Fixed so the prototype matches.
- Task 2: done with no hesitation reported ("I like this").
- Task 3: Aaron moved on ("continue") with nothing to report.
- Task 4: Aaron raised three things:
  - Pressing an answer key (`y`/`n`) changes the answer but leaves you on the decision. Aaron expected it to take them back to the list: "feels weird that when I press "n" or "y" it just changes and doens't take me back to the list".
  - Send sends everything ready at once. Aaron wants a review step first, choosing which answers go: "I might not want to send all of them, and I might want a chance to review". All selected by default on that screen.
  - Typing in a decision's discussion marks it answered. Aaron sees discussing and answering as separate: a message should only discuss, and marking it answered is the person's choice, with a key for it ("press <key> to mark this as answered, claude will get a transcript of the discussion"). This is the Task 1 deferred minor (no discuss-only path), now confirmed by Aaron.
  - Marking assumptions with `f`/`x` made sense, including spotting the wrong one. But Aaron would rather every kind used numbered options than a different set of letters per kind: "maybe if we just always do [0-9]* options rather than doing random keybindings".
  - "I should always see the original options, too". Confirmed: an answered decision still shows every option with the chosen one marked, not just the answer. Aaron also wants a history of what the decision originally looked like when a discussion has changed it: "in claude you can just scroll so it'd be nice [not] to lose that feature".
- Task 5: Aaron raised two things, from a screenshot of the Search review group:
  - The action buttons under an expanded item (`g agree  d already decided  n disagree`) don't stand out enough from the item's text: "not distinct enough under the list item".
  - The groups along the top (Sharing links, Image uploads, Search review, Parked) didn't read as tabs: "it took me ages to reliase there was different tabs".
  - Observed in the screenshot: item 4 (clearing old drafts) was marked agree and item 1, the image upload size limit finding, was still open. Its title, "One user can use up another user's quota", never says "image upload size limit" (only the detail does), so the finding couldn't be found by its title. Finding titles should name the area they're about.
  - Once found, the tabs' purpose wasn't clear either: "I'm also not sure what the tabs are for". Neither row says what it is: the top row is where the decisions came from (a piece of work, a PR review, parked ones), the second row filters by who has to act.
- Task 6: Aaron moved on ("okay, continue") with nothing new. The review step before sending (Task 4) covers Send.

## Verdicts

| Task | Verdict |
| --- | --- |
| 1 Look at new decisions, back to typing | Pass, once `ctrl+q` also left the pane |
| 2 Answer with the recommended option | Pass |
| 3 Ask why, back without losing the draft | Pass (nothing reported) |
| 4 Mark assumptions | Pass, with changes: back to the list after answering, numbers everywhere, discussing is not answering |
| 5 Find and agree with the image upload size limit finding | Fail: the tabs weren't seen as tabs, their purpose wasn't clear, and the finding's title didn't say "image upload size limit" |
| 6 Send | Pass, with a review step wanted first |

## Proposed changes

1. Answering a decision saves it and returns to the list.
2. Send opens a review screen of ready answers, all ticked; untick to hold one back, then confirm.
3. A message in a thread only discusses. A separate key marks it answered, and Claude gets the answer with the whole discussion.
4. Every kind uses numbered options (assumption: 1 correct, 2 wrong; finding: 1 agree, 2 disagree, 3 not sure).
5. An answered decision shows all its options with the chosen one marked.
6. A decision a discussion changed keeps its earlier versions, viewable in the pane.
7. The keys under an expanded item stand apart from its text.
8. The two rows of tabs either get labels or become one list with headings (options in summary.md).
9. Claude is told that a finding's title names the area it's about ("Image upload size limit: one user can use up another's quota").
