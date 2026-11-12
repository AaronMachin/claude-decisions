/** The pane's colours by kind and state (row 251), and Claude's inline markdown (row 252, extra 1). */

import type { Decision, Kind, ThreadEntry } from '../store'
import { ago } from './seen'

const KIND_COLOUR: Record<Kind, string | undefined> = {
  choice: 'suggestion',
  'go-ahead': 'warning',
  finding: 'claude',
  question: 'error',
  assumption: undefined,
}

/** A kind's own colour; undefined is the theme's text colour. */
export function kindColour(kind: Kind): string | undefined {
  return KIND_COLOUR[kind]
}

/** The kind as its inverse label names it: `QUESTION`, `GO-AHEAD`. */
export function kindLabel(kind: Kind): string {
  return kind.toUpperCase()
}

/** The bar's colour: by kind while it waits, `success` once answered, `dim` once sent or parked. */
export function barColour(d: Pick<Decision, 'kind' | 'state'>): string | undefined {
  if (d.state === 'ready') {
    return 'success'
  }
  if (d.state === 'sent' || d.state === 'parked' || d.state === 'superseded' || d.state === 'withdrawn') {
    return 'dim'
  }

  return kindColour(d.kind)
}

/** The background of the row or option the ring is on (row 251): the theme has no selection colour, so the chips' grey. */
export const SELECTED_BG = 'subtle'

/** Text props for a colour that may be `dim` or the plain text colour. */
export function colourProps(colour: string | undefined): { color?: string; dimColor?: boolean } {
  if (colour === 'dim') {
    return { dimColor: true }
  }

  return colour === undefined ? {} : { color: colour }
}

/** The one-column bar every row and the decision screen draw on the left. */
export function Bar(ui: { Text: any }, colour: string | undefined, key?: string): any {
  const { Text } = ui

  return (
    <Text key={key} {...colourProps(colour)}>
      ▌
    </Text>
  )
}

/** A run of text with one look. `href` makes it a link whose text is a short label. */
export type Segment = { text: string; code?: true; bold?: true; italic?: true; href?: string }

const WORD = /[\p{L}\p{N}_]/u

