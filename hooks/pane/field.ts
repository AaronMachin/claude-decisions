/**
 * What the pane fills a text field with. Claude Code puts a field's `value` back whenever it is drawn with
 * a different one, and the typing reaches the mod later than the next draw can, so drawing the saved draft
 * took letters away: the field held "abc" while the draft saved so far was "ab" (row 299). A field is
 * filled once, with the draft as saved when it opened, and drawn with that same value for as long as it
 * stays open; the draft is still saved on every change. A field no draw shows any more, or any field once
 * the pane closes, is forgotten, so opening it again takes the draft as saved then. Module memory, never
 * state: nothing here may be written while the pane draws.
 *
 * Draws overlap: the render hook waits on file reads, so a second draw can start before the first ends. A field
 * is forgotten only when no draw is still running and none since the last quiet moment drew it. Forgetting it on
 * the end of one draw while another had drawn it reopened the field with the draft as saved then, which lags
 * the typing, and Claude Code put that older text back into the box: a cleared box then sent half a question.
 */
const opened = new Map<string, string>()

/**
 * Each text field's element key names its decision. Claude Code keeps what was typed in a field by its key and
 * puts it back only when the field is drawn with a different value, so with one key for every decision the
 * ask box typed in on one decision came back on the next (both opened with an empty value). These are the keys
 * the Inputs are drawn with, focused by and found by in tests, and the keys `fieldValue` remembers them by.
 */
export function askInlineKey(id: string): string {
  return `ask-inline:${id}`
}

export function askInputKey(id: string): string {
  return `ask-input:${id}`
}

export function answerKey(id: string): string {
  return `answer:${id}`
}

export function parkKey(id: string): string {
  return `park:${id}`
}

/** Whether the ring is in a decision's own ask box. */
export function isAskInline(ring: string | undefined): boolean {
  return /^ask-inline:/.test(ring ?? '')
}
let drawn = new Set<string>()
let running = 0

export function beginFieldPass(): void {
  if (running === 0) {
    drawn = new Set()
  }
  running += 1
}

export function endFieldPass(): void {
  running = Math.max(0, running - 1)
  if (running > 0) {
    return
  }
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

/** Whether a submitted text is a question or answer at all: an empty or blank one never sends. */
export function isBlank(text: string): boolean {
  return text.trim() === ''
}

/** The value to draw `field` with (its element key and the decision, such as `ask-inline:d4`). */
export function fieldValue(field: string, draft: string): string {
  drawn.add(field)
  if (!opened.has(field)) {
    opened.set(field, draft)
  }

  return opened.get(field)!
}
