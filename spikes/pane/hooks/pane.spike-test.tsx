import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'pane-spike',
  component: 'Pane',
  requestId: 'decisions',
  props: {
    title: 'Decisions',
    isFocused: true,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('/decisions opens the pane, on every surface', async ($, on) => {
  const opened: unknown[] = []
  on('command.register', () => ({ value: { command: 'decisions' } }))
  on('ui.open', (_, e) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  for (const surface of ['terminal', 'desktop'] as const) {
    await $.session.start({ cwd: '/', surface, isInteractive: true })
    opened.length = 0
    await $.command.run({ command: 'decisions' })
    expect(opened).toHaveLength(1)
    expect(opened[0]).toMatchObject({ id: 'decisions', focus: true })
  }
})

test('the pane draws b and h buttons and h closes it', async ($, on) => {
  const closed: unknown[] = []
  on('ui.close', (_, e) => {
    closed.push(e)
    return { value: null }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    const buttons = await ui.findAll({ type: 'Button' })
    const hotkeys = buttons.map(b => b.props.hotkey)
    expect(hotkeys).toContain('b')
    expect(hotkeys).toContain('h')
    expect(await ui.find({ type: 'Input', key: 'message' })).toBeTruthy()

    closed.length = 0
    await ui.press({ key: 'hide' })
    expect(closed).toHaveLength(1)
    expect(closed[0]).toMatchObject({ id: 'decisions' })
    await ui.unmount()
  }
})
