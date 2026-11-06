import type { Register } from 'claude-code'

const PANE = 'discuss'
const PLUGIN = 'discuss-spike'
const MODELS = { agent: 'sonnet', quick: 'haiku' } as const
const TITLES: Record<string, string> = { '3': 'When a shared recipe link expires' }

export type Mode = 'main' | 'fork' | 'agent' | 'quick'
export type Message = { from: 'person' | Mode; text: string; seconds?: number }

const threads = new Map<string, Message[]>()
const events: string[] = []
const mainWaiters: Array<(text: string) => void> = []
const agentWaiters = new Map<string, (text: string) => void>()
const agentAnswers = new Map<string, string>()
const watchedAgents = new Set<string>()
let expectedMainTurn: string | undefined
let isAgentRegistered = false
let startedAt = Date.now()

export function threadOf(decisionId: string): Message[] {
  return threads.get(decisionId) ?? []
}

function add(decisionId: string, message: Message): void {
  threads.set(decisionId, [...threadOf(decisionId), message])
}

function note(line: string): void {
  events.push(`${((Date.now() - startedAt) / 1000).toFixed(1)}s ${line}`)
  events.splice(0, Math.max(0, events.length - 12))
}

async function agentReply($: any, text: string): Promise<string> {
  if (!isAgentRegistered) {
    await $.agent.register({
      name: 'discuss',
      description: 'Answers a question about one decision. Read only.',
      prompt:
        'You answer one question about a decision in a software project. Read files if that helps. Reply in at most three sentences.',
      tools: ['Read', 'Grep', 'Glob'],
      model: MODELS.agent,
    })
    isAgentRegistered = true
  }

  const spawned = await $.agent.spawn({
    subagentType: `${PLUGIN}:discuss`,
    prompt: text,
    description: 'discussion reply',
  })

  if (spawned.deny !== undefined || spawned.agentId === undefined) {
    return `(no agent: ${spawned.deny ?? 'no id'})`
  }

  const id: string = spawned.agentId
  watchedAgents.add(id)
  note(`agent ${id} spawned`)
  const early = agentAnswers.get(id)

  if (early !== undefined) {
    return early
  }

  return new Promise<string>(resolve => agentWaiters.set(id, resolve))
}

/** Asks the chosen replier about one decision and keeps both messages in its thread. */
export async function ask($: any, mode: Mode, decisionId: string, text: string): Promise<{ text: string }> {
  const t0 = Date.now()
  add(decisionId, { from: 'person', text })
  note(`${mode} asked`)
  let reply = ''

  if (mode === 'main') {
    expectedMainTurn = undefined
    const waiting = new Promise<string>(resolve => mainWaiters.push(resolve))
    await $.prompt.submit({ text: `On decision ${decisionId}: ${text}` })
    reply = await waiting
  } else if (mode === 'fork') {
    const r = await $.model.fork({ prompt: text })
    reply = r.isAnswered ? r.text : `(no reply: ${r.reason})`
  } else if (mode === 'quick') {
    const r = await $.model.complete({ model: MODELS.quick, prompt: text })
    reply = r.isAnswered ? r.text : `(no reply: ${r.reason})`
  } else {
    reply = await agentReply($, text)
  }

  const seconds = Math.round((Date.now() - t0) / 100) / 10
  add(decisionId, { from: mode, text: reply, seconds })
  note(`${mode} replied in ${seconds}s`)
  $.ui.invalidate('ui.render')

  return { text: reply }
}

function parse(line: string): { mode: Mode; text: string } {
  const m = /^(main|fork|agent|quick):\s*(.*)$/s.exec(line.trim())

  return m ? { mode: m[1] as Mode, text: m[2] ?? '' } : { mode: 'quick', text: line }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'discuss', description: 'Spike: open the discussion pane' })

    return next(e)
  })

  on('command.run', { command: 'discuss' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: 'Discuss', focus: true })

    return { text: opened.isPlaced ? 'Discuss pane opened.' : 'Discuss pane not placed: ' + opened.reason }
  })

  // Observation only: record where each prompt came from, never change it.
  on('prompt.submit', async ($, e, next) => {
    if (e.text.startsWith('On decision') && e.turnId !== undefined) {
      expectedMainTurn = e.turnId
    }
    note(`submit ${e.origin.kind}${e.turnId ? ' mid-turn' : ''}: ${e.text.slice(0, 40).replace(/\n/g, ' ')}`)
    $.ui.invalidate('ui.render')

    return next(e)
  })

  // A prompt that starts a turn of its own: that turn's complete is the reply, not whichever turn ended first.
  on('turn.start', async ($, e, next) => {
    note(`turn.start ${e.agentId ?? 'main'} ${e.turnId.slice(0, 6)}: ${JSON.stringify(e.text.slice(0, 30))}`)
    if (e.agentId === undefined && e.text.includes('On decision') && mainWaiters.length > 0) {
      expectedMainTurn = e.turnId
      note(`turn.start of its own (${e.turnId.slice(0, 6)})`)
    }
    $.ui.invalidate('ui.render')

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)

    if (e.agentId === undefined) {
      note(`main turn.complete ${e.turnId.slice(0, 6)}${e.turnId === expectedMainTurn ? ' (the awaited turn)' : ''}`)
      $.ui.invalidate('ui.render')
      if (e.turnId === expectedMainTurn) {
        mainWaiters.shift()?.(e.answer)
      }
    } else if (watchedAgents.has(e.agentId)) {
      note(`agent turn.complete ${e.answer.length} chars`)
      const waiting = agentWaiters.get(e.agentId)
      agentAnswers.set(e.agentId, e.answer)
      agentWaiters.delete(e.agentId)
      waiting?.(e.answer)
    }

    return done
  })

  // Streamed text of a side agent is visible here, not to the hook that spawned it.
  on('turn.step', async function* ($, e, next) {
    const watched = e.agentId !== undefined && watchedAgents.has(e.agentId)
    let first = true

    const stream = next(e)

    for await (const chunk of stream) {
      if (watched && chunk.kind === 'text' && first) {
        first = false
        note(`agent text streamed (step ${e.index})`)
      }
      yield chunk
    }

    return await stream.result
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (e.props.origin.kind !== 'composer' || e.props.text.includes('On decision')) {
      note(`UserMessage origin=${JSON.stringify(e.props.origin)} from=${e.props.from?.name} text=${JSON.stringify(e.props.text.slice(0, 40))}`)
    }
    const match = /On decision (\w+): (.*)$/s.exec(e.props.text)

    if (!match) {
      return next(e)
    }

    const label = `on ${match[1]} · ${TITLES[match[1] ?? ''] ?? 'untitled'}: ${match[2]}`

    return next({ ...e, props: { ...e.props, text: label } })
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Input } = $.ui.resolve(e)
    const rows = [...threadOf('3')].slice(-6)

    return (
      <Box flexDirection="column">
        <Text>Decision 3 - type "main: ...", "fork: ...", "agent: ..." or "quick: ..."</Text>
        {rows.map(m => (
          <Text>
            {m.from}
            {m.seconds === undefined ? '' : ` (${m.seconds}s)`}: {m.text.slice(0, 200)}
          </Text>
        ))}
        <Text dimColor>events</Text>
        {events.slice(-8).map(line => (
          <Text dimColor>{line}</Text>
        ))}
        <Input
          key="message"
          label="Ask "
          onSubmit={(value: string) => {
            const { mode, text } = parse(value)
            void ask($, mode, '3', text)
          }}
        />
      </Box>
    )
  })
}
