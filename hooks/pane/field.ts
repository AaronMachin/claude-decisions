/**
 * What the pane fills a text field with. Claude Code puts a field's `value` back whenever it is drawn with
 * a different one, and the typing reaches the mod later than the next draw can, so drawing the saved draft
 * took letters away: the field held "abc" while the draft saved so far was "ab" (row 299). A field is
 * filled once, with the draft as saved when it opened, and drawn with that same value for as long as it
 * stays open; the draft is still saved on every change. A field no draw shows any more, or any field once
 * the pane closes, is forgotten, so opening it again takes the draft as saved then. Module memory, never
 * state: nothing here may be written while the pane draws.
 */
const opened = new Map<string, string>()
let drawn = new Set<string>()

export function beginFieldPass(): void {
  drawn = new Set()
}

export function endFieldPass(): void {
  for (const field of [...opened.keys()]) {
    if (!drawn.has(field)) {
      opened.delete(field)
    }
  }
}

/** When the pane closes: every field opens afresh next time. */
export function forgetFields(): void {
  opened.clear()
}

/** The value to draw `field` with (its element key and the decision, such as `ask-inline:d4`). */
export function fieldValue(field: string, draft: string): string {
  drawn.add(field)
  if (!opened.has(field)) {
    opened.set(field, draft)
  }

  return opened.get(field)!
}
