/** What the pane remembers between draws. The decisions themselves live in files, never here. */
export type PaneView = {
  screen: 'list' | 'decision' | 'review'
  /** 'g:<group>', 'other' or 'parked' */
  tab?: string
  decisionId?: string
  /** An option id, or none. */
  highlight?: number
  /** Decision ids ticked on the review screen. */
  ticked: string[]
  isParking: boolean
  /** Kept here because hiding the pane loses an Input's text. */
  parkDraft: string
  /** One dim line, such as "No discussion yet". */
  notice?: string
  isHidden: boolean
}

declare module 'claude-code' {
  interface PluginState {
    decisions: { view: Shaped<PaneView> }
  }
}
