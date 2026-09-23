import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { createSync, type SyncEngine, type SyncStatus } from '../../src/sync/engine'
import { isSealed, newTripKey } from '../../src/sync/crypto'
import { decodeLedger } from '../../src/domain/ledger'
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
  /** Encryption keys this phone holds, tripId -> key. Mutable, like an import. */
  keys: Map<string, string>
  engine: SyncEngine
  statuses: SyncStatus[]
  edit: (tripId: string, fn: (t: Trip) => void) => void
}

const phones: Phone[] = []
afterEach(async () => {
  await Promise.all(phones.splice(0).map((p) => p.engine.close()))
})

function phone(name: string, start: Trip, key: string | null = null): Phone {
  const trips = new Map<string, Trip>([[start.id, structuredClone(start)]])
  const keys = new Map<string, string>(key ? [[start.id, key]] : [])
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
      key: (id) => keys.get(id) ?? null,
    },
    onStatus: (_id, s) => statuses.push(s),
  })
  const p: Phone = {
    name,
    trips,
    keys,
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

async function waitFor(what: string, cond: () => boolean | Promise<boolean>, ms = 10_000) {
  const start = Date.now()
  while (!(await cond())) {
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

describe('recovering by itself (audit bugs A and C)', () => {
  /** Swap the emulator's security rules in place, as the rules test kit does. */
  async function setRules(content: string) {
    const r = await fetch(
      `http://${EMU.host}:${EMU.firestorePort}/emulator/v1/projects/${CONFIG.projectId}:securityRules`,
      { method: 'PUT', body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content }] } }) },
    )
    if (!r.ok) throw new Error(`could not load rules: ${r.status}`)
  }
  const realRules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8')
  const denyAll = "rules_version = '2';\nservice cloud.firestore { match /databases/{db}/documents { match /{d=**} { allow read, write: if false; } } }"
  const readOnly = "rules_version = '2';\nservice cloud.firestore { match /databases/{db}/documents { match /{d=**} { allow read: if request.auth != null; allow write: if false; } } }"
  afterEach(() => setRules(realRules))

  it('retries a failed upload by itself, with no further edits', async () => {
    const base = freshTrip()
    const a = phone('a', base)
    const b = phone('b', base)
    a.engine.watch(base.id)
    b.engine.watch(base.id)
    await waitFor('both connected', () => a.statuses.includes('live') && b.statuses.includes('live'))

    // Writes fail, reads still work: the listeners stay healthy, so nothing
    // arrives to prompt a retry. Only the retry itself can deliver this.
    await setRules(readOnly)
    a.edit(base.id, (t) => {
      t.expenses.late = makeExpense({ id: 'late', updatedBy: 'dev-a', updatedAt: Date.now() })
    })
    await waitFor('A to report the failure', () => a.statuses.at(-1) === 'error')
    await sleep(500)
    expect(b.trips.get(base.id)!.expenses.late).toBeUndefined()

    // The server recovers. Nobody touches either phone again.
    await setRules(realRules)
    await waitFor('B to receive it without any further edit', () => !!b.trips.get(base.id)!.expenses.late, 20_000)
  }, 40_000)

  it('re-attaches a listener the server ended, so later expenses still arrive', async () => {
    const base = freshTrip()
    const a = phone('a', base)
    a.engine.watch(base.id)
    await waitFor('A connected', () => a.statuses.includes('live'))

    // Changing the rules does not end a listener that is already running, so
    // B starts listening while the server refuses. Its listener is ended for
    // good by Firestore, and only re-attaching it can bring B back.
    await setRules(denyAll)
    const b = phone('b', base)
    b.engine.watch(base.id)
    await waitFor("B's listener to be refused", () => b.statuses.at(-1) === 'error')
    await setRules(realRules)

    a.edit(base.id, (t) => {
      t.expenses.after = makeExpense({ id: 'after', updatedBy: 'dev-a', updatedAt: Date.now() })
    })
    await waitFor('B to receive a later expense', () => !!b.trips.get(base.id)!.expenses.after, 20_000)
  }, 40_000)

  it('does not loop on an expense other phones reject, and still delivers the rest', async () => {
    const base = freshTrip()
    const a = phone('a', base)
    const b = phone('b', base)
    a.engine.watch(base.id)
    b.engine.watch(base.id)
    a.edit(base.id, (t) => {
      t.expenses.dateless = makeExpense({ id: 'dateless', date: '', updatedBy: 'dev-a', updatedAt: Date.now() })
      t.expenses.fine = makeExpense({ id: 'fine', updatedBy: 'dev-a', updatedAt: Date.now() })
    })
    await waitFor('B to get the valid expense', () => !!b.trips.get(base.id)!.expenses.fine)
    await sleep(800)
    const before = a.engine.stats().writes
    await sleep(2000)
    expect(a.engine.stats().writes).toBe(before)
    expect(before).toBeLessThanOrEqual(2)
    expect(b.trips.get(base.id)!.expenses.dateless).toBeUndefined()
  })
})

