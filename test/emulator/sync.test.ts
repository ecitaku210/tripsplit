import { afterEach, describe, expect, it } from 'vitest'
import { createSync, type SyncEngine, type SyncStatus } from '../../src/sync/engine'
import { mergeTrip } from '../../src/domain/merge'
import { makeExpense, makeMember, makeTrip } from '../../src/domain/testkit'
import type { Trip } from '../../src/domain/types'

/**
 * Two "phones" talking through Google's real Firestore emulator, with the
 * project's real security rules loaded. This is the end-to-end proof: real
 * listeners, real transactions, real rule checks on every write.
 */

const EMU = { host: '127.0.0.1', firestorePort: 8080, authPort: 9099 }
const CONFIG = { apiKey: 'fake-api-key', projectId: 'demo-tripsplit', appId: 'demo' }

interface Phone {
  name: string
  trips: Map<string, Trip>
  engine: SyncEngine
  statuses: SyncStatus[]
  edit: (tripId: string, fn: (t: Trip) => void) => void
}

const phones: Phone[] = []
afterEach(async () => {
  await Promise.all(phones.splice(0).map((p) => p.engine.close()))
})

function phone(name: string, start: Trip): Phone {
  const trips = new Map<string, Trip>([[start.id, structuredClone(start)]])
  const statuses: SyncStatus[] = []
  const engine = createSync({
    config: CONFIG,
    deviceId: `dev-${name}`,
    appName: `${name}-${Math.random()}`,
    emulator: EMU,
    debounceMs: 30,
    replica: {
      get: (id) => {
        const t = trips.get(id)
        return t && t.deletedAt === null ? t : null
      },
      adopt: (t) => {
        const prev = trips.get(t.id)
        trips.set(t.id, prev ? mergeTrip(prev, t) : t)
      },
    },
    onStatus: (_id, s) => statuses.push(s),
  })
  const p: Phone = {
    name,
    trips,
    engine,
    statuses,
    edit: (tripId, fn) => {
      const t = structuredClone(trips.get(tripId)!)
      fn(t)
      trips.set(tripId, t)
      engine.changed(tripId)
    },
  }
  phones.push(p)
  return p
}

async function waitFor(what: string, cond: () => boolean, ms = 10_000) {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for: ${what}`)
    await new Promise((r) => setTimeout(r, 40))
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function freshTrip(): Trip {
  const t = makeTrip(crypto.randomUUID(), [makeMember('m1', 'Asha'), makeMember('m2', 'Bilal')])
  return t
}

describe('live sync through the Firestore emulator', () => {
  it('shows an expense added on one phone on the other', async () => {
    const base = freshTrip()
    const a = phone('a', base)
    const b = phone('b', base)
    a.engine.watch(base.id)
    b.engine.watch(base.id)

    a.edit(base.id, (t) => {
      t.expenses.dinner = makeExpense({ id: 'dinner', amountMinor: 4200, paidBy: 'm1', updatedBy: 'dev-a', updatedAt: Date.now() })
    })

    await waitFor('phone B to receive the dinner', () => !!b.trips.get(base.id)!.expenses.dinner)
    expect(b.trips.get(base.id)!.expenses.dinner!.amountMinor).toBe(4200)
  })

  it('syncs both ways and both phones end up identical', async () => {
    const base = freshTrip()
    const a = phone('a', base)
    const b = phone('b', base)
    a.engine.watch(base.id)
    b.engine.watch(base.id)

    a.edit(base.id, (t) => {
      t.expenses.taxi = makeExpense({ id: 'taxi', updatedBy: 'dev-a', updatedAt: Date.now() })
    })
    await waitFor('B to get taxi', () => !!b.trips.get(base.id)!.expenses.taxi)
    b.edit(base.id, (t) => {
      t.expenses.hotel = makeExpense({ id: 'hotel', updatedBy: 'dev-b', updatedAt: Date.now() })
    })
    await waitFor('A to get hotel', () => !!a.trips.get(base.id)!.expenses.hotel)

    expect(JSON.stringify(Object.keys(a.trips.get(base.id)!.expenses).sort())).toBe(
      JSON.stringify(Object.keys(b.trips.get(base.id)!.expenses).sort()),
    )
  })

  it('keeps both expenses when two phones write at the same instant', async () => {
    const base = freshTrip()
    const a = phone('a', base)
    const b = phone('b', base)
    a.engine.watch(base.id)
    b.engine.watch(base.id)
    await waitFor('both connected', () => a.statuses.includes('live') && b.statuses.includes('live'))

    // Same moment, different expenses: one transaction must retry with the
    // other's data, or one expense would be lost.
    a.edit(base.id, (t) => {
      t.expenses.fromA = makeExpense({ id: 'fromA', updatedBy: 'dev-a', updatedAt: Date.now() })
    })
    b.edit(base.id, (t) => {
      t.expenses.fromB = makeExpense({ id: 'fromB', updatedBy: 'dev-b', updatedAt: Date.now() })
    })

    const both = (p: Phone) => !!p.trips.get(base.id)!.expenses.fromA && !!p.trips.get(base.id)!.expenses.fromB
    await waitFor('both phones to hold both expenses', () => both(a) && both(b))
  })

  it('goes quiet once the phones agree: no write loop against the real server', async () => {
    const base = freshTrip()
    const a = phone('a', base)
    const b = phone('b', base)
    a.engine.watch(base.id)
    b.engine.watch(base.id)
    a.edit(base.id, (t) => {
      t.expenses.x = makeExpense({ id: 'x', updatedBy: 'dev-a', updatedAt: Date.now() })
    })
    await waitFor('B to get x', () => !!b.trips.get(base.id)!.expenses.x)
    await sleep(800)

    const before = a.engine.stats().writes + b.engine.stats().writes
    await sleep(1500)
    const after = a.engine.stats().writes + b.engine.stats().writes
    expect(after).toBe(before)
    // One expense was added once; anything much above that is churn.
    expect(before).toBeLessThanOrEqual(2)
  })

  it('uploads a trip that existed on a phone before sync was switched on', async () => {
    const base = freshTrip()
    base.expenses.old = makeExpense({ id: 'old', updatedBy: 'dev-a', updatedAt: 1000 })
    const a = phone('a', base)
    a.engine.watch(base.id)

    // A second phone that only knows the bare trip (e.g. from an older share).
    const b = phone('b', freshTripWithId(base.id))
    b.engine.watch(base.id)
    await waitFor('B to receive the pre-existing expense', () => !!b.trips.get(base.id)!.expenses.old)
  })
})

function freshTripWithId(id: string): Trip {
  const t = makeTrip(id, [makeMember('m1', 'Asha'), makeMember('m2', 'Bilal')])
  return t
}
