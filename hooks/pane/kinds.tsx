import type { Kind } from '../store'

export type FixedOption = { label: string; changes: string }

/** The options of every kind but choice and question. The tool fills them, so the keys (D4) and the labels can't drift apart. */
export const FIXED_OPTIONS: Record<'go-ahead' | 'assumption' | 'finding' | 'task', FixedOption[]> = {
  'go-ahead': [
    { label: 'Yes', changes: 'Claude goes ahead' },
    { label: 'No', changes: 'Claude does not do it' },
  ],
  assumption: [
    { label: 'Right', changes: 'Claude carries on as it assumed' },
    { label: 'Wrong', changes: 'Claude stops relying on it and asks what is right' },
  ],
  finding: [
    { label: 'Agree', changes: 'it is a real problem and Claude acts on it' },
    { label: 'Already decided', changes: 'it was settled earlier, so Claude drops it' },
    { label: 'Disagree', changes: 'it is not a problem, so Claude drops it' },
    { label: 'Not sure', changes: 'Claude leaves it open for you to come back to' },
  ],
  task: [
    { label: 'Done', changes: 'Claude carries on' },
    { label: "Can't do it", changes: 'Claude asks what to do instead' },
  ],
}

/** The options the tool fills in for a kind, or undefined when Claude writes them (choice) or there are none (question). */
export function fixedOptionsFor(kind: Kind, isTask: boolean): FixedOption[] | undefined {
  if (isTask) {
    return FIXED_OPTIONS.task
  }
  if (kind === 'choice' || kind === 'question') {
    return undefined
  }

  return FIXED_OPTIONS[kind]
}

/** The words the decision screen uses for a kind. */
export function kindLabel(kind: Kind, isTask: boolean | undefined): string {
  return isTask ? 'to do' : kind
}
