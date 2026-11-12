/** What the testers' seeded session holds: pure data in the shape of `decisions_add` input. */
import { REVIEW_47 } from '../../hooks/pane/review-47'

const labels = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `Option ${i + 1}`, changes: `What changes if option ${i + 1} is picked.` }))

export const CHOICES: Record<string, any>[] = [
  {
    group: 'Sharing links', kind: 'choice',
    title: 'Where share links live',
    scenario: 'A cook shares "Pancakes" with a friend. The link has to open the recipe on the friend\'s phone a week later.',
    options: [
      { label: 'A short code in the address', changes: 'Needs a small table of codes. Links stay short.' },
      { label: 'The recipe id in the address', changes: 'No new table. Anyone can guess the next id.' },
    ],
    recommendation: { option: 1, reason: 'Codes can be switched off one at a time.' },
  },
  {
    group: 'Sharing links', kind: 'choice',
    title: 'Which sharing limits to offer',
    scenario: 'A cook wants to share a recipe for a week only. Pantry could offer several limits.',
    options: labels(12),
    recommendation: { option: 4, reason: 'A week is what cooks asked for.' },
  },
  {
    group: 'Sharing links', kind: 'choice',
    title: 'What a receiver can do with a shared recipe',
    scenario: 'The friend opens the link and wants to scale the recipe to six servings.',
    options: [
      { label: 'Read only', changes: 'Nothing to store for the receiver.' },
      { label: 'Read and copy to their own recipes', changes: 'Needs an account and a copy step.' },
      { label: 'Read, scale and print', changes: 'Scaling runs in the page, no account.' },
    ],
    recommendation: { option: 3, reason: 'Covers what the friend asked for without an account.' },
  },
  ...['The share code is 8 characters', 'Links never expire by default', 'Recipes have one owner', 'Photos are already resized', 'Copying keeps the original author', 'Nobody shares more than 100 recipes'].map((title, i) => ({
    group: 'Sharing links', kind: 'assumption', title,
    scenario: `If this is wrong, ${['codes collide', 'old links open forever', 'a shared edit has no owner', 'pages load slowly', 'credit is lost', 'the share list is too long'][i]}.`,
    recommendation: { option: 1, reason: 'Matches what the code does today.' },
  })),
]

export const EXTRA_FINDINGS: Record<string, any>[] = Array.from({ length: 20 }, (_, i) => ({
  group: 'Pantry audit', kind: 'finding', section: 'needs-you',
  title: `Audit ${i + 1}: ${['timer', 'tags', 'units', 'search', 'export'][i % 5]} handling is inconsistent`,
  scenario: `Case ${i + 1}: the same recipe shows differently in the list and on its own page.`,
  recommendation: { option: 1, reason: 'A real defect with a clear fix.' },
}))

export const BACKUPS: Record<string, any>[] = [
  { group: 'Backups', kind: 'choice', title: 'How often to back up recipes', scenario: 'Recipes are lost if the laptop breaks.', options: [{ label: 'Daily' }, { label: 'Weekly' }], recommendation: { option: 1, reason: 'Cheap and safe.' } },
  { group: 'Backups', kind: 'choice', title: 'Where backups go', scenario: 'A backup has to live somewhere other than the laptop.', options: [{ label: 'A cloud folder' }, { label: 'A USB drive' }], recommendation: { option: 1, reason: 'No one has to remember to plug it in.' } },
]

/** The review's `dependsOn` ids count from its own first finding; shifted by what is added before it. */
export function shifted(input: Record<string, any>, offset: number): Record<string, any> {
  return input.dependsOn ? { ...input, dependsOn: input.dependsOn.map((id: string) => `d${Number(id.slice(1)) + offset}`) } : input
}

/** What the seed does to an inbox decision after adding it: a reply nobody has read, a quick answer from triage, or an answer saved without a turn. */
export type InboxEntry = {
  input: Record<string, any>
  reply?: { question: string; answer: string }
  /** A question the small model answered under `auto` (rows 271, 274), so the decision screen offers `r`. */
  quick?: { question: string; answer: string }
  answer?: { option?: number; condition?: string; text?: string }
}

/**
 * The pane's inbox (205, 206, 208): one decision with an unread reply, one answered with a condition, one with
 * Something else, and one with a quick answer from triage.
 */
