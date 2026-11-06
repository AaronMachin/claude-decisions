import { expect, test } from 'claude-code/testing'

import { ask, register, threadOf } from './register'

const USAGE = { input_tokens: 1, output_tokens: 1 }

/** The `$` a hook is handed, with the model and the agent mocked. */
function fake(calls: string[], over: Record<string, unknown> = {}) {
  return {
    ui: { invalidate: () => {} },
    prompt: { submit: async (i: { text: string }) => { calls.push('submit ' + i.text); return { text: i.text } } },
    model: {
      fork: async (i: { prompt: string }) => { calls.push('fork ' + i.prompt); return { isAnswered: true, text: 'fork reply', usage: USAGE } },
      complete: async (i: { model: string }) => { calls.push('complete ' + i.model); return { isAnswered: true, text: 'quick reply', usage: USAGE } },
    },
    agent: {
      register: async (s: { name: string }) => { calls.push('register ' + s.name); return { agent: 'discuss-spike:' + s.name } },
      spawn: async (s: { subagentType: string }) => { calls.push('spawn ' + s.subagentType); return { model: 'sonnet', agentId: 'a1' } },
    },
    ...over,
  }
}

/** Registers the mod's hooks on the test's `on`, answering `turn.complete` from beneath. */
function mountHere(on: any) {
  register(((name: string, ...args: any[]) => {
    const hook = args[args.length - 1]
    if (name === 'turn.start') {
      return on(name, ($: unknown, e: any) => hook($, e, async (x: any) => ({ turnId: x.turnId })))
    }
    if (name === 'turn.complete') {
      return on(name, ($: unknown, e: any) => hook($, e, async (x: any) => ({ text: x.answer })))
    }
    if (name === 'session.start' || name === 'command.run' || name === 'turn.step' || name === 'ui.render' || name === 'prompt.submit') {
      return undefined
    }
    return on(name, ...args)
  }) as any)
}

async function flush() {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve()
  }
}

async function start($: any, on: any) {
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'discuss' } }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
}

test('quick: one model call, and the thread holds both messages', async ($, on) => {
  const calls: string[] = []
  const reply = await ask(fake(calls), 'quick', '3', 'why this order?')

  expect(reply).toEqual({ text: 'quick reply' })
  expect(calls).toEqual(['complete haiku'])
  expect(threadOf('3').map(m => m.text)).toEqual(['why this order?', 'quick reply'])
  expect(threadOf('3').map(m => m.from)).toEqual(['person', 'quick'])
})

test('fork: one call over the conversation', async () => {
  const calls: string[] = []
  const reply = await ask(fake(calls), 'fork', '4', 'and this one?')

  expect(reply).toEqual({ text: 'fork reply' })
  expect(threadOf('4')).toHaveLength(2)
})

test('main: submits "On decision <id>: ..." and takes the next main-loop answer', async ($, on) => {
  // The test file and the engine load separate copies of the module, so the
  // hooks that settle `ask` are this copy's own, registered beneath the plugin.
  mountHere(on)
  await start($, on)
  const calls: string[] = []

  const pending = ask(fake(calls), 'main', '5', 'is it safe?')
  await flush()
  await $.turn.start({ text: 'On decision 5: is it safe?', turnId: 't1' })
  await $.turn.complete({ answer: 'the turn that was already running', durationMs: 5, isAborted: false, turnId: 't0', reason: 'answer' })
  await $.turn.complete({ answer: 'main reply', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  const reply = await pending

  expect(calls).toEqual(['submit On decision 5: is it safe?'])
  expect(reply).toEqual({ text: 'main reply' })
  expect(threadOf('5')).toHaveLength(2)
})

test('agent: registers a type, spawns it, and takes that agent’s own turn.complete', async ($, on) => {
  // The test file and the engine load separate copies of the module, so the
  // hooks that settle `ask` are this copy's own, registered beneath the plugin.
  mountHere(on)
  await start($, on)
  const calls: string[] = []

  const pending = ask(fake(calls), 'agent', '6', 'what does it read?')
  await flush()
  await $.turn.complete({ answer: 'someone else', durationMs: 5, isAborted: false, turnId: 't0', reason: 'answer' })
  await $.turn.complete({ answer: 'agent reply', durationMs: 5, isAborted: false, turnId: 't2', agentId: 'a1', reason: 'answer' })
  const reply = await pending

  expect(calls).toEqual(['register discuss', 'spawn discuss-spike:discuss'])
  expect(reply).toEqual({ text: 'agent reply' })
  expect(threadOf('6').map(m => m.from)).toEqual(['person', 'agent'])
})
