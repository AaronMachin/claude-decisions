/** The default chord for Claude Code's `abovePrompt:focus`; the mod can't read the person's own binding. */
export const DEFAULT_FOCUS_KEY = 'ctrl+x tab'

let configured = DEFAULT_FOCUS_KEY

/** Takes the "Focus key" setting: the key the person bound to `abovePrompt:focus`. Empty or missing is the default. */
export function configureFocusKey(value: unknown): void {
  configured = typeof value === 'string' && value.trim() !== '' ? value.trim() : DEFAULT_FOCUS_KEY
}

/** The focus key's name, as the band and the pane's keys-off line show it. */
export function focusKeyName(): string {
  return configured
}
