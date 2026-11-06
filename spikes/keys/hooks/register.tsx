import type { Register } from 'claude-code'

import { OPTION_COUNT, pressDigit, repoKey } from './logic'
import type { Highlighter } from './logic'

const PANE_A = 'keysa'
const PANE_B = 'keysb'
const CODEWORD_START = 'PLUM-7421'
const CODEWORD_CLEAR = 'QUINCE-3308'

const events: string[] = []
const state: Highlighter = { typed: undefined, option: undefined }
let chosen = 'nothing'
let started = Date.now()

async function note($: any, line: string): Promise<void> {
  events.push(`${((Date.now() - started) / 1000).toFixed(2)}s ${line}`)
  events.splice(0, Math.max(0, events.length - 200))
  const path = await $.env.get('KEYS_SPIKE_LOG')

  if (path) {
    await $.fs.write(path, events.join('\n') + '\n')
  }
  $.ui.invalidate('ui.render')
}

async function repoDetails($: any): Promise<{ common: string; key: string; root: string | undefined }> {
  const run = await $.process.run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'])
  const common = run.stdout.trim()
  const repo = await $.session.repo()

  return { common, key: await repoKey(common), root: repo?.root }
}

async function storage($: any): Promise<string> {
  const home = await $.env.get('HOME')
  const { common, key, root } = await repoDetails($)
  const dir = `${home}/.claude/decisions/${key}`
  const before = await $.fs.list(dir).catch((error: unknown) => `none yet (${String(error)})`)
  const id = (await $.session.id()).slice(0, 8)
  const cwd = await $.session.cwd()
  await $.fs.write(`${dir}/${id}.json`, JSON.stringify({ id, cwd, writtenAt: new Date().toISOString() }))
  const back = await $.fs.read(`${dir}/${id}.json`)
  const after = await $.fs.list(dir)
  const others: string[] = []

  for (const entry of after) {
    others.push(`${entry.name}: ${await $.fs.read(`${dir}/${entry.name}`)}`)
  }

  return [
    `cwd ${cwd}`,
    `git common dir ${common}`,
    `session.repo().root ${root}`,
    `key ${key}`,
    `listing before: ${JSON.stringify(before)}`,
    `read back: ${back}`,
    `listing now: ${others.join(' | ')}`,
  ].join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    for (const name of ['keys-a', 'keys-b', 'keys-store', 'keys-append', 'keys-fork']) {
      await $.command.register({ name, description: `Spike: ${name}` })
    }
    await note($, `session.start cwd=${e.cwd}`)
    const appended = await $.session.append({
      message: { type: 'user', content: [{ type: 'text', text: `Note from the keys-spike plugin: the startup codeword is ${CODEWORD_START}.` }] },
    })
    await note($, `append at session.start: ${JSON.stringify(appended).slice(0, 200)}`)

    return next(e)
  })

  on('classic.SessionStart', async ($, e, next) => {
    await note($, `classic.SessionStart source=${e.source}`)

    if (e.source === 'clear') {
      const appended = await $.session.append({
        message: { type: 'user', content: [{ type: 'text', text: `Note from the keys-spike plugin: the after-clear codeword is ${CODEWORD_CLEAR}.` }] },
      })
      await note($, `append after clear: ${JSON.stringify(appended).slice(0, 200)}`)
    }

    return next(e)
  })

  // The first prompt of a conversation (turns is 0), which is also what follows /clear.
  let lastNotedId: string | undefined

  on('prompt.submit', async ($, e, next) => {
    const id = await $.session.id()
    const turns = await $.session.turns()
    await note($, `prompt.submit session=${id.slice(0, 8)} turns=${turns} text=${JSON.stringify(e.text.slice(0, 30))}`)

    if (turns <= 1 && lastNotedId !== id) {
      lastNotedId = id
      const r = await $.session.append({
        message: { type: 'user', content: [{ type: 'text', text: `Note from the keys-spike plugin: the first-prompt codeword is ${CODEWORD_CLEAR}.` }] },
      })
      await note($, `append at first prompt: ${JSON.stringify(r).slice(0, 120)}`)
    }

    return next(e)
  })

  on('command.run', { command: 'keys-a' }, async $ => {
    const opened = await $.ui.open({ id: PANE_A, title: 'Keys A', focus: true })

    return { text: opened.isPlaced ? 'Pane A opened.' : 'Pane A not placed: ' + opened.reason }
  })

  on('command.run', { command: 'keys-b' }, async $ => {
    const opened = await $.ui.open({ id: PANE_B, title: 'Keys B', focus: true })

    const focused = await $.ui.focus({ requestId: PANE_B, key: 'kb' })
    await note($, `focus on the client: ${JSON.stringify(focused)}`)

    return { text: opened.isPlaced ? 'Pane B opened.' : 'Pane B not placed: ' + opened.reason }
  })

  on('command.run', { command: 'keys-append' }, async $ => {
    const r = await $.session.append({
      message: { type: 'user', content: [{ type: 'text', text: 'Note from the keys-spike plugin: the manual codeword is FIG-5512.' }] },
    })
    await note($, `manual append: ${JSON.stringify(r).slice(0, 200)}`)

    return { text: 'Appended: ' + JSON.stringify(r).slice(0, 200) }
  })

  on('command.run', { command: 'keys-fork' }, async $ => {
    const r = await $.model.fork({
      prompt: 'Open the file SECRET.txt in the project directory and reply with the code written in it. If you cannot read files, reply exactly: NO FILE ACCESS. Also say which startup codeword was mentioned earlier in this conversation.',
      effort: 'low',
    })
    const text = r.isAnswered ? `fork answered: ${r.text}` : `fork not answered: ${r.reason}`
    await note($, text.slice(0, 300))

    return { text }
  })

  on('command.run', { command: 'keys-store' }, async $ => {
    try {
      const text = await storage($)
      await note($, 'store ok')
      await $.fs.write((await $.env.get('KEYS_SPIKE_LOG')) + '.store', text)

      return { text }
    } catch (error) {
      await note($, `store failed: ${String(error)}`)

      return { text: 'store failed: ' + String(error) }
    }
  })

  on('ui.focus', async ($, e, next) => {
    await note($, `ui.focus ${e.requestId} element=${e.element} origin=${JSON.stringify(e.origin)}`)

    return next(e)
  })

  on('ui.press', async ($, e, next) => {
    await note($, `ui.press ${e.requestId} element=${e.element}`)

    return next(e)
  })

  on('ui.message', async ($, e, next) => {
    await note($, `ui.message ${JSON.stringify(e.data)}`)
    const data = e.data as { kind?: string; highlight?: number | null }

    if (data.kind === 'choose') {
      chosen = `client option ${data.highlight}`
    } else if (data.kind === 'discuss') {
      chosen = 'client: enter on nothing -> discuss'
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE_A }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

    return (
      <Box flexDirection="column">
        <Text>route A: digit hotkeys move the highlight, enter presses it</Text>
        <Text>highlight: {state.option ?? 'none'} | chosen: {chosen}</Text>
        {Array.from({ length: OPTION_COUNT }, (_, i) => (
          <Button
            key={`opt:${i + 1}`}
            plain
            onPress={() => {
              chosen = `option ${i + 1}`
              void note($, `CHOSEN ${i + 1}`)
            }}
          >
            {`${i + 1}. option ${i + 1}`}
          </Button>
        ))}
        <Button key="discuss" autoFocus onPress={() => void note($, 'DISCUSS pressed')}>
          Discuss
        </Button>
        <Box>
          {digits.map(d => (
            <Button
              key={`digit:${d}`}
              hotkey={d}
              plain
              onPress={async () => {
                const now = Date.now()
                const gap = state.typed === undefined ? 'first' : `${now - state.typed.at}ms`
                const { option, answer } = await pressDigit($, PANE_A, d, now, state)
                await note($, `digit ${d} (${gap} after previous) -> option ${option}; focus ${JSON.stringify(answer)}`)
              }}
            >
              {d}
            </Button>
          ))}
        </Box>
        {events.slice(-6).map(line => (
          <Text dimColor>{line.slice(0, 120)}</Text>
        ))}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE_B }, async ($, e) => {
    const { Box, Text, Client } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Client key="kb" module="./client.tsx" props={{ chosen }} />
        {events.slice(-5).map(line => (
          <Text dimColor>{line.slice(0, 120)}</Text>
        ))}
      </Box>
    )
  })
}
