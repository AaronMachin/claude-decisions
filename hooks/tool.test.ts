import { expect, test } from 'claude-code/testing'

import { RULE_PHRASES } from './integrate'
import { create, readAll, write } from './store'
import type { StoreCtx } from './store'
import { ADD_DESCRIPTION, ADD_INPUT_SCHEMA, ADD_TOOL, LIST_TOOL, UPDATE_DESCRIPTION, addDecision, listDecisions, registerTools, updateDecision, validateAdd, validateUpdate } from './tool'

function fake(): StoreCtx {
  const files = new Map<string, string>()

  return {
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
  expect(validateAdd({ ...GOOD, kind: 'riddle' }, [])).toMatch(/kind must be one of choice, go-ahead, assumption, finding, question/)
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
  expect(registered.map(s => s.name)).toEqual(['decisions_add', 'decisions_list', 'decisions_update'])
  expect(registered.every(s => s.isDeferred === false)).toBe(true)
  expect(registered[0].inputSchema.required).toEqual(['kind', 'title', 'scenario'])
})

test('update refuses each bad shape with a reason', async () => {
  const $ = fake()
  await addDecision($, GOOD)
  const d = (await readAll($)).decisions[0]!
  expect(validateUpdate({ id: 'd9' }, undefined)).toMatch(/d9: no such decision/)
  expect(validateUpdate({ id: 'd1', summary: 's', addOptions: [{ label: 'x' }] }, { ...d, state: 'sent' })).toMatch(/d1 is already sent; add a new decision instead/)
  expect(validateUpdate({ id: 'd1', summary: ' ', addOptions: [{ label: 'x' }] }, d)).toMatch(/summary is required/)
  expect(validateUpdate({ id: 'd1', summary: 's' }, d)).toMatch(/nothing to change/)
  expect(validateUpdate({ id: 'd1', summary: 's', addOptions: [{ label: ' ' }] }, d)).toMatch(/option 3 has no label/)
  const many = Array.from({ length: 11 }, (_, i) => ({ label: `o${i}` }))
  expect(validateUpdate({ id: 'd1', summary: 's', addOptions: many }, d)).toMatch(/at most 12 options/)
  expect(validateUpdate({ id: 'd1', summary: 's', recommendation: { option: 3, reason: 'r' } }, d)).toMatch(/recommendation\.option must be the number/)
  expect(validateUpdate({ id: 'd1', summary: 's', addOptions: [{ label: 'x' }], recommendation: { option: 3, reason: 'r' } }, d)).toBeUndefined()
})

test('update adds an option, moves the recommendation, keeps the earlier version and writes the thread line', async () => {
  const $ = fake()
  await addDecision($, GOOD)
  const answer = await updateDecision($, {
    id: 'd1',
    summary: 'Added option 3, Per workspace',
    addOptions: [{ label: 'Per workspace', changes: 'one file per workspace' }],
    recommendation: { option: 3, reason: 'fits a monorepo' },
  })
  expect(answer).toEqual({ result: 'Updated d1: Added option 3, Per workspace. The earlier version is kept in the thread.' })
  const d = (await readAll($)).decisions[0]!
  expect(d.options[2]).toEqual({ id: 3, label: 'Per workspace', changes: 'one file per workspace', fromDiscussion: true })
  expect(d.recommendation).toEqual({ option: 3, reason: 'fits a monorepo' })
  expect(d.revisions).toHaveLength(1)
  expect(d.revisions[0]!.before.options).toHaveLength(2)
  expect(d.revisions[0]!.before.recommendation?.option).toBe(1)
  expect(d.revisions[0]!.before).not.toHaveProperty('thread')
  expect(d.thread).toEqual([expect.objectContaining({ who: 'claude', text: '↻ Added option 3, Per workspace', revision: 0 })])
})

test('update keeps a ready decision\'s answer, and a refusal changes nothing', async () => {
  const $ = fake()
  await addDecision($, GOOD)
  const d = (await readAll($)).decisions[0]!
  await write($, { ...d, state: 'ready', answer: { option: 2, answeredAt: 'now' } })
  await updateDecision($, { id: 'd1', summary: 'Recommendation moved to 2', recommendation: { option: 2, reason: 'simpler' } })
  const after = (await readAll($)).decisions[0]!
  expect(after.answer?.option).toBe(2)
  expect(after.state).toBe('ready')
  expect(await updateDecision($, { id: 'd1', summary: 'x' })).toHaveProperty('deny')
  expect((await readAll($)).decisions[0]!.revisions).toHaveLength(1)
})

