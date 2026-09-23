import { describe, expect, it } from 'vitest'
import {
  findProbableDuplicates,
  findProbableDuplicateSettlements,
  mergeTrip,
  mergeTripMaps,
  restoreDeletedTrips,
  summariseMerge,
} from './merge'
import { computeTotals } from './balance'
import { makeExpense, makeMember, makeSettlement, makeTrip, randomTrip, rng } from './testkit'
import type { Trip } from './types'

/** Canonical form, so two structurally equal trips compare equal. */
function canon(trip: Trip): string {
  const sortObj = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)))
  return JSON.stringify({
    ...trip,
    members: sortObj(trip.members),
    expenses: sortObj(trip.expenses),
    settlements: sortObj(trip.settlements),
  })
}

/**
 * Builds two divergent replicas of one trip: each device edits a random
 * subset, and they only partly overlap — exactly what happens when two
 * phones log expenses independently for three days.
 */
function divergentReplicas(seed: number): [Trip, Trip] {
  const base = randomTrip(seed, 5, 30)
  const rand = rng(seed * 31 + 7)
  const a: Trip = JSON.parse(JSON.stringify(base))
  const b: Trip = JSON.parse(JSON.stringify(base))

  for (const [i, e] of Object.values(base.expenses).entries()) {
    const roll = rand()
    if (roll < 0.25) {
      delete a.expenses[e.id]
      b.expenses[e.id] = { ...b.expenses[e.id]!, updatedAt: 9000 + i, updatedBy: 'devB' }
    } else if (roll < 0.5) {
      delete b.expenses[e.id]
      a.expenses[e.id] = { ...a.expenses[e.id]!, updatedAt: 8000 + i, updatedBy: 'devA' }
    } else if (roll < 0.65) {
      a.expenses[e.id] = {
        ...a.expenses[e.id]!,
        description: 'edited on A',
        updatedAt: 9500 + i,
        updatedBy: 'devA',
      }
      b.expenses[e.id] = {
        ...b.expenses[e.id]!,
        deletedAt: 9400 + i,
        updatedAt: 9400 + i,
        updatedBy: 'devB',
      }
    }
  }

  a.expenses.onlyA = makeExpense({ id: 'onlyA', updatedBy: 'devA', updatedAt: 9999 })
  b.expenses.onlyB = makeExpense({ id: 'onlyB', updatedBy: 'devB', updatedAt: 9998 })
  return [a, b]
}

describe('mergeTrip — the three CRDT laws', () => {
  it('is commutative: merge(a,b) === merge(b,a)', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const [a, b] = divergentReplicas(seed)
      expect(canon(mergeTrip(a, b))).toBe(canon(mergeTrip(b, a)))
    }
  })

  it('is associative: (a+b)+c === a+(b+c)', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const [a, b] = divergentReplicas(seed)
      const [, c] = divergentReplicas(seed + 500)
      expect(canon(mergeTrip(mergeTrip(a, b), c))).toBe(canon(mergeTrip(a, mergeTrip(b, c))))
    }
  })

  it('is idempotent: importing the same file twice changes nothing', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const [a, b] = divergentReplicas(seed)
      const once = mergeTrip(a, b)
      expect(canon(mergeTrip(once, b))).toBe(canon(once))
      expect(canon(mergeTrip(once, once))).toBe(canon(once))
    }
  })

  it('converges: everyone ends with the same balances however files flow', () => {
    // A -> B -> C versus C -> A -> B. Real groups will do both.
    for (let seed = 1; seed <= 40; seed += 1) {
      const [a, b] = divergentReplicas(seed)
      const [, c] = divergentReplicas(seed + 900)
      const path1 = mergeTrip(mergeTrip(a, b), c)
      const path2 = mergeTrip(mergeTrip(c, a), b)
      expect(computeTotals(path1).balances).toEqual(computeTotals(path2).balances)
    }
  })
})

describe('mergeTrip — conflict rules', () => {
  const members = [makeMember('m1', 'Asha'), makeMember('m2', 'Bilal')]

  it('keeps the later edit', () => {
    const a = makeTrip('t', members)
    const b = makeTrip('t', members)
    a.expenses.e = makeExpense({ id: 'e', description: 'old', updatedAt: 100 })
    b.expenses.e = makeExpense({ id: 'e', description: 'new', updatedAt: 200 })
    expect(mergeTrip(a, b).expenses.e!.description).toBe('new')
  })

  it('a delete does not come back after merging with a stale replica', () => {
    // This is exactly what tombstones exist for: B never saw the deletion,
    // so without a tombstone B's copy would resurrect the expense.
    const a = makeTrip('t', members)
    const b = makeTrip('t', members)
    a.expenses.e = makeExpense({ id: 'e', updatedAt: 500, deletedAt: 500 })
    b.expenses.e = makeExpense({ id: 'e', updatedAt: 100, deletedAt: null })
    expect(mergeTrip(a, b).expenses.e!.deletedAt).toBe(500)
    expect(mergeTrip(b, a).expenses.e!.deletedAt).toBe(500)
  })

  it('an edit made after a delete un-deletes, because it is newer', () => {
    const a = makeTrip('t', members)
    const b = makeTrip('t', members)
    a.expenses.e = makeExpense({ id: 'e', updatedAt: 100, deletedAt: 100 })
    b.expenses.e = makeExpense({ id: 'e', updatedAt: 900, deletedAt: null })
    expect(mergeTrip(a, b).expenses.e!.deletedAt).toBeNull()
  })

  it('breaks an identical-timestamp conflict the same way on both devices', () => {
    const a = makeTrip('t', members)
    const b = makeTrip('t', members)
    a.expenses.e = makeExpense({ id: 'e', description: 'A', updatedAt: 100, updatedBy: 'devA' })
    b.expenses.e = makeExpense({ id: 'e', description: 'B', updatedAt: 100, updatedBy: 'devB' })
    expect(mergeTrip(a, b).expenses.e!.description).toBe('B') // devB > devA
    expect(mergeTrip(b, a).expenses.e!.description).toBe('B')
  })

  it('takes the union of members added on different phones', () => {
    const a = makeTrip('t', [makeMember('m1', 'Asha')])
    const b = makeTrip('t', [makeMember('m2', 'Bilal')])
    expect(Object.keys(mergeTrip(a, b).members).sort()).toEqual(['m1', 'm2'])
  })

  it('refuses to merge two different trips', () => {
    expect(() => mergeTrip(makeTrip('t1'), makeTrip('t2'))).toThrow()
  })
})

