import { describe, expect, it } from 'vitest'
import { makeExpense, makeMember, makeTrip } from './testkit'
import {
  closedPeriods,
  computeTotals,
  currentWindow,
  liveClosings,
  liveExpenses,
  liveSettlements,
  periodOf,
  periodStart,
} from './balance'
import { buildLedgerFile, decodeLedger, encodeLedger, ledgerSchemaFor, parseLedger } from './ledger'
import { mergeTrip } from './merge'
import { LEGACY_SCHEMA, SCHEMA_VERSION, type Closing, type Trip } from './types'

const stamp = (at: number) => ({ updatedAt: at, updatedBy: 'devA', deletedAt: null as number | null })
const closing = (id: string, at: number, over: Partial<Closing> = {}): Closing => ({
  id, at, note: '', createdAt: at, ...stamp(at), ...over,
})

/** Two people, a month of expenses, books closed at t=1000 and again at t=2000. */
function household(): Trip {
  const t = makeTrip('trip-household-01', [makeMember('a', 'Asha'), makeMember('b', 'Ben')])
  const both = [{ memberId: 'a', weight: 1 }, { memberId: 'b', weight: 1 }]
  t.expenses = {
    e1: makeExpense({ id: 'e1', amountMinor: 1000, paidBy: 'a', parts: both, createdAt: 100, date: '2026-01-05' }),
    e2: makeExpense({ id: 'e2', amountMinor: 1000, paidBy: 'b', parts: both, createdAt: 900, date: '2026-01-20' }),
    e3: makeExpense({ id: 'e3', amountMinor: 3000, paidBy: 'a', parts: both, createdAt: 1500, date: '2026-02-10' }),
    // Logged in period 3 but dated inside period 2: counts where it was LOGGED.
    e4: makeExpense({ id: 'e4', amountMinor: 500, paidBy: 'b', parts: both, createdAt: 2500, date: '2026-02-01' }),
  }
  t.settlements = {
    s1: { id: 's1', fromMember: 'b', toMember: 'a', amountMinor: 1500, date: '2026-02-28', note: '', createdAt: 1900, ...stamp(1900) },
  }
  t.closings = { c1: closing('c1', 1000), c2: closing('c2', 2000) }
  return t
}

describe('periods', () => {
  it('the current period starts at the latest live closing', () => {
    const t = household()
    expect(periodStart(t)).toBe(2000)
    expect(liveClosings(t).map((c) => c.id)).toEqual(['c2', 'c1'])
    expect(currentWindow(t)).toEqual({ after: 2000, upTo: Number.POSITIVE_INFINITY })
  })

  it('a trip without closings is one open period from the dawn of time', () => {
    const t = makeTrip()
    expect(periodStart(t)).toBe(0)
    expect(closedPeriods(t)).toEqual([])
  })

  it('records go by when they were logged, not the date typed on them', () => {
    const t = household()
    expect(liveExpenses(t).map((e) => e.id)).toEqual(['e4'])
    expect(periodOf(t, t.expenses.e4!)).toBeNull()
    expect(periodOf(t, t.expenses.e3!)?.id).toBe('c2')
    expect(periodOf(t, t.expenses.e1!)?.id).toBe('c1')
    expect(periodOf(t, t.expenses.e2!)?.id).toBe('c1')
  })

  it('balances count only the current period', () => {
    const t = household()
    const net = Object.fromEntries(computeTotals(t).balances.map((b) => [b.memberId, b.netMinor]))
    // Only e4: Ben paid 500, each used 250.
    expect(net).toEqual({ a: -250, b: 250 })
    expect(computeTotals(t).totalSpentMinor).toBe(500)
  })

  it('each closed period carries its own records and totals, newest first', () => {
    const p = closedPeriods(household())
    expect(p.map((x) => x.closing.id)).toEqual(['c2', 'c1'])
    expect(p[0]!.window).toEqual({ after: 1000, upTo: 2000 })
    expect(p[0]!.expenses.map((e) => e.id)).toEqual(['e3'])
    expect(p[0]!.settlements.map((s) => s.id)).toEqual(['s1'])
    // Asha paid 3000, each used 1500, Ben repaid 1500: square.
    expect(p[0]!.totals.balances.every((b) => b.netMinor === 0)).toBe(true)
    expect(p[1]!.window).toEqual({ after: 0, upTo: 1000 })
    expect(p[1]!.expenses.map((e) => e.id).sort()).toEqual(['e1', 'e2'])
    expect(p[1]!.totals.totalSpentMinor).toBe(2000)
  })

  it('a reopened (tombstoned) closing merges its period back into the current one', () => {
    const t = household()
    t.closings.c2 = { ...t.closings.c2!, deletedAt: 2100, updatedAt: 2100 }
    expect(periodStart(t)).toBe(1000)
    expect(liveExpenses(t).map((e) => e.id).sort()).toEqual(['e3', 'e4'])
    expect(liveSettlements(t).map((s) => s.id)).toEqual(['s1'])
  })
})