export const INBOX: InboxEntry[] = [
  {
    input: {
      group: 'Recipe printing', kind: 'choice',
      title: 'What a printed recipe shows at the top',
      scenario: 'A cook prints "Lemon tart" to pin on the fridge. The top of the page has room for one thing.',
      options: [
        { label: 'The photo', changes: 'Looks good, costs ink.' },
        { label: 'The ingredients', changes: 'Easier to shop from, no picture.' },
      ],
      recommendation: { option: 2, reason: 'Cooks print to shop and cook, not to look.' },
    },
    reply: { question: 'Would a small photo beside the ingredients fit?', answer: 'Yes: a thumbnail beside the list fits on A4 and costs little ink.' },
  },
  {
    input: {
      group: 'Recipe printing', kind: 'choice',
      title: 'Whether to print in colour',
      scenario: 'Most home printers are colour, but ink is dear and some cooks print often.',
      options: [
        { label: 'Colour', changes: 'Photos look right.' },
        { label: 'Black and white', changes: 'Cheaper, photos look flat.' },
      ],
      recommendation: { option: 1, reason: 'Photos are why people share recipes.' },
    },
    answer: { option: 1, condition: 'only for recipes with photos' },
  },
  {
    input: {
      group: 'Recipe printing', kind: 'choice',
      title: 'How a printed recipe links back to the app',
      scenario: 'A cook with a printed card wants the full recipe, with its notes, on their phone.',
      options: [
        { label: 'The share link written out', changes: 'Long to type.' },
        { label: 'No link', changes: 'Nothing to build.' },
      ],
      recommendation: { option: 1, reason: 'Every share already has a link.' },
    },
    answer: { text: 'a QR code on the printed recipe card' },
  },
  {
    input: {
      group: 'Recipe printing', kind: 'choice',
      title: 'Which paper size a printed recipe is laid out for',
      scenario: 'A cook in the US prints "Lemon tart" on Letter paper and the method runs onto a second page.',
      options: [
        { label: 'A4 only', changes: 'One layout. Letter cuts off the last lines.' },
        { label: 'A4 and Letter', changes: 'Two layouts, picked from the printer setting.' },
      ],
      recommendation: { option: 2, reason: 'Cooks print on whatever paper their printer holds.' },
    },
    quick: { question: 'What does picked from the printer setting mean?', answer: 'The page reads the paper size the print dialog sends and uses the layout for it, so the cook never chooses.' },
  },
]

/** A problem line the small model wrote (row 272), seeded on the first decision so the header shows `◇ `. */
export const MODEL_PROBLEM = 'A shared recipe link has to keep working on a phone a week later'

/** The session record (rows 253, 265): the list's session card and the Session page, given as `decisions_session` input. */
export const SESSION_RECORD: Record<string, any> = {
  title: 'Pantry: sharing recipes by link',
  summary: 'Planning how a cook shares a recipe with a friend by link, and reviewing the importer while that waits on decisions.',
  now: { text: 'Choosing where share links live', waitsOn: ['d1'] },
  plan: [
    { text: 'Review the recipe importer', status: 'done', note: 'findings in the pane' },
    {
      text: 'Sharing by link', status: 'active', steps: [
        { text: 'Pick where links live', status: 'active', waitsOn: ['d1'] },
        { text: 'Build the share page', status: 'todo' },
      ],
    },
    { text: 'Recipe printing', status: 'todo' },
  ],
  links: [{ url: 'https://github.com/example/pantry/pull/12', label: '#12 Recipe importer fixes', state: 'open' }],
}

/** An inbox decision as the seed leaves it: the reply or quick answer after it was made (so unread), or ready with its answer. */
export function inboxState<D extends { createdAt: string; thread: any[] }>(d: D, entry: InboxEntry, at: string): D & Record<string, any> {
  if (entry.reply) {
    return { ...d, thread: [{ who: 'person', text: entry.reply.question, at }, { who: 'claude', text: entry.reply.answer, at }] }
  }
  if (entry.quick) {
    return { ...d, state: 'live', thread: [{ who: 'person', text: entry.quick.question, at }, { who: 'quick', via: 'triage', text: entry.quick.answer, at }] }
  }

  return { ...d, state: 'ready', answer: { ...entry.answer, answeredAt: at } }
}

export const SEEDED: Record<string, any>[] = [
  ...CHOICES,
  ...REVIEW_47.map(f => shifted(f, CHOICES.length)),
  ...EXTRA_FINDINGS,
  ...BACKUPS,
  ...INBOX.map(entry => entry.input),
]
