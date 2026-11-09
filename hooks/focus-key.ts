/** The default chord for Claude Code's `abovePrompt:focus`; the mod can't read the person's own binding. */
export const DEFAULT_FOCUS_KEY = 'ctrl+x tab'

/** The focus key's name, as the band and the pane's keys-off line show it. */
export function focusKeyName(): string {
  return DEFAULT_FOCUS_KEY
}
