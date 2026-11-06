import type { Register } from 'claude-code'

const PANE = 'decisions'
const ROWS = ['one', 'two', 'three', 'four', 'five', 'six']

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'decisions',
      description: 'Spike: open the decisions pane',
    })

    return next(e)
  })

  on('command.run', { command: 'decisions' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: 'Decisions', focus: true })

    return {
      text: opened.isPlaced
        ? 'Decisions pane opened.'
        : 'Decisions pane not placed: ' + opened.reason,
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Input, Button } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text>
          width {e.props.bodyColumns} / {e.props.placement}
        </Text>
        {ROWS.map(row => (
          <Text>row {row}</Text>
        ))}
        <Input key="message" label="Message " onSubmit={() => {}} />
        <Box>
          <Button key="back" hotkey="b" onPress={() => {}}>
            Back
          </Button>
          <Button key="hide" hotkey="h" onPress={() => $.ui.close({ id: PANE })}>
            Hide
          </Button>
        </Box>
      </Box>
    )
  })
}
