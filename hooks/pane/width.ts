/**
 * How many columns text takes on a terminal, and cutting it to fit. Counting characters drew a Chinese,
 * Japanese or Korean title, or one with emoji, wider than its row: those take two columns a character. Every
 * place the pane fits or cuts text measures with these. Claude Code's mod API has no helper for this.
 */

/** Characters that take no column of their own: combining marks, joiners and variation selectors. */
function isZeroWidth(code: number): boolean {
  return (
    (code >= 0x300 && code <= 0x36f) ||
    (code >= 0x1ab0 && code <= 0x1aff) ||
    (code >= 0x1dc0 && code <= 0x1dff) ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x20d0 && code <= 0x20ff) ||
    (code >= 0xfe00 && code <= 0xfe0f) ||
    (code >= 0xfe20 && code <= 0xfe2f) ||
    (code >= 0x1f3fb && code <= 0x1f3ff) ||
    (code >= 0xe0100 && code <= 0xe01ef)
  )
}

/** East Asian wide and full-width characters, and emoji. */
function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0x303e) ||
    (code >= 0x3041 && code <= 0x33ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xa000 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1f64f) ||
    (code >= 0x1f680 && code <= 0x1f6ff) ||
    (code >= 0x1f900 && code <= 0x1f9ff) ||
    (code >= 0x1fa70 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x3fffd)
  )
}

/** The columns one character takes: 2, 1 or 0. */
export function charWidth(char: string): number {
  const code = char.codePointAt(0)!
  if (isZeroWidth(code)) {
    return 0
  }

  return isWide(code) ? 2 : 1
}

/** The columns a string takes on a terminal: wide East Asian characters and emoji take two, combining marks none. */
export function displayWidth(text: string): number {
  let width = 0
  for (const char of text) {
    width += charWidth(char)
  }

  return width
}

/**
 * The longest start of `text` that fits in `columns`, and the rest. A combining mark stays with the character
 * before it. When not even the first character fits it is taken anyway, so a wrap always moves on.
 */
export function splitAtColumns(text: string, columns: number): [string, string] {
  let width = 0
  let at = 0
  for (const char of text) {
    const w = charWidth(char)
    if (w > 0 && width + w > columns && at > 0) {
      break
    }
    width += w
    at += char.length
  }

  return [text.slice(0, at), text.slice(at)]
}

/** `text` cut to `columns` with `…` when it is wider. */
export function cutToWidth(text: string, columns: number): string {
  if (displayWidth(text) <= columns) {
    return text
  }
  const room = columns - 1
  const head = room <= 0 ? '' : splitAtColumns(text, room)[0]

  return displayWidth(head) <= room ? `${head}…` : '…'
}

/** `text` with spaces after it up to `columns`. */
export function padToWidth(text: string, columns: number): string {
  return text + ' '.repeat(Math.max(0, columns - displayWidth(text)))
}
