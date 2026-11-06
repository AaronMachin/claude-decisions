/**
 * Counts questions in a chat reply. Deliberately separate from the mod's own
 * `isQuestionsInChat`, so a disagreement between the two is a finding: this counts
 * every sentence that ends in a question mark outside a code block, except a bare
 * offer to carry on ("Want me to carry on?").
 */
export function countQuestions(text: string): number {
  const outsideCode = text.replace(/```[\s\S]*?```/g, ' ')
  const sentences = outsideCode
    .split(/\n+|(?<=[.!?])\s+/)
    .map(s => s.replace(/^[\s>*_`\-\d.)]+/, '').replace(/[*_`)"'\s]+$/, ''))
  const offer = /^(want me to|shall i|should i)\s+(carry on|continue|proceed|keep going|go ahead|move on)\b[^?]*\?$/i

  return sentences.filter(s => s.endsWith('?') && !offer.test(s)).length
}

export type TurnRow = { chat: number; flaggedBy: 'list' | 'last' | 'mid' | undefined; failed?: boolean }

export type SessionRow = { name: string; turns: number; chat: number; added: number; nudgeTurns: number; agree: number; midOnly: number; lastOnly: number; failed: number }

/** One session's row from its turns. `nudgeTurns` is how many turns the detector would nudge after (headless runs cannot see the real nudge). */
export function summarise(name: string, turns: TurnRow[], added: number): SessionRow {
  return {
    name,
    turns: turns.length,
    chat: turns.reduce((n, t) => n + t.chat, 0),
    added,
    nudgeTurns: turns.filter(t => t.flaggedBy !== undefined).length,
    agree: turns.filter(t => (t.chat > 0) === (t.flaggedBy !== undefined)).length,
    midOnly: turns.filter(t => t.flaggedBy === 'mid').length,
    lastOnly: turns.filter(t => t.flaggedBy === 'last').length,
    failed: turns.filter(t => t.failed === true).length,
  }
}

export function formatRow(r: SessionRow): string {
  return `${r.name} | ${r.turns} | ${r.chat} | ${r.added} | ${r.nudgeTurns} | ${r.agree}/${r.turns} | ${r.midOnly} | ${r.lastOnly} | ${r.failed}`
}

export const HEADER = 'name | turns | questions in chat | decisions added | detector would nudge | detector agrees | mid-text rule | last-sentence rule | failed turns'

export function formatTotals(rows: SessionRow[]): string {
  const sum = (f: (r: SessionRow) => number) => rows.reduce((n, r) => n + f(r), 0)

  return formatRow({ name: 'total', turns: sum(r => r.turns), chat: sum(r => r.chat), added: sum(r => r.added), nudgeTurns: sum(r => r.nudgeTurns), agree: sum(r => r.agree), midOnly: sum(r => r.midOnly), lastOnly: sum(r => r.lastOnly), failed: sum(r => r.failed) })
}
