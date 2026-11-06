/** What the demo project's decisions store holds for recording the README's GIFs: pure data in the shape of `decisions_add` input, in the order added. */

const SHARING = 'Sharing links'
const REVIEW = 'Pantry review'

export const PARKED_TITLE = 'Photos: uploads over 10 MB fail with no message'

const fix = (reason: string) => ({ option: 1, reason })

export const DEMO: Record<string, any>[] = [
  {
    group: SHARING, kind: 'choice',
    title: 'Where share links live',
    scenario: 'A cook shares "Lentil soup" with a friend. The link has to open the recipe on the friend\'s phone a week later.',
    options: [
      { label: 'A short code in the address', changes: 'Needs a small table of codes. Links stay short and can be switched off one at a time.' },
      { label: 'The recipe id in the address', changes: 'No new table. Anyone can guess the next recipe\'s link.' },
    ],
    recommendation: { option: 1, reason: 'Codes can be switched off one at a time, ids can\'t.' },
  },
  {
    group: SHARING, kind: 'choice',
    title: 'What a receiver can do with a shared recipe',
    scenario: 'The friend opens the link and wants to scale the soup to six servings.',
    options: [
      { label: 'Read only', changes: 'Nothing to store for the receiver.' },
      { label: 'Read and copy to their own recipes', changes: 'Needs an account and a copy step.' },
      { label: 'Read, scale and print', changes: 'Scaling runs in the page, no account needed.' },
    ],
    recommendation: { option: 3, reason: 'Covers what the friend asked for without an account.' },
  },
  ...[
    ['A share code is 8 characters', 'If this is wrong, two recipes could end up with the same code once there are a few million links.'],
    ['Links never expire unless the cook switches them off', 'If this is wrong, a link sent last year stops working with no warning.'],
    ['Every recipe has exactly one owner', 'If this is wrong, a recipe two cooks edit has nobody who can switch its link off.'],
    ['Photos are already resized when they are uploaded', 'If this is wrong, a shared page loads full-size photos on a phone.'],
    ['Nobody shares more than 100 recipes', 'If this is wrong, the "my shared links" page gets too long to scroll.'],
  ].map(([title, scenario]) => ({
    group: SHARING, kind: 'assumption', title, scenario,
    recommendation: fix('Matches what the code does today.'),
  })),
  {
    group: REVIEW, kind: 'finding', section: 'needs-you',
    title: 'Recipe list: cooking times show in seconds',
    scenario: 'Pancakes show as "1200 min" in the list since the last commit.',
    recommendation: fix('A real defect with a one-line fix.'),
    sources: [{ label: 'app.py', path: 'app.py' }],
  },
  {
    group: REVIEW, kind: 'finding', section: 'needs-you',
    title: 'Search: a search for "pancake" misses "Pancakes"',
    scenario: 'A cook types the singular and gets nothing back.',
    recommendation: fix('Cooks search the way they speak.'),
    sources: [{ label: 'app.py', path: 'app.py' }],
  },
  {
    group: REVIEW, kind: 'finding', section: 'needs-you',
    title: PARKED_TITLE,
    scenario: 'A cook uploads a 12 MB photo of the soup and the page just reloads.',
    recommendation: fix('Say the limit before the upload, not after.'),
  },
  {
    group: REVIEW, kind: 'finding', section: 'needs-you',
    title: 'Favourites: only Pancakes can be a favourite',
    scenario: 'The favourite flag is set by hand on one recipe; nothing lets a cook mark another.',
    recommendation: fix('The feature is half there.'),
  },
  {
    group: REVIEW, kind: 'finding', section: 'claudes-call',
    title: 'Recipe list: the list is printed in the order recipes were added',
    scenario: 'Flapjacks come after Lentil soup, so the list isn\'t alphabetical.',
    recommendation: fix('Small and safe, so I am sorting it unless you object.'),
  },
  {
    group: REVIEW, kind: 'finding', section: 'claudes-call',
    title: 'README: the to-do list is out of date',
    scenario: 'Search is done but the README doesn\'t say so.',
    recommendation: fix('Docs only, so I am updating it unless you object.'),
  },
  {
    group: REVIEW, kind: 'finding', section: 'already-decided',
    title: 'Storage: recipes live in the code, not a database',
    scenario: 'Adding a recipe means editing app.py.',
    recommendation: fix('You decided to keep it in the code until sharing ships.'),
  },
  {
    group: REVIEW, kind: 'finding', section: 'already-decided',
    title: 'Search: matching ignores tags',
    scenario: 'Searching "vegan" finds nothing, though Lentil soup is tagged vegan.',
    recommendation: fix('You decided search is by name only for now.'),
  },
]
