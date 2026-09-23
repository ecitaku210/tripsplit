import { computeSplit } from '../domain/split'
import { formatMoney } from '../domain/money'
import type { Currency, Expense, Id, SplitMode } from '../domain/types'

/**
 * The small line under an expense's amount: what it means for the reader.
 * "you owe ₹800" when someone else paid and you were in the split, "you lent
 * ₹1,600" when you paid for others. Where the reader stands on each line,
 * without doing arithmetic.
 */
export function myLineOn(
  expense: Expense,
  me: Id | undefined,
  currency: Currency,
): { text: string; tone: 'pos' | 'neg' | '' } | null {
  if (!me) return null
  const split = computeSplit(expense.amountMinor, expense.splitMode, expense.parts)
  if (!split.ok) return null
  const share = split.shares.get(me) ?? 0
  if (expense.paidBy === me) {
    const lent = expense.amountMinor - share
    if (lent <= 0) return { text: 'just you', tone: '' }
    return { text: `you lent ${formatMoney(lent, currency)}`, tone: 'pos' }
  }
  if (share <= 0) return { text: 'not involved', tone: '' }
  return { text: `you owe ${formatMoney(share, currency)}`, tone: 'neg' }
}

/** "Split equally", "Split by amounts", … in the words the editor uses. */
export function splitModeLabel(mode: SplitMode, people: number): string {
  switch (mode) {
    case 'equal':
      return people === 1 ? 'Just one person' : `Split equally between ${people}`
    case 'exact':
      return 'Split by amounts'
    case 'shares':
      return 'Split by shares'
    case 'percent':
      return 'Split by percentage'
  }
}
