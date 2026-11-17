/**
 * Lays out a drawn pane tree the way the terminal stacks it, closely enough to check sizes: each
 * Text and Button with the row it starts on, how wide it is and how much room it had. The kit gives
 * the tree, not the painted screen, so this stands in for the paint (see tests/sizes/README.md).
 */

export type Placed = { kind: 'Text' | 'Button'; key?: string; text: string; width: number; room: number; row: number; height: number; isCut: boolean }

export type Layout = {
  /** Rows the whole tree takes. */
  rows: number
  /** Every Text and Button, in drawing order. */
  leaves: Placed[]
  /** The row each keyed element starts on. */
  rowOf: Map<string, number>
}

/** The columns a string takes on a terminal: wide East Asian characters and emoji take two, combining marks none. */
export function displayWidth(text: string): number {
  let width = 0
  for (const char of text) {
    const code = char.codePointAt(0)!
    if (code === 0x200d || (code >= 0x300 && code <= 0x36f) || (code >= 0xfe00 && code <= 0xfe0f)) {
      continue
    }
    const isWide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe4f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f300 && code <= 0x1f64f) ||
      (code >= 0x1f900 && code <= 0x1f9ff) ||
      (code >= 0x20000 && code <= 0x3fffd)
    width += isWide ? 2 : 1
  }

  return width
}

/** The text a Text or a Button's children draw, nested Texts joined. */
function textOf(children: unknown): string {
  if (children === null || children === undefined || typeof children === 'boolean') {
    return ''
  }
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children)
  }
  if (Array.isArray(children)) {
    return children.map(textOf).join('')
  }
  const node = children as { children?: unknown }

  return textOf(node.children)
}

const CUT = new Set(['end', 'middle', 'truncate', 'truncate-start', 'truncate-middle', 'truncate-end', 'clip'])

function num(value: unknown): number {
  return typeof value === 'number' ? value : 0
}

/** Lays the tree out in `columns`. */
export function layout(tree: unknown, columns: number): Layout {
  const leaves: Placed[] = []
  const rowOf = new Map<string, number>()

  const place = (node: any, room: number, row: number): { width: number; height: number } => {
    if (node === null || node === undefined || node === '' || typeof node === 'boolean') {
      return { width: 0, height: 0 }
    }
    if (Array.isArray(node)) {
      // A bare array stacks as its parent would; callers pass arrays through the Box rules below.
      let height = 0
      let width = 0
      for (const child of node) {
        const size = place(child, room, row + height)
        height += size.height
        width = Math.max(width, size.width)
      }
      return { width, height }
    }
    if (typeof node === 'string' || typeof node === 'number') {
      node = { type: 'Text', props: {}, children: [String(node)] }
    }
    const key = node.props?.key
    if (typeof key === 'string' && !rowOf.has(key)) {
      rowOf.set(key, row)
    }
    if (node.type === 'Text') {
      const text = textOf(node.children)
      const lines = text.split('\n')
      const width = Math.max(0, ...lines.map(displayWidth))
      const isCut = CUT.has(node.props?.wrap)
      const height = isCut ? lines.length : lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(displayWidth(line) / Math.max(1, room))), 0)
      leaves.push({ kind: 'Text', key, text, width, room, row, height, isCut })
      return { width: Math.min(width, room), height }
    }
    if (node.type === 'Button') {
      const inner = textOf(node.children)
      const text = node.props?.plain || inner !== '' ? inner : `[ ${node.props?.label ?? ''} ]`
      const width = displayWidth(text)
      leaves.push({ kind: 'Button', key, text, width, room, row, height: 1, isCut: true })
      return { width: Math.min(width, room), height: 1 }
    }
    // A Box, or anything else that holds children.
    const p = node.props ?? {}
    const border = p.borderStyle ? 1 : 0
    const padX = num(p.paddingX) || num(p.padding)
    const padLeft = num(p.paddingLeft) || padX
    const padRight = num(p.paddingRight) || padX
    const padY = num(p.paddingY) || num(p.padding)
    const padTop = num(p.paddingTop) || padY
    const padBottom = num(p.paddingBottom) || padY
    const marginX = num(p.marginLeft) + num(p.marginRight)
    const outer = Math.min(room, typeof p.width === 'number' ? p.width : room) - marginX
    const inner = outer - 2 * border - padLeft - padRight
    const kids = (node.children ?? []).flat(Infinity)
    const top = row + border + padTop + num(p.marginTop)
    let width = 0
    let height = 0
    if (p.flexDirection === 'column') {
      for (const child of kids) {
        const size = place(child, inner, top + height)
        height += size.height
        width = Math.max(width, size.width)
      }
    } else {
      for (const child of kids) {
        const size = place(child, Math.max(0, inner - width), top)
        width += size.width
        height = Math.max(height, size.height)
      }
    }

    return {
      width: (typeof p.width === 'number' ? p.width : width + 2 * border + padLeft + padRight) + marginX,
      height: height + 2 * border + padTop + padBottom + num(p.marginTop) + num(p.marginBottom),
    }
  }

  const { height } = place(tree, columns, 0)

  return { rows: height, leaves, rowOf }
}

/**
 * What the terminal would cut: a Button wider than its room (a Button holds one row), or a Text
 * set to cut rather than wrap. A Text that wraps is not counted; `layout` gives it the rows it
 * wraps onto, so it shows up instead as whatever it pushes out of view.
 */
export function overflows(l: Layout): Placed[] {
  return l.leaves.filter(leaf => leaf.width > leaf.room && (leaf.kind === 'Button' || leaf.isCut))
}
