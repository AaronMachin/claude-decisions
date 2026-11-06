import { expect, test } from 'claude-code/testing'

const TOOL = 'mcp__instructions-spike__decisions_add'

const VALID = {
  tool: TOOL,
  group: 'Sharing links',
  kind: 'decision',
  title: 'Where the config file lives',
  scenario: 'You run the tool from a subfolder and it needs to find its settings.',
  options: [{ id: 'a', label: 'Project root', changes: 'one file, found by walking up' }],
  recommendation: { option: 'a', reason: 'it matches every other tool here' },
}

test('the rules section is in the system prompt for the whole session', async ($, on) => {
  on('prompt.compose', () => ({ sections: [] }))

  const composed = await $.prompt.compose({ model: 'sonnet', promptModel: 'sonnet', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] })
  const section = composed.sections.find(s => s.id === 'decisions-rules')

  expect(section).toBeDefined()
  expect(section?.scope).toBe('session')
  expect(section?.text).toContain('decisions_add')
})

test('decisions_add is registered undeferred with a long description', async ($, on) => {
  const registered: any[] = []
  on('tool.register', (_, e) => {
    registered.push(e)
    return { value: { tool: e.name } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const tool = registered.find(t => t.name === 'decisions_add')
  expect(tool).toBeDefined()
  expect(tool.isDeferred).toBe(false)
  expect(tool.description.length).toBeGreaterThanOrEqual(3000)
  expect(tool.inputSchema.required).toContain('scenario')
})

test('a missing scenario is refused with a reason naming it', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.register', (_, e) => ({ value: { tool: e.name } }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const { scenario: _omitted, ...withoutScenario } = VALID
  const refused = await $.tool.call(withoutScenario)

  expect(refused.deny).toContain('scenario')
})

test('prompt.context carries the open decisions', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.register', (_, e) => ({ value: { tool: e.name } }))
  on('prompt.context', (_, e) => ({ blocks: e.blocks }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const empty = await $.prompt.context({ blocks: [] })
  expect(empty.blocks.find(b => b.name === 'decisions')?.text).toContain('No open decisions')

  const added = await $.tool.call(VALID)
  expect(typeof added.result).toBe('string')
  expect(added.deny).toBeUndefined()

  const after = await $.prompt.context({ blocks: [] })
  const block = after.blocks.find(b => b.name === 'decisions')
  expect(block?.text).toContain('Where the config file lives')
  expect(block?.text).toContain('Sharing links')
})
