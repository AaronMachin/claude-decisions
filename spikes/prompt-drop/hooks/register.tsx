import type { Register } from 'claude-code'

/** True for a line that reads as an answer to a decision, such as "d1 2". */
export function isAnswerLine(text: string): boolean {
  return /^d\d+ \d+$/.test(text.trim())
}

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    if (isAnswerLine(e.text)) {
      $.ui.status(`dropped: ${e.text.trim()}`)

      return { drop: `saved ${e.text.trim()} as an answer` }
    }

    return next(e)
  })
}