describe('closings on the wire', () => {
  it('a ledger without closings still claims the legacy schema, so older phones keep working', () => {
    const t = makeTrip()
    expect(ledgerSchemaFor({ [t.id]: t })).toBe(LEGACY_SCHEMA)
    expect(buildLedgerFile({ [t.id]: t }, 'dev').schema).toBe(LEGACY_SCHEMA)
  })

  it('a ledger with any closing, even a reopened one, claims the current schema', () => {
    const t = household()
    expect(buildLedgerFile({ [t.id]: t }, 'dev').schema).toBe(SCHEMA_VERSION)
    t.closings = { c1: { ...t.closings.c1!, deletedAt: 1200 } }
    expect(ledgerSchemaFor({ [t.id]: t })).toBe(SCHEMA_VERSION)
  })

  it('closings survive a round trip through the wire format', () => {
    const t = household()
    const back = decodeLedger(encodeLedger(buildLedgerFile({ [t.id]: t }, 'dev')))
    expect(back.ok).toBe(true)
    if (!back.ok) return
    expect(back.file.trips[t.id]!.closings).toEqual(t.closings)
  })

  it('an app from before closings sees "newer version" and stands down', () => {
    // SCHEMA_VERSION here is 3; an old app's ceiling was 1. Simulate that
    // ceiling by asking this parser about a ledger one past ITS ceiling.
    const t = household()
    const r = parseLedger({ ...buildLedgerFile({ [t.id]: t }, 'dev'), schema: SCHEMA_VERSION + 1 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('newer-version')
  })

  it('a damaged closing is dropped with a warning, not the whole trip', () => {
    const t = household()
    const raw = JSON.parse(JSON.stringify(buildLedgerFile({ [t.id]: t }, 'dev')))
    raw.trips[t.id].closings.c1.at = 'yesterday'
    const r = parseLedger(raw)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(Object.keys(r.file.trips[t.id]!.closings)).toEqual(['c2'])
    expect(r.warnings.join(' ')).toMatch(/closing/)
  })
})

describe('closings merge like every other record', () => {
  it('union of closings made on different phones; a tombstone wins by being newer', () => {
    const a = household()
    const b = household()
    b.closings = { ...b.closings, c3: closing('c3', 3000, { updatedBy: 'devB' }) }
    a.closings.c2 = { ...a.closings.c2!, deletedAt: 2500, updatedAt: 2500 }
    const m = mergeTrip(a, b)
    expect(Object.keys(m.closings).sort()).toEqual(['c1', 'c2', 'c3'])
    expect(m.closings.c2!.deletedAt).toBe(2500)
    expect(mergeTrip(b, a)).toEqual(m)
  })

  it('merges a replica saved before closings existed', () => {
    const old = household() as Partial<Trip> as Trip
    delete (old as Partial<Trip>).closings
    const m = mergeTrip(old, household())
    expect(Object.keys(m.closings).sort()).toEqual(['c1', 'c2'])
  })
})
