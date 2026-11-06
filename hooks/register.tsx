import type { Register } from 'claude-code'

import { changed, followFocus, openFocused, openForNewDecision, refreshStatus, renderPane } from './pane/render'
import { PANE_ID } from './pane/decision'
import { ADD_TOOL, LIST_TOOL, UPDATE_TOOL, addDecision, listDecisions, registerTools, updateDecision } from './tool'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'decisions', description: 'Open the decisions pane' })
    await registerTools($)
    await refreshStatus($).catch(() => undefined)

    return next(e)
  })

  on('command.run', { command: 'decisions' }, $ => openFocused($))

  on('tool.call', { tool: ADD_TOOL }, async ($, e) => {
    const answer = await addDecision($, e)
    if ('result' in answer) {
      await openForNewDecision($)
    }

    return answer
  }).catch(() => ({ deny: 'decisions_add failed: the decisions could not be read or written. Say so in chat instead of retrying.' }))

  on('tool.call', { tool: LIST_TOOL }, $ => listDecisions($)).catch(() => ({ deny: 'decisions_list failed: the decisions could not be read.' }))

  on('tool.call', { tool: UPDATE_TOOL }, async ($, e) => {
    const answer = await updateDecision($, e)
    if ('result' in answer) {
      await changed($)
    }

    return answer
  }).catch(() => ({ deny: 'decisions_update failed: the decision could not be read or written. Say so in chat instead of retrying.' }))

  on('ui.focus', async ($, e, next) => {
    if (e.requestId === PANE_ID) {
      await followFocus($, e.element)
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, ($, e) => renderPane($, e))
}
