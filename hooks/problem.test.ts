import { expect, test } from 'claude-code/testing'

import { MODEL_PROBLEM_MAX, PROBLEM_MAX, cleanProblemReply, needsProblem, problemPrompt, writeProblem } from './problem'
import { readOne, write } from './store'
import type { StoreCtx } from './store'
import { ADD_INPUT_SCHEMA, ADD_TOOL, UPDATE_INPUT_SCHEMA, UPDATE_TOOL, addDecision, updateDecision, validateAdd, validateUpdate } from './tool'

/** Waits a few milliseconds for work a hook started without waiting for it. */
const pause = (ms: number) => new Promise(resolve => (globalThis as any).setTimeout(resolve, ms))

function fakeStore(): StoreCtx & { files: Map<string, string> } {
  const files = new Map<string, string>()

  return {
    files,
    env: { get: async () => '/home/test' },
    session: { cwd: async () => '/work/pantry', id: async () => 'session-1' },
    process: { run: async () => ({ exitCode: 0, stdout: '/work/pantry/.git\n' }) },
    fs: {
      read: async (path: string) => {
        const text = files.get(path)
        if (text === undefined) {
          throw new Error('ENOENT')
        }
        return text
      },
      write: async (path: string, text: string) => void files.set(path, text),
      exists: async (path: string) => files.has(path),
      list: async (dir: string) => {
        const found = [...files.keys()].filter(p => p.startsWith(dir + '/')).map(p => ({ name: p.slice(dir.length + 1) }))
        if (found.length === 0) {
          throw new Error('ENOENT')
        }
        return found
      },
    },
  }
}

function withModel(reply: (request: any) => Promise<any>) {
  const requests: any[] = []
  const $: any = { ...fakeStore(), model: { complete: async (request: any) => (requests.push(request), reply(request)) } }

  return { $, requests }
}

const GOOD = {
  group: 'Config file plan',
  kind: 'choice',
  title: 'Where the config file lives',
  scenario: 'You run the tool from packages/api and it needs its settings.',
  options: [{ label: 'Project root', changes: 'one file' }, { label: 'Per package' }],
  recommendation: { option: 1, reason: 'Every other tool reads from the root.' },
}

test('decisions_add takes a trimmed problem as Claude\'s, leaves a blank one out, and refuses one too long or not text', async () => {
  const $ = fakeStore()
  await addDecision($, { ...GOOD, problem: '  Where the settings file is read from  ' })
  const d1 = await readOne($, 'd1')
  expect(d1?.problem).toBe('Where the settings file is read from')
  expect(d1?.problemBy).toBe('claude')

  await addDecision($, { ...GOOD, problem: '   ' })
  const d2 = await readOne($, 'd2')
  expect(d2?.problem).toBeUndefined()
  expect(d2?.problemBy).toBeUndefined()

  expect(validateAdd({ ...GOOD, problem: 'x'.repeat(PROBLEM_MAX) }, [])).toBeUndefined()
  expect(validateAdd({ ...GOOD, problem: 'x'.repeat(PROBLEM_MAX + 1) }, [])).toMatch(/problem is at most 140 characters/)
  expect(validateAdd({ ...GOOD, problem: 5 }, [])).toMatch(/problem must be one line of text/)
  expect(ADD_INPUT_SCHEMA.properties.problem.type).toBe('string')
  expect(UPDATE_INPUT_SCHEMA.properties.problem.type).toBe('string')
})

test('decisions_update takes a problem on its own, as Claude\'s, and refuses one too long', async () => {
  const $ = fakeStore()
  await addDecision($, GOOD)
  const d = (await readOne($, 'd1'))!
  await write($, { ...d, problem: 'model line', problemBy: 'model' })
  expect(validateUpdate({ id: 'd1', summary: 's', problem: 'x'.repeat(PROBLEM_MAX + 1) }, d, [d])).toMatch(/problem is at most 140 characters/)
  const answer = await updateDecision($, { id: 'd1', summary: 'Problem said plainly', problem: ' Where settings are read from ' })
  expect('result' in answer).toBe(true)
  const after = (await readOne($, 'd1'))!
  expect(after.problem).toBe('Where settings are read from')
  expect(after.problemBy).toBe('claude')
  expect(after.revisions[0]!.before.problem).toBe('model line')
})

