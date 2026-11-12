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
  screen: 'list' | 'decision' | 'review' | 'thread' | 'batch' | 'session'
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
  /** The folded section that is open; none when both are folded. */
  openSection?: 'claudes-call' | 'already-decided'
  /** 0-based page of the open section's rows. */
  sectionPage: number
  /** Batch screen: decision id to the option highlighted and not yet confirmed. */
  marks: Record<string, number>
  /** Batch screen: the decision id the ring is on. */
  batchRow?: string
  /** The key of the element the engine last said holds the ring (from `ui.focus`), for the `›` marker. */
  ring?: string
  /** 0-based page of a compact screen's rows (options, assumptions, ticks). */
  compactPage: number
  /** Decision screen: `m` shows the whole context (dependencies, sources) instead of three lines. */
  isContextOpen: boolean
  /** Decision screen: the answer or condition box open under an option. */
  answerBox?: { kind: 'text' | 'condition'; option: number }
  /** Half-typed answers and conditions by decision id; survive hiding the pane. */
  answerDrafts: Record<string, string>
  /** Decision screen: `m` hides every option's detail but the highlighted one's (decision 217). */
  isDetailHidden: boolean
  /** Session page: `m` folds done plan items to `✓ N done`. */
  isDoneFolded?: boolean
  /** Session page, compact: `o` shows the links instead of the plan. */
  sessionLinksOpen?: boolean
  /** Session page: `r` asked Claude to refresh at `askedAt`; `no-update` once that turn ended without a new record (row 256). */
  sessionRefresh?: { askedAt: string; status: 'asked' | 'no-update' }
}

declare module 'claude-code' {
  interface PluginState {
    decisions: { view: Shaped<PaneView> }
  }
}
