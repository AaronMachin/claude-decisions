import type { PlanItem, SessionLink, SessionRecord } from '../session'
import { visibleText, wrapInline } from './style'

export type CardLine = { text: string; dim?: true }

const INDENT = '  '

function wrapped(text: string, width: number, first = ''): string[] {
  const room = Math.max(8, width - INDENT.length)
  return wrapInline(`${first}${text}`, room).map(line => `${INDENT}${line.map(s => s.text).join('')}`)
}

function nextUp(plan: PlanItem[]): { text: string; waitsOn?: string[] } | undefined {
  const active = plan.find(item => item.status === 'active')
  if (active) {
    return active.steps?.find(step => step.status !== 'done') ?? active
  }

  return plan.find(item => item.status === 'todo')
}

function progress(plan: PlanItem[]): string | undefined {
  if (plan.length === 0) {
    return undefined
  }
  const done = plan.filter(item => item.status === 'done').length
  const next = nextUp(plan)
  const waits = next?.waitsOn?.length ? ` (waits on ${next.waitsOn.join(', ')})` : ''

  return `Plan ${done} of ${plan.length} done${next ? ` · next: ${visibleText(next.text)}${waits}` : ''}`
}

function prName(link: SessionLink): string {
  const number = /^#\d+/.exec(link.label)?.[0] ?? (/\/pull\/(\d+)/.exec(link.url)?.[1] ? `#${/\/pull\/(\d+)/.exec(link.url)?.[1]}` : 'PR')

  return link.state ? `${number} ${link.state}` : number
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function linksLine(links: SessionLink[]): string | undefined {
  const pages = links.filter(l => l.kind === 'artifact').length
  const others = links.filter(l => l.kind === 'link').length
  const parts = [
    ...links.filter(l => l.kind === 'pr').map(prName),
    ...(pages > 0 ? [plural(pages, 'page')] : []),
    ...(others > 0 ? [plural(others, 'link')] : []),
  ]

  return parts.length > 0 ? parts.join(' · ') : undefined
}

/**
 * The session card's lines under its title (row 288): the summary, dim; the now line; the
 * plan's progress and what is next; the links, PRs with their state. Each wraps in full rather
 * than being cut (262). A compact pane keeps only the now line.
 */
export function cardLines(record: Pick<SessionRecord, 'summary' | 'now' | 'plan' | 'links'>, width: number, compact = false): CardLine[] {
  const now = record.now ? wrapped(record.now.text, width, '▶ now: ').map(text => ({ text })) : []
  if (compact) {
    return now
  }
  const summary = record.summary ? wrapped(record.summary, width).map(text => ({ text, dim: true as const })) : []
  const plan = progress(record.plan ?? [])
  const links = linksLine(record.links ?? [])

  return [
    ...summary,
    ...now,
    ...(plan ? wrapped(plan, width).map(text => ({ text })) : []),
    ...(links ? wrapped(links, width).map(text => ({ text })) : []),
  ]
}