test('add and update tell their caller about the decision they wrote, and not about a refused one', async () => {
  const $ = fakeStore()
  const added: string[] = []
  const updated: string[] = []
  await addDecision($, GOOD, d => added.push(d.id))
  await addDecision($, { ...GOOD, title: '' }, d => added.push(d.id))
  await updateDecision($, { id: 'd1', summary: 'Moved', recommendation: { option: 2, reason: 'r' } }, d => updated.push(`${d.id}:${d.recommendation?.option}`))
  await updateDecision($, { id: 'd1', summary: '' }, d => updated.push(d.id))
  expect(added).toEqual(['d1'])
  expect(updated).toEqual(['d1:2'])
})

test('the model writes a problem only when there is none or it wrote the last one', () => {
  const base: any = { problem: undefined, problemBy: undefined }
  expect(needsProblem(base)).toBe(true)
  expect(needsProblem({ ...base, problem: 'x', problemBy: 'model' })).toBe(true)
  expect(needsProblem({ ...base, problem: 'x', problemBy: 'claude' })).toBe(false)
})

test('the model\'s line is trimmed, unquoted and one line', () => {
  expect(cleanProblemReply('  "Where the settings file is read from"  ')).toBe('Where the settings file is read from')
  expect(cleanProblemReply('Problem: Which file wins\nsecond line')).toBe('Which file wins')
  expect(cleanProblemReply('\n\nWhich file wins')).toBe('Which file wins')
  expect(cleanProblemReply('x'.repeat(200))).toBe('x'.repeat(200))
  expect(cleanProblemReply('   ')).toBeUndefined()
})

test('the model gets the decision and its thread and writes the line as its own', async () => {
  const w = withModel(async () => ({ isAnswered: true, text: 'Where the settings file is read from' }))
  await addDecision(w.$, GOOD)
  const d = (await readOne(w.$, 'd1'))!
  await write(w.$, { ...d, thread: [{ who: 'person', text: 'Is root the repo root?', at: '1' }] })
  expect(await writeProblem(w.$, 'd1')).toBe(true)
  expect(w.requests[0]).toMatchObject({ model: 'haiku' })
  expect(w.requests[0].prompt).toContain('Where the config file lives')
  expect(w.requests[0].prompt).toContain('you: Is root the repo root?')
  const after = (await readOne(w.$, 'd1'))!
  expect(after.problem).toBe('Where the settings file is read from')
  expect(after.problemBy).toBe('model')
  expect(after.thread).toHaveLength(1)
  expect(problemPrompt(after)).toContain('<decision>')
})

test('a problem Claude wrote is never replaced, even when Claude writes it while the model is working', async () => {
  const w = withModel(async () => ({ isAnswered: true, text: 'model line' }))
  await addDecision(w.$, { ...GOOD, problem: 'Claude line' })
  expect(await writeProblem(w.$, 'd1')).toBe(false)
  expect(w.requests).toHaveLength(0)

  const racing = withModel(async () => {
    const d = (await readOne(racing.$, 'd1'))!
    await write(racing.$, { ...d, problem: 'Claude line', problemBy: 'claude' })
    return { isAnswered: true, text: 'model line' }
  })
  await addDecision(racing.$, GOOD)
  expect(await writeProblem(racing.$, 'd1')).toBe(false)
  expect((await readOne(racing.$, 'd1'))!.problem).toBe('Claude line')
})

test('a model error, an empty reply, a throw or a missing decision writes nothing and never throws', async () => {
  for (const reply of [
    async () => ({ isAnswered: false, reason: 'api-error' }),
    async () => ({ isAnswered: true, text: '   ' }),
    async () => {
      throw new Error('blocked')
    },
  ]) {
    const w = withModel(reply)
    await addDecision(w.$, GOOD)
    expect(await writeProblem(w.$, 'd1')).toBe(false)
    expect((await readOne(w.$, 'd1'))!.problem).toBeUndefined()
  }
  expect(await writeProblem(withModel(async () => ({ isAnswered: true, text: 'x' })).$, 'd9')).toBe(false)
})

type On = (event: string, hook: (...args: any[]) => any) => unknown