test('the update description fits in what reaches Claude and says a pane message is a question', () => {
  expect(UPDATE_DESCRIPTION.length).toBeLessThanOrEqual(4096)
  expect(UPDATE_DESCRIPTION).toMatch(/On decision <n>/)
  expect(UPDATE_DESCRIPTION).toMatch(/not the answer/)
})

const FINDING = { group: 'Search review', kind: 'finding', title: 'Search ranking: exact matches sort low', scenario: 'Searching "lemon" lists "lemonade" first.', recommendation: { option: 1, reason: 'It is a real bug.' } }

test('each kind is accepted and stored with the options the tool fills in', async () => {
  const $ = fake()
  await addDecision($, { ...FINDING })
  await addDecision($, { kind: 'go-ahead', title: 'Push the branch', scenario: 's', recommendation: { option: 1, reason: 'r' } })
  await addDecision($, { kind: 'assumption', title: 'Settings are YAML', scenario: 's', recommendation: { option: 1, reason: 'r' } })
  await addDecision($, { kind: 'question', title: 'Which staging account', scenario: 's' })
  const all = (await readAll($)).decisions
  expect(all.map(d => d.kind)).toEqual(['finding', 'go-ahead', 'assumption', 'question'])
  expect(all[0]!.options.map(o => o.label)).toEqual(['Agree', 'Already decided', 'Disagree', 'Not sure'])
  expect(all[0]!.options.every(o => o.changes)).toBe(true)
  expect(all[1]!.options.map(o => o.label)).toEqual(['Yes', 'No'])
  expect(all[2]!.options.map(o => o.label)).toEqual(['Right', 'Wrong'])
  expect(all[3]!.options).toEqual([])
  expect(all[3]!.recommendation).toBeUndefined()
  expect(all.every(d => d.section === 'needs-you')).toBe(true)
})

test('options on a fixed kind, or a recommendation outside its options, are refused naming the field', () => {
  expect(validateAdd({ ...FINDING, options: [{ label: 'x' }] }, [])).toMatch(/options: the options of a finding are fixed/)
  expect(validateAdd({ ...FINDING, recommendation: { option: 5, reason: 'r' } }, [])).toMatch(/recommendation\.option must be a number from 1 to 4 when kind is finding/)
  expect(validateAdd({ ...FINDING, kind: 'assumption', recommendation: { option: 3, reason: 'r' } }, [])).toMatch(/from 1 to 2 when kind is assumption/)
  expect(validateAdd({ kind: 'question', title: 't', scenario: 's', options: [{ label: 'x' }] }, [])).toMatch(/a question has no options/)
  expect(validateAdd({ kind: 'question', title: 't', scenario: 's', recommendation: { option: 1, reason: 'r' } }, [])).toMatch(/recommendation: a question has none/)
  expect(validateAdd({ kind: 'question', title: 't', scenario: 's' }, [])).toBeUndefined()
})

test('a task is a go-ahead with Done and Cannot do it, no recommendation, always in needs-you', async () => {
  const task = { kind: 'go-ahead', isTask: true, title: 'Sign in to staging', scenario: 'Run the login command.' }
  expect(validateAdd({ ...task, kind: 'finding' }, [])).toMatch(/isTask needs kind go-ahead/)
  expect(validateAdd({ ...task, options: [{ label: 'x' }] }, [])).toMatch(/options: the options of a task are fixed/)
  expect(validateAdd({ ...task, recommendation: { option: 1, reason: 'r' } }, [])).toMatch(/recommendation: a task has none/)
  expect(validateAdd({ ...task, section: 'claudes-call' }, [])).toMatch(/a task is always in needs-you/)
  const $ = fake()
  await addDecision($, task)
  const d = (await readAll($)).decisions[0]!
  expect(d.isTask).toBe(true)
  expect(d.options.map(o => o.label)).toEqual(['Done', "Can't do it"])
})

test('section is checked and stored, and defaults to needs-you', async () => {
  expect(validateAdd({ ...FINDING, section: 'elsewhere' }, [])).toMatch(/section must be one of needs-you, claudes-call, already-decided/)
  const $ = fake()
  await addDecision($, { ...FINDING, section: 'claudes-call' })
  await addDecision($, { ...FINDING, section: 'already-decided' })
  expect((await readAll($)).decisions.map(d => d.section)).toEqual(['claudes-call', 'already-decided'])
})

test('the add description stays under what reaches Claude', () => {
  expect(ADD_DESCRIPTION.length).toBeLessThan(4096)
})

