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

export const SEEDED: Record<string, any>[] = [...CHOICES, ...REVIEW_47.map(f => shifted(f, CHOICES.length)), ...EXTRA_FINDINGS, ...BACKUPS]