function freshTripWithId(id: string): Trip {
  const t = makeTrip(id, [makeMember('m1', 'Asha'), makeMember('m2', 'Bilal')])
  return t
}

/** The raw document as the server holds it, read with owner rights. */
async function serverBlob(tripId: string): Promise<string | null> {
  const res = await fetch(
    `http://${EMU.host}:${EMU.firestorePort}/v1/projects/${CONFIG.projectId}/databases/(default)/documents/trips/${tripId}`,
    { headers: { Authorization: 'Bearer owner' } },
  )
  if (res.status === 404) return null
  const body = (await res.json()) as { fields?: { ledger?: { stringValue?: string } } }
  return body.fields?.ledger?.stringValue ?? null
}

describe('end-to-end encryption through the emulator', () => {
  it('two phones with the key sync, and the server holds only ciphertext', async () => {
    const base = freshTrip()
    const key = newTripKey()
    const a = phone('a', base, key)
    const b = phone('b', base, key)
    a.engine.watch(base.id)
    b.engine.watch(base.id)

    a.edit(base.id, (t) => {
      t.expenses.dinner = makeExpense({ id: 'dinner', amountMinor: 4200, paidBy: 'm1', updatedBy: 'dev-a', updatedAt: Date.now() })
    })
    await waitFor('B to receive the dinner', () => !!b.trips.get(base.id)!.expenses.dinner)

    const raw = await serverBlob(base.id)
    expect(raw).not.toBeNull()
    expect(isSealed(raw)).toBe(true)
    // Nothing legible: the document decodes as a sealed envelope, not a trip.
    const d = decodeLedger(raw!)
    expect(!d.ok && d.reason).toBe('sealed')
    expect(raw).not.toContain('dinner')
  })

  it('a phone without the key shows Locked and never writes', async () => {
    const base = freshTrip()
    const key = newTripKey()
    const a = phone('a', base, key)
    a.engine.watch(base.id)
    a.edit(base.id, (t) => {
      t.expenses.dinner = makeExpense({ id: 'dinner', updatedBy: 'dev-a', updatedAt: Date.now() })
    })
    await waitFor('A live', () => a.statuses.includes('live') && a.engine.stats().writes >= 1)
    const before = await serverBlob(base.id)

    const c = phone('c', base, null)
    c.engine.watch(base.id)
    c.edit(base.id, (t) => {
      t.expenses.mine = makeExpense({ id: 'mine', updatedBy: 'dev-c', updatedAt: Date.now() })
    })
    await waitFor('C to report Locked', () => c.statuses.includes('locked'))
    await sleep(600)
    expect(c.engine.stats().writes).toBe(0)
    expect(await serverBlob(base.id)).toBe(before)
    expect(c.trips.get(base.id)!.expenses.dinner).toBeUndefined()
  })

  it('a phone with the WRONG key is locked too, and never writes', async () => {
    const base = freshTrip()
    const a = phone('a', base, newTripKey())
    a.engine.watch(base.id)
    await waitFor('A live', () => a.statuses.includes('live') && a.engine.stats().writes >= 1)
    const before = await serverBlob(base.id)

    const w = phone('w', base, newTripKey())
    w.engine.watch(base.id)
    w.edit(base.id, (t) => {
      t.expenses.mine = makeExpense({ id: 'mine', updatedBy: 'dev-w', updatedAt: Date.now() })
    })
    await waitFor('W to report Locked', () => w.statuses.includes('locked'))
    await sleep(600)
    expect(w.engine.stats().writes).toBe(0)
    expect(await serverBlob(base.id)).toBe(before)
  })

  it('importing the code (the key) unlocks a locked phone and its edits go up', async () => {
    const base = freshTrip()
    const key = newTripKey()
    const a = phone('a', base, key)
    a.engine.watch(base.id)
    a.edit(base.id, (t) => {
      t.expenses.dinner = makeExpense({ id: 'dinner', updatedBy: 'dev-a', updatedAt: Date.now() })
    })
    await waitFor('A live', () => a.statuses.includes('live') && a.engine.stats().writes >= 1)

    const c = phone('c', base, null)
    c.engine.watch(base.id)
    c.edit(base.id, (t) => {
      t.expenses.mine = makeExpense({ id: 'mine', updatedBy: 'dev-c', updatedAt: Date.now() })
    })
    await waitFor('C locked', () => c.statuses.includes('locked'))

    // The person imports the latest code, which carries the key.
    c.keys.set(base.id, key)
    c.engine.changed(base.id)
    await waitFor('C to receive dinner', () => !!c.trips.get(base.id)!.expenses.dinner)
    await waitFor('A to receive C’s expense', () => !!a.trips.get(base.id)!.expenses.mine)
    expect(isSealed(await serverBlob(base.id))).toBe(true)
  })

  it('turning encryption on replaces a plaintext server copy with ciphertext, keeping every record', async () => {
    const base = freshTrip()
    const a = phone('a', base, null)
    const b = phone('b', base, null)
    a.engine.watch(base.id)
    b.engine.watch(base.id)
    b.edit(base.id, (t) => {
      t.expenses.fromB = makeExpense({ id: 'fromB', updatedBy: 'dev-b', updatedAt: Date.now() })
    })
    await waitFor('A has B’s expense', () => !!a.trips.get(base.id)!.expenses.fromB)
    expect(isSealed(await serverBlob(base.id))).toBe(false)

    // A turns encryption on. No edit, just the key.
    const key = newTripKey()
    a.keys.set(base.id, key)
    a.engine.changed(base.id)
    await waitFor('server copy to be sealed', async () => isSealed(await serverBlob(base.id)))
    await waitFor('B to see Locked', () => b.statuses.includes('locked'))

    // B gets the code and is back in step, with nothing lost on either side.
    b.keys.set(base.id, key)
    b.engine.changed(base.id)
    a.edit(base.id, (t) => {
      t.expenses.after = makeExpense({ id: 'after', updatedBy: 'dev-a', updatedAt: Date.now() })
    })
    await waitFor('B to receive the post-encryption expense', () => !!b.trips.get(base.id)!.expenses.after)
    expect(Object.keys(b.trips.get(base.id)!.expenses).sort()).toEqual(['after', 'fromB'])
  })

  it('goes quiet once encrypted phones agree: no write loop', async () => {
    const base = freshTrip()
    const key = newTripKey()
    const a = phone('a', base, key)
    const b = phone('b', base, key)
    a.engine.watch(base.id)
    b.engine.watch(base.id)
    a.edit(base.id, (t) => {
      t.expenses.x = makeExpense({ id: 'x', updatedBy: 'dev-a', updatedAt: Date.now() })
    })
    await waitFor('B to get x', () => !!b.trips.get(base.id)!.expenses.x)
    const writes = () => a.engine.stats().writes + b.engine.stats().writes
    const settled = writes()
    await sleep(1500)
    expect(writes()).toBe(settled)
  })
})