test('update replaces dependsOn and blocks, and refuses unknown ids, itself and a loop', async () => {
  const $ = fake()
  await addDecision($, GOOD)
  await addDecision($, { ...GOOD, title: 'Second' })
  await addDecision($, { ...GOOD, title: 'Third' })
  const all = (await readAll($)).decisions
  expect(validateUpdate({ id: 'd2', summary: 's', dependsOn: ['d9'] }, all[1], all)).toMatch(/dependsOn d9: no such decision/)
  expect(validateUpdate({ id: 'd2', summary: 's', dependsOn: ['d2'] }, all[1], all)).toMatch(/cannot depend on itself/)
  expect(await updateDecision($, { id: 'd2', summary: 'Now depends on d1', dependsOn: ['d1'], blocks: ' the plan ' })).toEqual({
    result: 'Updated d2: Now depends on d1. The earlier version is kept in the thread.',
  })
  const next = (await readAll($)).decisions
  expect(next[1]!.dependsOn).toEqual(['d1'])
  expect(next[1]!.blocks).toBe('the plan')
  expect(next[1]!.revisions).toHaveLength(1)
  expect(next[1]!.thread[0]!.text).toBe('↻ Now depends on d1')
  expect(validateUpdate({ id: 'd1', summary: 's', dependsOn: ['d2'] }, next[0], next)).toMatch(/that would make a loop/)
  expect(validateUpdate({ id: 'd1', summary: 's', dependsOn: ['d3'] }, next[0], next)).toBeUndefined()
  await updateDecision($, { id: 'd2', summary: 'No longer blocks', blocks: '' })
  expect((await readAll($)).decisions[1]!.blocks).toBeUndefined()
})

test('update moves a decision between sections, but not an answered one', async () => {
  const $ = fake()
  await addDecision($, { ...FINDING, section: 'claudes-call' })
  expect(await updateDecision($, { id: 'd1', summary: 'Moved to Needs you', section: 'needs-you' })).toHaveProperty('result')
  const d = (await readAll($)).decisions[0]!
  expect(d.section).toBe('needs-you')
  expect(d.revisions[0]!.before.section).toBe('claudes-call')
  expect(validateUpdate({ id: 'd1', summary: 's', section: 'x' }, d, [d])).toMatch(/section must be one of/)
  expect(validateUpdate({ id: 'd1', summary: 's', section: 'claudes-call' }, { ...d, state: 'ready' }, [d])).toMatch(/already answered/)
  expect(validateUpdate({ id: 'd1', summary: 's' }, d, [d])).toMatch(/nothing to change\. Give addOptions, recommendation, dependsOn, blocks or section/)
})

test('update refuses options on fixed kinds and a recommendation on a question or task', async () => {
  const $ = fake()
  await addDecision($, FINDING)
  await addDecision($, { kind: 'question', title: 'Which account', scenario: 's' })
  await addDecision($, { kind: 'go-ahead', isTask: true, title: 'Sign in', scenario: 's' })
  const [f, q, t] = (await readAll($)).decisions
  expect(validateUpdate({ id: 'd1', summary: 's', addOptions: [{ label: 'x' }] }, f)).toMatch(/addOptions: the options of a finding are fixed/)
  expect(validateUpdate({ id: 'd2', summary: 's', recommendation: { option: 1, reason: 'r' } }, q)).toMatch(/recommendation: a question has none/)
  expect(validateUpdate({ id: 'd3', summary: 's', recommendation: { option: 1, reason: 'r' } }, t)).toMatch(/a task has none/)
  expect(validateUpdate({ id: 'd3', summary: 's', section: 'claudes-call' }, t, [])).toMatch(/a task is always in needs-you/)
})

test('list counts only needs-you as waiting and names the folded ones by id', async () => {
  const $ = fake()
  await addDecision($, FINDING)
  await addDecision($, { ...FINDING, title: 'Search ranking: two', section: 'claudes-call' })
  await addDecision($, { ...FINDING, title: 'Search ranking: three', section: 'claudes-call' })
  await addDecision($, { ...FINDING, title: 'Search ranking: four', section: 'already-decided' })
  await addDecision($, { kind: 'go-ahead', isTask: true, title: 'Sign in', scenario: 's' })
  const { result } = await listDecisions($)
  expect(result).toContain('2 waiting for the person')
  expect(result).toContain("Claude's call (2, not waiting for the person, they can overrule): d2, d3.")
  expect(result).toContain('Already decided (1, not waiting for the person, they can overrule): d4.')
  expect(result).toContain('d5 [Other] open for the person to do: Sign in.')
  expect(result).not.toContain('Search ranking: two')
  const d = (await readAll($)).decisions[0]!
  await write($, { ...d, reopenedBy: { id: 'd9', at: 't' } })
  expect((await listDecisions($)).result).toContain('Reopened because d9 changed.')
})

