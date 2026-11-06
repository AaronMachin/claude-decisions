/** A question sent from a thread that has no reply yet. Lives in `$.state`, never in the thread file. */
export type PendingQuestion = {
  /** The question's ThreadEntry.at, which finds the entry. */
  asked: string
  decisionId: string
  mode: 'main' | 'fork' | 'quick'
  status: 'queued' | 'waiting' | 'answering' | 'failed'
  reason?: string
  /** Names the load of the mod that holds the call; after a reload it differs. */
  run: string
}

/** What the pane remembers between draws. The decisions themselves live in files, never here. */
export type PaneView = {
  screen: 'list' | 'decision' | 'review' | 'thread'
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
  /** Thread screen: the Input is open and holds the keys. */
  isAsking: boolean
  /** Thread screen: the ring is on Mark answered. */
  isMarking: boolean
  /** Half-typed questions by decision id; survive hiding the pane. */
  drafts: Record<string, string>
  pending: PendingQuestion[]
  /** The earlier version open on the thread screen. */
  revisionIndex?: number
  /** Entries hidden at the newest end, for older/newer paging. */
  threadSkip: number
}

declare module 'claude-code' {
  interface PluginState {
    decisions: { view: Shaped<PaneView> }
  }
}
