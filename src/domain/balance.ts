import type { Closing, Expense, Id, Minor, Settlement, Trip } from './types'
import { computeSplit } from './split'

export interface MemberBalance {
  memberId: Id
  /** Total this member fronted for the group. */
  paidMinor: Minor
  /** Total this member consumed, i.e. their share of every expense. */
  owedMinor: Minor
  /** Repayments this member handed over. */
  settledOutMinor: Minor
  /** Repayments this member received. */
  settledInMinor: Minor
  /**
   * The single number that matters.
   *   > 0  the group owes this member
   *   < 0  this member owes the group
   *   = 0  square
   */
  netMinor: Minor
}

export interface TripTotals {
  /** Sum of every live expense. */
  totalSpentMinor: Minor
  balances: MemberBalance[]
  /** Expenses that could not be split (bad data from an older/buggy replica). */
  problems: { expenseId: Id; message: string }[]
}

/**
 * PERIODS. A closing draws a line under the books at a moment in time.
 * Records are assigned to periods by `createdAt`, the moment they were
 * logged, never by their user-typed date: an expense added after the
 * closing is new money owed, whatever day it was for. The current period
 * is everything after the latest live closing; each closed period runs
 * from the closing before it up to and including its own moment.
 */
export interface Window {
  /** Exclusive lower bound on createdAt. */
  after: number
  /** Inclusive upper bound on createdAt. */
  upTo: number
}

export function liveClosings(trip: Trip): Closing[] {
  return Object.values(trip.closings ?? {})
    .filter((c) => c.deletedAt === null)
    .sort((a, b) => b.at - a.at || (a.id < b.id ? -1 : 1))
}

/** The moment the current period began: the latest live closing, or the dawn of time. */
export function periodStart(trip: Trip): number {
  return liveClosings(trip)[0]?.at ?? 0
}

export function currentWindow(trip: Trip): Window {
  return { after: periodStart(trip), upTo: Number.POSITIVE_INFINITY }
}

const within = (w: Window) => (r: { createdAt: number }) => r.createdAt > w.after && r.createdAt <= w.upTo

/** Expenses in a period, newest first. Defaults to the current period. */
export function liveExpenses(trip: Trip, w: Window = currentWindow(trip)): Expense[] {
  return Object.values(trip.expenses)
    .filter((e) => e.deletedAt === null)
    .filter(within(w))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
}

/** Repayments in a period, newest first. Defaults to the current period. */
export function liveSettlements(trip: Trip, w: Window = currentWindow(trip)): Settlement[] {
  return Object.values(trip.settlements)
    .filter((s) => s.deletedAt === null)
    .filter(within(w))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
}

export interface ClosedPeriod {
  closing: Closing
  window: Window
  expenses: Expense[]
  settlements: Settlement[]
  totals: TripTotals
}

/** Every closed period, newest first, each with its own records and totals. */
export function closedPeriods(trip: Trip): ClosedPeriod[] {
  const closings = liveClosings(trip)
  return closings.map((closing, i) => {
    const window: Window = { after: closings[i + 1]?.at ?? 0, upTo: closing.at }
    return {
      closing,
      window,
      expenses: liveExpenses(trip, window),
      settlements: liveSettlements(trip, window),
      totals: computeTotals(trip, window),
    }
  })
}

/** Which period a record belongs to: `null` for the current one, else its closing. */
export function periodOf(trip: Trip, record: { createdAt: number }): Closing | null {
  // Oldest first: a record belongs to the first closing drawn after it.
  const oldestFirst = [...liveClosings(trip)].reverse()
  for (const c of oldestFirst) if (record.createdAt <= c.at) return c
  return null
}

export function liveMembers(trip: Trip) {
  return Object.values(trip.members)
    .filter((m) => m.deletedAt === null)
    .sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1))
}

/**
 * Compute where everyone stands.
 *
 * net = (what you paid out) - (what you consumed)
 *       + (repayments you made) - (repayments you received)
 *
 * The two settlement terms have those signs because handing cash to someone
 * you owe *reduces* your debt, which moves your net upward.
 *
 * INVARIANT: the nets of all members sum to zero. Money is only ever moved
 * between members, never created. `assertBalanced` checks this, and the test
 * suite asserts it over randomised ledgers.
 */
export function computeTotals(trip: Trip, w: Window = currentWindow(trip)): TripTotals {
  const members = liveMembers(trip)
  const index = new Map<Id, MemberBalance>()
  for (const m of members) {
    index.set(m.id, {
      memberId: m.id,
      paidMinor: 0,
      owedMinor: 0,
      settledOutMinor: 0,
      settledInMinor: 0,
      netMinor: 0,
    })
  }

  const problems: TripTotals['problems'] = []
  let totalSpentMinor = 0

  for (const expense of liveExpenses(trip, w)) {
    // A member removed after an expense was logged still has to carry their
    // share, otherwise deleting a person would quietly rewrite history.
    // So we look up by id and tolerate a missing (deleted) member by
    // re-creating a zeroed row for them rather than dropping the expense.
    const payer = index.get(expense.paidBy) ?? ensureRow(index, expense.paidBy)

    const split = computeSplit(expense.amountMinor, expense.splitMode, expense.parts)
    if (!split.ok) {
      problems.push({ expenseId: expense.id, message: split.message })
      continue
    }

    totalSpentMinor += expense.amountMinor
    payer.paidMinor += expense.amountMinor

    for (const [memberId, share] of split.shares) {
      const row = index.get(memberId) ?? ensureRow(index, memberId)
      row.owedMinor += share
    }
  }

  for (const s of liveSettlements(trip, w)) {
    if (s.fromMember === s.toMember) continue
    if (s.amountMinor <= 0) continue
    const from = index.get(s.fromMember) ?? ensureRow(index, s.fromMember)
    const to = index.get(s.toMember) ?? ensureRow(index, s.toMember)
    from.settledOutMinor += s.amountMinor
    to.settledInMinor += s.amountMinor
  }

  const balances = [...index.values()]
  for (const b of balances) {
    b.netMinor = b.paidMinor - b.owedMinor + b.settledOutMinor - b.settledInMinor
  }

  balances.sort((a, b) => b.netMinor - a.netMinor || (a.memberId < b.memberId ? -1 : 1))
  return { totalSpentMinor, balances, problems }
}

function ensureRow(index: Map<Id, MemberBalance>, memberId: Id): MemberBalance {
  const row: MemberBalance = {
    memberId,
    paidMinor: 0,
    owedMinor: 0,
    settledOutMinor: 0,
    settledInMinor: 0,
    netMinor: 0,
  }
  index.set(memberId, row)
  return row
}

/** Returns the imbalance; anything other than 0 is a bug in this file. */
export function assertBalanced(totals: TripTotals): Minor {
  return totals.balances.reduce((a, b) => a + b.netMinor, 0)
}
