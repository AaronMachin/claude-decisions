import { expect, test } from 'claude-code/testing'

import { create, readAll, write } from './store'
import type { StoreCtx } from './store'
import { ADD_DESCRIPTION, ADD_TOOL, LIST_TOOL, addDecision, listDecisions, registerTools, validateAdd } from './tool'

function fake(): StoreCtx {
  const files = new Map<string, string>()

  return {
    env: { get: async () => '/home/test' },
    session: { cwd: async () => '/work/pantry' },
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

const GOOD = {
  group: 'Config file plan',
  kind: 'choice',
  title: 'Where the config file lives',
  scenario: 'You run the tool from packages/api and it needs its settings.',
  options: [
    { label: 'Project root', changes: 'one file, shared by every package' },
    { label: 'Per package' },
  ],
  recommendation: { option: 1, reason: 'Every other tool reads from the root.' },
}

test('the tool names are the plugin name plus the tool', () => {
  expect(ADD_TOOL).toBe('mcp__decisions__decisions_add')
  expect(LIST_TOOL).toBe('mcp__decisions__decisions_list')
})

test('add refuses a missing scenario, naming it', () => {
  const reason = validateAdd({ ...GOOD, scenario: '  ' }, [])
  expect(reason).toMatch(/^decisions_add refused: scenario is required\. Write a concrete example of what happens and call again\./)
  expect(validateAdd({ ...GOOD, title: undefined }, [])).toMatch(/title is required/)
  expect(validateAdd({ ...GOOD, kind: undefined }, [])).toMatch(/kind is required/)
})

test('add refuses every other malformed shape with a reason', () => {
  expect(validateAdd({ ...GOOD, kind: 'finding' }, [])).toMatch(/kind must be choice; the other kinds arrive later/)
  expect(validateAdd({ ...GOOD, options: [] }, [])).toMatch(/options needs 1 to 12\. Split a bigger choice into two decisions/)
  const thirteen = Array.from({ length: 13 }, (_, i) => ({ label: `o${i}` }))
  expect(validateAdd({ ...GOOD, options: thirteen }, [])).toMatch(/options needs 1 to 12/)
  expect(validateAdd({ ...GOOD, options: [{ label: 'a' }, { label: ' ' }] }, [])).toMatch(/option 2 has no label/)
  expect(validateAdd({ ...GOOD, recommendation: undefined }, [])).toMatch(/recommendation\.option must be the number of one of the options/)
  expect(validateAdd({ ...GOOD, recommendation: { option: 3, reason: 'x' } }, [])).toMatch(/recommendation\.option must be the number/)
  expect(validateAdd({ ...GOOD, recommendation: { option: 1, reason: '' } }, [])).toMatch(/recommendation\.reason is required/)
  expect(validateAdd({ ...GOOD, dependsOn: ['d9'] }, ['d1'])).toMatch(/dependsOn d9: no such decision/)
  expect(validateAdd({ ...GOOD, dependsOn: ['d1'] }, ['d1'])).toBeUndefined()
  expect(validateAdd(GOOD, [])).toBeUndefined()
})

test('add stores an open decision with numbered options and says how many are open', async () => {
  const $ = fake()
  expect(await addDecision($, GOOD)).toEqual({ result: 'Added d1 to the pane. 1 open.' })
  expect(await addDecision($, { ...GOOD, title: 'Second' })).toEqual({ result: 'Added d2 to the pane. 2 open.' })
  const first = (await readAll($)).decisions[0]!
  expect(first.options.map(o => o.id)).toEqual([1, 2])
  expect(first.recommendation).toEqual({ option: 1, reason: 'Every other tool reads from the root.' })
  expect(first.state).toBe('open')
})

test('a refused add is returned as a deny and stores nothing', async () => {
  const $ = fake()
  const answer = await addDecision($, { ...GOOD, scenario: '' })
  expect(answer).toHaveProperty('deny')
  expect((await readAll($)).decisions).toHaveLength(0)
})

test('add then list returns it', async () => {
  const $ = fake()
  expect(await listDecisions($)).toEqual({ result: 'No open decisions in the pane.' })
  await addDecision($, GOOD)
  const { result } = await listDecisions($)
  expect(result).toBe(
    [
      'Decisions in the pane: 1 waiting for the person.',
      'd1 [Config file plan] open: Where the config file lives. Options: 1 Project root, 2 Per package. Recommended: 1.',
    ].join('\n'),
  )
})

test('list includes ready and parked decisions and leaves out sent ones', async () => {
  const $ = fake()
  for (const title of ['A', 'B', 'C', 'D']) {
    await addDecision($, { ...GOOD, group: undefined, title })
  }
  const all = (await readAll($)).decisions
  await write($, { ...all[1]!, state: 'ready', answer: { option: 2, answeredAt: 'now' } })
  await write($, { ...all[2]!, state: 'parked', parkedReason: 'waiting on the design review' })
  await write($, { ...all[3]!, state: 'sent' })
  const { result } = await listDecisions($)
  expect(result).toBe(
    [
      'Decisions in the pane: 1 waiting for the person, 1 answered but not sent, 1 parked.',
      'd1 [Other] open: A. Options: 1 Project root, 2 Per package. Recommended: 1.',
      'd2 [Other] ready, answered 2 Per package, not sent yet: B.',
      'd3 [Other] parked (waiting on the design review): C.',
    ].join('\n'),
  )
})

test('the description fits in what reaches Claude and carries the rules', () => {
  expect(ADD_DESCRIPTION.length).toBeLessThanOrEqual(4096)
  expect(ADD_DESCRIPTION).toMatch(/one line in chat/i)
  expect(ADD_DESCRIPTION).toMatch(/decisions_list/)
  expect(ADD_DESCRIPTION).toMatch(/scenario/)
  expect(ADD_DESCRIPTION).toMatch(/recommendation/)
})

test('both tools are registered with their schemas, not deferred', async () => {
  const registered: any[] = []
  await registerTools({ tool: { register: async (spec: any) => void registered.push(spec) } })
  expect(registered.map(s => s.name)).toEqual(['decisions_add', 'decisions_list'])
  expect(registered.every(s => s.isDeferred === false)).toBe(true)
  expect(registered[0].inputSchema.required).toEqual(['kind', 'title', 'scenario', 'options', 'recommendation'])
})