/** The short label a URL is drawn with: `artifact ↗`, `#12 ↗` for a pull request or issue, else the host and last path part. */
export function urlLabel(url: string): string {
  const match = /^https?:\/\/([^/?#]+)([^?#]*)/i.exec(url)
  if (!match) {
    return `${url} ↗`
  }
  const host = match[1]!.toLowerCase().replace(/^www\./, '')
  const parts = match[2]!.split('/').filter(p => p !== '')
  if (host === 'claude.ai' && parts.includes('artifact')) {
    return 'artifact ↗'
  }
  const numbered = /^(?:pull|issues)$/.test(parts[2] ?? '') ? parts[3] : undefined
  if (host === 'github.com' && numbered !== undefined && /^\d+$/.test(numbered)) {
    return `#${numbered} ↗`
  }
  const last = parts.at(-1)

  return last === undefined ? `${host} ↗` : `${host}/${last} ↗`
}

/** A URL starting at `at`, without the punctuation that ends a sentence. */
function urlAt(text: string, at: number): string | undefined {
  if (!/^https?:\/\//i.test(text.slice(at, at + 8)) || (at > 0 && WORD.test(text[at - 1]!))) {
    return undefined
  }
  let url = /^\S+/.exec(text.slice(at))![0]
  while (/[.,;:!?'"]$/.test(url) || (url.endsWith(')') && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0))) {
    url = url.slice(0, -1)
  }

  return /^https?:\/\/[^/\s]+/i.test(url) ? url : undefined
}

/** Where a run opened by `marker` at `at` closes, or -1 when it is unbalanced. */
function closingOf(text: string, at: number, marker: string): number {
  const start = at + marker.length
  if (start >= text.length || /\s/.test(text[start]!)) {
    return -1
  }
  if (marker !== '**' && at > 0 && WORD.test(text[at - 1]!)) {
    return -1
  }
  for (let i = text.indexOf(marker, start + 1); i !== -1; i = text.indexOf(marker, i + 1)) {
    const after = text[i + marker.length]
    if (/\s/.test(text[i - 1]!) || text[i - 1] === '\n') {
      continue
    }
    if (marker === '**' || after === undefined || !WORD.test(after)) {
      if (marker === '*' && after === '*') {
        continue
      }
      return i
    }
  }

  return -1
}

function push(out: Segment[], segment: Segment): void {
  if (segment.text === '') {
    return
  }
  const last = out.at(-1)
  if (last && sameLook(last, segment)) {
    last.text += segment.text
  } else {
    out.push({ ...segment })
  }
}

function sameLook(a: Segment, b: Segment): boolean {
  return a.code === b.code && a.bold === b.bold && a.italic === b.italic && a.href === b.href && a.href === undefined
}

function withLook(segments: Segment[], look: { bold?: true; italic?: true }): Segment[] {
  return segments.map(s => (s.code || s.href ? s : { ...s, ...look }))
}

/**
 * Claude's text as runs: `code` without its backticks, `**bold**`, `_italic_` or `*italic*` without their markers,
 * and a URL as a link with a short label. Anything unbalanced is kept as typed.
 */
export function parseInline(text: string): Segment[] {
  const out: Segment[] = []
  let plain = ''
  const flush = () => {
    push(out, { text: plain })
    plain = ''
  }
  let i = 0
  while (i < text.length) {
    const c = text[i]!
    if (c === '`') {
      const end = text.indexOf('`', i + 1)
      if (end > i + 1 && !text.slice(i + 1, end).includes('\n')) {
        flush()
        out.push({ text: text.slice(i + 1, end), code: true })
        i = end + 1
        continue
      }
      // An empty or unclosed pair: every backtick in the run stays as typed.
      const run = /^`+/.exec(text.slice(i))![0]
      plain += run
      i += run.length
      continue
    }
    const marker = text.startsWith('**', i) ? '**' : c === '*' || c === '_' ? c : undefined
    if (marker !== undefined) {
      const end = closingOf(text, i, marker)
      if (end !== -1) {
        flush()
        const inner = parseInline(text.slice(i + marker.length, end))
        for (const s of withLook(inner, marker === '**' ? { bold: true } : { italic: true })) {
          push(out, s)
        }
        i = end + marker.length
        continue
      }
      plain += marker
      i += marker.length
      continue
    }
    const url = c === 'h' || c === 'H' ? urlAt(text, i) : undefined
    if (url !== undefined) {
      flush()
      out.push({ text: urlLabel(url), href: url })
      i += url.length
      continue
    }
    plain += c
    i += 1
  }
  flush()

  return out
}

/** The text as it is drawn, markers gone and URLs as their labels: what wrapping measures. */
export function visibleText(text: string): string {
  return parseInline(text)
    .map(s => s.text)
    .join('')
}

/** Splits a word (runs with no space between them) at `room` visible characters. A link is never split. */
function splitWord(word: Segment[], room: number): [Segment[], Segment[]] {
  const head: Segment[] = []
  let left = room
  for (let k = 0; k < word.length; k++) {
    const s = word[k]!
    if (s.text.length <= left) {
      head.push(s)
      left -= s.text.length
      continue
    }
    if (s.href !== undefined) {
      return head.length === 0 ? [[s], word.slice(k + 1)] : [head, word.slice(k)]
    }
    if (left > 0) {
      head.push({ ...s, text: s.text.slice(0, left) })
    }

    return [head, [{ ...s, text: s.text.slice(left) }, ...word.slice(k + 1)]]
  }

  return [head, []]
}

const widthOf = (runs: Segment[]) => runs.reduce((n, s) => n + s.text.length, 0)

/** Claude's text broken into lines of at most `width` visible columns, at spaces where it can be, each line its runs. */
export function wrapInline(text: string, width: number): Segment[][] {
  const room = Math.max(1, width)
  const paragraphs: Segment[][][] = [[]]
  let word: Segment[] = []
  const endWord = () => {
    if (word.length > 0) {
      paragraphs.at(-1)!.push(word)
      word = []
    }
  }
  for (const s of parseInline(text)) {
    if (s.href !== undefined) {
      // A link's label keeps its space: it wraps as one word.
      word.push(s)
      continue
    }
    for (const piece of s.text.split(/(\s)/)) {
      if (piece === '\n') {
        endWord()
        paragraphs.push([])
      } else if (/^\s$/.test(piece)) {
        endWord()
      } else if (piece !== '') {
        word.push({ ...s, text: piece })
      }
    }
  }
  endWord()

  const lines: Segment[][] = []
  for (const words of paragraphs) {
    let line: Segment[] = []
    for (let w of words) {
      while (widthOf(w) > room) {
        if (line.length > 0) {
          lines.push(line)
          line = []
        }
        const [head, rest] = splitWord(w, room)
        lines.push(head)
        w = rest
      }
      if (w.length === 0) {
        continue
      }
      if (line.length === 0) {
        line = [...w]
      } else if (widthOf(line) + 1 + widthOf(w) <= room) {
        line = [...line, { text: ' ' }, ...w]
      } else {
        lines.push(line)
        line = [...w]
      }
    }
    lines.push(line)
  }

  return lines
    .map(merge)
    .filter((l, i, all) => l.length > 0 || i < all.length - 1)
}

function merge(line: Segment[]): Segment[] {
  const out: Segment[] = []
  for (const s of line) {
    push(out, s)
  }

  return out
}

/** Text props a Text takes. */
export type TextLook = { color?: string; dimColor?: boolean; bold?: boolean; italic?: boolean; backgroundColor?: string; strikethrough?: boolean }

/** One line of runs as a Text: code in `suggestion`, bold, italic, and links as `Link`s. */
export function Inline(ui: { Text: any; Link?: any }, segments: Segment[], base: TextLook = {}, key?: string): any {
  const { Text, Link } = ui

  return (
    <Text key={key} {...base}>
      {segments.map((s, index) => {
        if (s.href !== undefined && Link) {
          return (
            <Link key={`s${index}`} href={s.href}>
              {s.text}
            </Link>
          )
        }
        if (s.code) {
          return (
            <Text key={`s${index}`} color="suggestion">
              {s.text}
            </Text>
          )
        }
        if (s.bold || s.italic) {
          return (
            <Text key={`s${index}`} bold={s.bold} italic={s.italic}>
              {s.text}
            </Text>
          )
        }

        return s.text
      })}
    </Text>
  )
}

/** Claude's text wrapped to `width`, one Text per line. */
export function InlineLines(ui: { Text: any; Link?: any }, text: string, width: number, base: TextLook = {}, key = 'inline'): any[] {
  return wrapInline(text, width).map((line, index) => Inline(ui, line, base, `${key}:${index}`))
}

const SPEAKER: Record<string, string> = { person: 'you', claude: 'claude', fork: 'fork', quick: 'quick model' }

/** How long ago, short, for a chat line: `now`, `2m`, `3h`, else the clock time. */
export function shortAgo(at: string, now: Date = new Date()): string {
  const long = ago(at, now)
  if (long === 'just now') {
    return 'now'
  }

  return long.replace(/ ago$/, '')
}

/** The speaker and age a chat entry starts with, then two spaces: `claude · now  `. */
export function chatPrefix(e: Pick<ThreadEntry, 'who' | 'at'>, now: Date = new Date()): string {
  return `${SPEAKER[e.who] ?? e.who} · ${shortAgo(e.at, now)}  `
}

/** Rows a chat entry takes at `width`: its text wrapped under itself after the prefix. */
export function chatRows(e: Pick<ThreadEntry, 'who' | 'at' | 'text'>, width: number, now: Date = new Date()): number {
  return wrapInline(e.text, Math.max(8, width - chatPrefix(e, now).length)).length
}

/**
 * One thread entry as a chat line (row 251): the speaker in `suggestion` (you) or `claude`, the age dim, the text
 * after it on the same line and wrapped under itself.
 */
export function ChatEntry(ui: { Box: any; Text: any; Link?: any }, e: Pick<ThreadEntry, 'who' | 'at' | 'text'>, width: number, key: string, now: Date = new Date()): any {
  const { Box, Text } = ui
  const prefix = chatPrefix(e, now)
  const speaker = SPEAKER[e.who] ?? e.who
  const lines = wrapInline(e.text, Math.max(8, width - prefix.length))

  // The speaker in a column of its own, so the text wraps under itself and each line stays whole.
  return (
    <Box key={key}>
      <Box flexDirection="column" width={prefix.length}>
        <Text>
          <Text color={e.who === 'person' ? 'suggestion' : 'claude'}>{speaker}</Text>
          <Text dimColor>{prefix.slice(speaker.length)}</Text>
        </Text>
      </Box>
      <Box flexDirection="column">{lines.map((line, index) => Inline(ui, line, {}, `${key}:${index}`))}</Box>
    </Box>
  )
}
