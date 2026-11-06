import { expect, test } from 'claude-code/testing'

test('session.start registers /decisions', async ($, on) => {
  const names: string[] = []
  on('env.get', () => ({ value: undefined }))
  on('command.register', (_, e) => {
    names.push((e as { name: string }).name)
    return { value: { command: 'decisions' } }
  })
  on('tool.register', () => ({ value: {} }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(names).toContain('decisions')
})
