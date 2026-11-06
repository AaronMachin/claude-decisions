import type { Register } from 'claude-code'

import { changed, followFocus, openFocused, openForNewDecision, refreshStatus, renderPane } from './pane/render'
import { configure, onTurnComplete, onTurnStart } from './discuss'
import { addContextBlock, addRulesSection, answerAskUserQuestion, noteAtSessionStart, noteOnSubmit, nudgeAfterTurn, onCompact, refuseSubagent } from './integrate'
import { PANE_ID } from './pane/decision'
import { ADD_TOOL, LIST_TOOL, UPDATE_TOOL, addDecision, listDecisions, registerTools, updateDecision } from './tool'

export const register: Register = (on, options) => {
  configure(options)

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'decisions', description: 'Open the decisions pane' })
    await registerTools($)
    await refreshStatus($).catch(() => undefined)
    await noteAtSessionStart($).catch(() => undefined)

    return next(e)
  })

  on('command.run', { command: 'decisions' }, $ => openFocused($))

  on('tool.call', { tool: ADD_TOOL }, async ($, e) => {
    const refused = refuseSubagent(e)
    if (refused) {
      return refused
    }
    const answer = await addDecision($, e)
    if ('result' in answer) {
      await openForNewDecision($)
    }

    return answer
  }).catch(() => ({ deny: 'decisions_add failed: the decisions could not be read or written. Say so in chat instead of retrying.' }))

  on('tool.call', { tool: LIST_TOOL }, $ => listDecisions($)).catch(() => ({ deny: 'decisions_list failed: the decisions could not be read.' }))

  on('tool.call', { tool: UPDATE_TOOL }, async ($, e) => {
    const refused = refuseSubagent(e)
    if (refused) {
      return refused
    }
    const answer = await updateDecision($, e)
    if ('result' in answer) {
      await changed($)
    }

    return answer
  }).catch(() => ({ deny: 'decisions_update failed: the decision could not be read or written. Say so in chat instead of retrying.' }))

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e) => {
    const refused = refuseSubagent(e)
    if (refused) {
      return refused
    }
    const answer = await answerAskUserQuestion($, e)
    if ('result' in answer) {
      await openForNewDecision($)
    }

    return answer
  }).catch(() => ({ deny: 'The decisions pane could not be written. Ask in chat this once.' }))

  on('prompt.compose', async ($, e, next) => addRulesSection(await next(e)))

  on('prompt.context', async ($, e, next) => {
    const context = await next(e)

    return addContextBlock($, context).catch(() => context)
  })

  on('prompt.submit', async ($, e, next) => {
    await noteOnSubmit($).catch(() => undefined)

    return next(e)
  })

  on('session.compact', (_$, e, next) => onCompact(e, next))

  on('turn.start', ($, e, next) => onTurnStart($, e, next))

  on('turn.complete', async ($, e, next) => {
    const done = await onTurnComplete($, e, next)
    await nudgeAfterTurn($, e).catch(() => undefined)

    return done
  })

  on('ui.focus', async ($, e, next) => {
    if (e.requestId === PANE_ID) {
      await followFocus($, e.element)
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, ($, e) => renderPane($, e))
}
