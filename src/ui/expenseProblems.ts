/**
 * What stops an expense from being saved, and WHERE on the form it is.
 *
 * A form that only says "add a description" at the bottom of a long page
 * leaves the person hunting for the box it means; on a phone the box is a
 * screen and a half above. Naming the field lets the editor put the message
 * under the field itself and scroll there when Save is tapped.
 *
 * Order matters: the first problem is the one shown, and it runs top to
 * bottom in the order the fields appear on screen, so the scroll lands on
 * the highest unfinished box.
 */

export type ProblemField = 'amount' | 'description' | 'paidBy' | 'date' | 'split'

export interface Problem {
  at: ProblemField
  message: string
}

export interface ProblemInput {
  amountText: string
  /** Parsed amount, or null when the text is not an amount. */
  amountMinor: number | null
  decimals: number
  description: string
  /** Whether the note box has text: the commonest slip is writing the
   *  description there and leaving the real box empty. */
  hasNote: boolean
  paidBy: string
  memberCount: number
  dateOk: boolean
  /** null while the amount is unusable; otherwise the split's verdict. */
  split: { ok: true } | { ok: false; message: string } | null
}

export function firstProblem(i: ProblemInput): Problem | null {
  if (i.amountText.trim() === '') return { at: 'amount', message: 'Enter an amount.' }
  if (i.amountMinor === null) {
    return {
      at: 'amount',
      message: `That is not an amount this currency can hold (max ${i.decimals} decimal places). Sums like 1200+340 are fine.`,
    }
  }
  if (i.amountMinor <= 0) return { at: 'amount', message: 'Amount must be more than zero.' }
  if (i.description.trim() === '') {
    return {
      at: 'description',
      message: i.hasNote
        ? 'Say what this was for in a few words. The note below is extra detail, not the name.'
        : 'Say what this was for in a few words, so everyone knows.',
    }
  }
  if (i.memberCount === 0) {
    return { at: 'paidBy', message: 'Add someone to the trip before logging an expense.' }
  }
  if (i.paidBy === '') return { at: 'paidBy', message: 'Pick who paid.' }
  // The date picker's Clear button leaves "". Other phones reject that, so
  // the expense would silently never reach them.
  if (!i.dateOk) return { at: 'date', message: 'Pick a date.' }
  if (i.split && !i.split.ok) return { at: 'split', message: i.split.message }
  return null
}