/** The engine calls the tool hooks make, answered from memory; `model` answers `$.model.complete`. */
function engine(on: On, model: (e: any) => any) {
  const files = new Map<string, string>()
  const asked: any[] = []
  on('env.get', () => ({ value: '/home/test' }))
  on('session.cwd', () => ({ value: '/work/pantry' }))
  on('session.id', () => ({ value: 'session-1' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '/work/pantry/.git\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('fs.read', (_: any, e: any) => ({ value: files.get(e.path) ?? '' }))
  on('fs.write', (_: any, e: any) => (files.set(e.path, e.text), { value: undefined }))
  on('fs.exists', (_: any, e: any) => ({ value: files.has(e.path) }))
  on('fs.list', (_: any, e: any) => ({
    value: [...files.keys()].filter(p => p.startsWith(e.path + '/')).map(p => ({ name: p.slice(e.path.length + 1), kind: 'file', size: 0, mtimeMs: 0, isLink: false })),
  }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('model.complete', (_: any, e: any) => (asked.push(e), { value: model(e) }))

  const stored = (id: string) => {
    const path = [...files.keys()].find(p => p.endsWith(`/${id}.json`))
    return path ? JSON.parse(files.get(path)!) : undefined
  }

  return { asked, stored }
}

async function settle(until: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !until(); i++) {
    await pause(5)
  }
}

test('adding a decision without a problem answers at once, then the model writes one in the background', async ($, on) => {
  const seen = engine(on, () => ({ isAnswered: true, text: 'Where the settings file is read from' }))
  const answer = await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  expect(JSON.stringify(answer)).toContain('Added d1 to the pane.')
  await settle(() => seen.stored('d1')?.problem !== undefined)
  expect(seen.stored('d1')).toMatchObject({ problem: 'Where the settings file is read from', problemBy: 'model' })
})

test('a failing model never fails decisions_add, and a decision with Claude\'s problem never asks the model', async ($, on) => {
  const seen = engine(on, () => ({ isAnswered: false, reason: 'api-error' }))
  const answer = await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  expect(JSON.stringify(answer)).toContain('Added d1 to the pane.')
  await settle(() => seen.asked.length > 0)
  expect(seen.stored('d1')?.problem).toBeUndefined()

  const before = seen.asked.length
  await $.tool.call({ tool: ADD_TOOL, ...GOOD, problem: 'Claude line' })
  await pause(20)
  expect(seen.asked).toHaveLength(before)
})

test('a revision rewrites a problem the model wrote, but not one Claude wrote', async ($, on) => {
  let line = 'First line'
  const seen = engine(on, () => ({ isAnswered: true, text: line }))
  await $.tool.call({ tool: ADD_TOOL, ...GOOD })
  await settle(() => seen.stored('d1')?.problem === 'First line')
  line = 'Second line'
  await $.tool.call({ tool: UPDATE_TOOL, id: 'd1', summary: 'Recommendation moved to 2', recommendation: { option: 2, reason: 'r' } })
  await settle(() => seen.stored('d1')?.problem === 'Second line')
  expect(seen.stored('d1')).toMatchObject({ problem: 'Second line', problemBy: 'model' })

  await $.tool.call({ tool: UPDATE_TOOL, id: 'd1', summary: 'Said plainly', problem: 'Claude line' })
  const asked = seen.asked.length
  await $.tool.call({ tool: UPDATE_TOOL, id: 'd1', summary: 'Moved back', recommendation: { option: 1, reason: 'r' } })
  await pause(20)
  expect(seen.asked).toHaveLength(asked)
  expect(seen.stored('d1')).toMatchObject({ problem: 'Claude line', problemBy: 'claude' })
})

test('decisions_update with a blank problem and nothing else is refused as nothing to change', async () => {
  const $ = fakeStore()
  await addDecision($, GOOD)
  const d = (await readOne($, 'd1'))!
  expect(validateUpdate({ id: 'd1', summary: 's', problem: '' }, d, [d])).toMatch(/nothing to change/)
  expect(validateUpdate({ id: 'd1', summary: 's', problem: '   ' }, d, [d])).toMatch(/nothing to change/)
  const answer = await updateDecision($, { id: 'd1', summary: 's', problem: '' })
  expect('deny' in answer).toBe(true)
  expect((await readOne($, 'd1'))!.revisions).toHaveLength(0)
})

test('a model line a little over the limit is kept whole, and a very long one is cut at a word with …, never mid-word', () => {
  const over = 'The session card\'s contents: whether it should show summary, progress, and PR links alongside the current title and "now" line, or stay as it is'
  expect(over.length).toBeGreaterThan(PROBLEM_MAX)
  expect(cleanProblemReply(over)).toBe(over)
  const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ')
  const cut = cleanProblemReply(long)!
  expect(cut.length).toBeLessThanOrEqual(MODEL_PROBLEM_MAX)
  expect(cut.endsWith('…')).toBe(true)
  expect(long.startsWith(cut.slice(0, -1).trimEnd() + ' ')).toBe(true)
})