describe('findProbableDuplicates', () => {
  const members = [makeMember('m1', 'Asha'), makeMember('m2', 'Bilal')]

  it('flags the same dinner typed in on two phones', () => {
    const trip = makeTrip('t', members)
    trip.expenses.a = makeExpense({ id: 'a', amountMinor: 4500, paidBy: 'm1', updatedBy: 'devA' })
    trip.expenses.b = makeExpense({ id: 'b', amountMinor: 4500, paidBy: 'm1', updatedBy: 'devB' })
    const groups = findProbableDuplicates(trip)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.expenses.map((e) => e.id).sort()).toEqual(['a', 'b'])
  })

  it('leaves two identical coffees from one phone alone', () => {
    const trip = makeTrip('t', members)
    trip.expenses.a = makeExpense({ id: 'a', amountMinor: 200, updatedBy: 'devA' })
    trip.expenses.b = makeExpense({ id: 'b', amountMinor: 200, updatedBy: 'devA' })
    expect(findProbableDuplicates(trip)).toHaveLength(0)
  })

  it('never flags a deleted expense', () => {
    const trip = makeTrip('t', members)
    trip.expenses.a = makeExpense({ id: 'a', updatedBy: 'devA' })
    trip.expenses.b = makeExpense({ id: 'b', updatedBy: 'devB', deletedAt: 1 })
    expect(findProbableDuplicates(trip)).toHaveLength(0)
  })
})

describe('summariseMerge', () => {
  it('counts what an import actually brought in', () => {
    const before = { t: makeTrip('t', [makeMember('m1', 'Asha')]) }
    const after = { t: makeTrip('t', [makeMember('m1', 'Asha'), makeMember('m2', 'Bilal')]) }
    after.t.expenses.e1 = makeExpense({ id: 'e1' })
    const s = summariseMerge(before, after)
    expect(s).toMatchObject({ tripsAdded: 0, tripsUpdated: 1, expensesAdded: 1, membersAdded: 1 })
  })

  it('counts a brand new trip wholesale', () => {
    const after = { t: makeTrip('t', [makeMember('m1', 'Asha')]) }
    after.t.expenses.e1 = makeExpense({ id: 'e1' })
    expect(summariseMerge({}, after)).toMatchObject({ tripsAdded: 1, expensesAdded: 1 })
  })
})

describe('audit fixes', () => {
  const trip = () => makeTrip('trip-0001', [makeMember('m1', 'Asha'), makeMember('m2', 'Bilal')])
  const pay = (id: string, by: string, amountMinor = 500) =>
    makeSettlement({ id, fromMember: 'm2', toMember: 'm1', amountMinor, date: '2026-09-23', updatedBy: by })

  it('E: flags one repayment recorded on two phones', () => {
    const t = trip()
    t.settlements.a = pay('a', 'devA')
    t.settlements.b = pay('b', 'devB')
    expect(findProbableDuplicateSettlements(t)).toHaveLength(1)
  })

  it('E CONTROL: two repayments from one phone are deliberate, not flagged', () => {
    const t = trip()
    t.settlements.a = pay('a', 'devA')
    t.settlements.b = pay('b', 'devA')
    expect(findProbableDuplicateSettlements(t)).toHaveLength(0)
  })

  it('E CONTROL: different amounts are not flagged, and nor is a deleted copy', () => {
    const t = trip()
    t.settlements.a = pay('a', 'devA')
    t.settlements.b = pay('b', 'devB', 400)
    t.settlements.c = { ...pay('c', 'devC'), deletedAt: 9 }
    expect(findProbableDuplicateSettlements(t)).toHaveLength(0)
  })

  it('D: an import the person starts brings back a trip deleted on this phone', () => {
    const remote = trip()
    remote.expenses.e1 = makeExpense({ id: 'e1' })
    const mine = { ...trip(), deletedAt: 99_999, updatedAt: 99_999 }
    const merged = mergeTripMaps(restoreDeletedTrips({ [mine.id]: mine }, { [remote.id]: remote }), {
      [remote.id]: remote,
    })
    expect(merged[remote.id]!.deletedAt).toBeNull()
    expect(merged[remote.id]!.expenses.e1).toBeDefined()
  })

  it('D CONTROL: a plain merge, as sync does, keeps it deleted', () => {
    const remote = trip()
    const mine = { ...trip(), deletedAt: 99_999, updatedAt: 99_999 }
    expect(mergeTrip(mine, remote).deletedAt).not.toBeNull()
  })

  it('D CONTROL: leaves trips that were never deleted exactly as they were', () => {
    const local = { [trip().id]: trip() }
    expect(restoreDeletedTrips(local, { [trip().id]: trip() })).toBe(local)
  })
})
