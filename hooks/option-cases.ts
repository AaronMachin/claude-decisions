import type { Decision, Option } from './store'

/**
 * An option's case (decision 303): its pros, its cons, and on an option other than the recommended one why
 * Claude didn't pick it. Older decisions carry `why` and `whyNot`, read here as one pro and one con, so they
 * keep drawing as before.
 */

type Cased = Pick<Option, 'id' | 'pros' | 'cons' | 'notChosen' | 'why' | 'whyNot'>

export function prosOf(o: Partial<Cased>): string[] {
  return [...(o.why ? [o.why] : []), ...(o.pros ?? [])]
}

export function consOf(o: Partial<Cased>): string[] {
  return [...(o.whyNot ? [o.whyNot] : []), ...(o.cons ?? [])]
}

/** Why it wasn't picked, never on whichever option is recommended now (an update can move the recommendation). */
export function notChosenOf(d: Pick<Decision, 'recommendation'>, o: Partial<Cased>): string | undefined {
  return o.notChosen && d.recommendation?.option !== o.id ? o.notChosen : undefined
}

/** The case as plain lines under an option in a prompt: `+ pro`, `- con`, `not picked: …`, each after `indent`. */
export function caseLines(d: Pick<Decision, 'recommendation'>, o: Partial<Cased>, indent: string): string[] {
  const notChosen = notChosenOf(d, o)

  return [
    ...prosOf(o).map(pro => `${indent}+ ${pro}`),
    ...consOf(o).map(con => `${indent}- ${con}`),
    ...(notChosen ? [`${indent}not picked: ${notChosen}`] : []),
  ]
}
