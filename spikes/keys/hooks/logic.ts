export const OPTION_COUNT = 12
export const GAP_MS = 1500

export type Typed = { digit: string; at: number } | undefined

/**
 * The option a digit highlights. A "1" followed by a digit within the gap
 * reads as "1x" when that is a real option; anything else is the digit alone,
 * with "0" meaning 10.
 */
export function highlightFor(
  digit: string,
  now: number,
  previous: Typed,
  gapMs: number = GAP_MS,
): { option: number; typed: Typed } {
  const isSecond = previous !== undefined && previous.digit === '1' && now - previous.at <= gapMs
  const joined = isSecond ? Number('1' + digit) : Number(digit === '0' ? '10' : digit)
  const option = joined >= 1 && joined <= OPTION_COUNT ? joined : Number(digit === '0' ? '10' : digit)

  return { option, typed: { digit, at: now } }
}

/** A folder name for a repository, from its git common directory (absolute). */
export async function repoKey(commonDir: string): Promise<string> {
  const trimmed = commonDir.replace(/\/+$/, '')
  const parent = trimmed.endsWith('/.git') ? trimmed.slice(0, -5) : trimmed
  const name = (parent.split('/').pop() ?? 'repo').replace(/[^A-Za-z0-9_-]/g, '-')
  const bytes = new TextEncoder().encode(trimmed)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  const hex = Array.from(digest.slice(0, 4), b => b.toString(16).padStart(2, '0')).join('')

  return `${name}-${hex}`
}

export type Highlighter = { typed: Typed; option: number | undefined }

/**
 * Moves the focus ring for one digit. The state is updated before the engine
 * is asked, because two quick keys run their handlers one after the other
 * without waiting for the first focus call to answer.
 */
export async function pressDigit(
  $: { ui: { focus: (args: { requestId: string; key: string }) => Promise<unknown> } },
  requestId: string,
  digit: string,
  now: number,
  state: Highlighter,
): Promise<{ option: number; answer: unknown }> {
  const result = highlightFor(digit, now, state.typed)
  state.typed = result.typed
  state.option = result.option
  const answer = await $.ui.focus({ requestId, key: `opt:${result.option}` })

  return { option: result.option, answer }
}
