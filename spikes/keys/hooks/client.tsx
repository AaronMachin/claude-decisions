import type { ClientModule } from 'claude-code'

const COUNT = 12

type State = { highlight: number | undefined; typed: string; at: number }

/** Route B: one Client that takes every key while it has the focus. */
const Keys: ClientModule<{ chosen: string }, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const state: State = surface.state ?? { highlight: undefined, typed: '', at: 0 }

  surface.onKey(event => {
    const now = Date.now()
    let next: State = state
    let kind = 'key'

    if (/^[0-9]$/.test(event.key)) {
      const joined = state.typed === '1' && now - state.at <= 1500 ? Number('1' + event.key) : Number(event.key === '0' ? '10' : event.key)
      const option = joined >= 1 && joined <= COUNT ? joined : Number(event.key === '0' ? '10' : event.key)
      next = { highlight: option, typed: event.key, at: now }
      kind = 'digit'
    } else if (event.key === 'up') {
      next = { ...state, highlight: Math.max(1, (state.highlight ?? 2) - 1), typed: '' }
      kind = 'up'
    } else if (event.key === 'down') {
      next = { ...state, highlight: Math.min(COUNT, (state.highlight ?? 0) + 1), typed: '' }
      kind = 'down'
    } else if (event.key === 'return') {
      kind = state.highlight === undefined ? 'discuss' : 'choose'
    }

    surface.post({ kind, key: event.key, at: now, highlight: next.highlight ?? null, gap: now - state.at })
    surface.setState(next)
  })

  return (
    <Box flexDirection="column">
      <Text>client route (press keys while it has the focus)</Text>
      {Array.from({ length: COUNT }, (_, i) => (
        <Text inverse={state.highlight === i + 1}>
          {state.highlight === i + 1 ? '> ' : '  '}
          {i + 1}. option {i + 1}
        </Text>
      ))}
      <Text dimColor>chosen: {props.chosen}</Text>
    </Box>
  )
}

export default Keys