test('more refusals name their field: blocks type, dependsOn type, a blank reason on a fixed kind, section on a withdrawn decision', async () => {
  const $ = fake()
  await addDecision($, FINDING)
  const d = (await readAll($)).decisions[0]!
  expect(validateUpdate({ id: 'd1', summary: 's', blocks: 5 }, d, [d])).toMatch(/blocks must be a sentence/)
  expect(validateUpdate({ id: 'd1', summary: 's', dependsOn: 'd2' }, d, [d])).toMatch(/dependsOn must be a list/)
  expect(validateAdd({ ...FINDING, recommendation: { option: 1, reason: ' ' } }, [])).toMatch(/recommendation\.reason is required/)
  expect(validateUpdate({ id: 'd1', summary: 's', section: 'claudes-call' }, { ...d, state: 'withdrawn' }, [d])).toMatch(/already withdrawn/)
})

test('the add description stays at or under 4,000 characters and carries every rule', () => {
  expect(ADD_DESCRIPTION.length).toBeLessThanOrEqual(4000)
  for (const phrase of RULE_PHRASES) {
    expect(ADD_DESCRIPTION).toContain(phrase)
  }
  expect(ADD_DESCRIPTION).toMatch(/after \/compact or \/clear/)
  expect(ADD_DESCRIPTION).toMatch(/review finding/)
  expect(UPDATE_DESCRIPTION).toMatch(/subagent/)
})

test('a go-ahead, assumption or finding with no recommendation is accepted; a choice still needs one', () => {
  for (const kind of ['go-ahead', 'assumption', 'finding']) {
    expect(validateAdd({ group: 'Recipe sharing', kind, title: 'Push the share-link branch', scenario: 's' }, [])).toBeUndefined()
  }
  expect(validateAdd({ ...FINDING, recommendation: { option: 5, reason: 'r' } }, [])).toMatch(/from 1 to 4/)
  expect(validateAdd({ ...FINDING, recommendation: { option: 1, reason: '' } }, [])).toMatch(/recommendation\.reason is required/)
  expect(validateAdd({ ...GOOD, recommendation: undefined }, [])).toMatch(/recommendation\.option must be the number of one of the options/)
})

test('the tool text says a question is answered in the pane, in its Something else row, not in the discussion', () => {
  const kind = JSON.stringify(ADD_INPUT_SCHEMA.properties.kind)
  for (const text of [ADD_DESCRIPTION, kind]) {
    expect(text).toMatch(/question[^.]*types (the|its) answer in the pane's Something else row/)
    expect(text).not.toMatch(/answer in the discussion/)
  }
  expect(ADD_DESCRIPTION.slice(0, 4096)).toContain("Something else row")
})

test('an option may carry why and why not: stored trimmed, empty ones dropped, on add and on update', async () => {
  const $ = fake()
  const options = [
    { label: 'Project root', changes: 'one file', why: '  every tool reads it  ', whyNot: 'a monorepo wants one per package' },
    { label: 'Per package', why: '', whyNot: '   ' },
  ]
  expect(await addDecision($, { ...GOOD, options })).toHaveProperty('result')
  const [d] = (await readAll($)).decisions
  expect(d!.options[0]).toMatchObject({ why: 'every tool reads it', whyNot: 'a monorepo wants one per package' })
  expect(d!.options[1]).not.toHaveProperty('why')
  expect(d!.options[1]).not.toHaveProperty('whyNot')
  await updateDecision($, { id: 'd1', summary: 'Added option 3, Both', addOptions: [{ label: 'Both', why: 'no move needed', whyNot: 'two places to look' }] })
  expect((await readAll($)).decisions[0]!.options[2]).toMatchObject({ why: 'no move needed', whyNot: 'two places to look' })
})

test('why and why not must be strings', async () => {
  const $ = fake()
  expect(validateAdd({ ...GOOD, options: [{ label: 'A', why: 3 }] }, [])).toMatch(/why/)
  expect(validateAdd({ ...GOOD, options: [{ label: 'A', whyNot: ['x'] }] }, [])).toMatch(/whyNot/)
  await addDecision($, GOOD)
  expect(await updateDecision($, { id: 'd1', summary: 's', addOptions: [{ label: 'B', why: true }] })).toHaveProperty('deny')
  const schema = (ADD_INPUT_SCHEMA.properties.options.items as any).properties
  expect(schema.why.type).toBe('string')
  expect(schema.whyNot.type).toBe('string')
})
