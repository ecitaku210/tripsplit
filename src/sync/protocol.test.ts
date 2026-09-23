import { describe, expect, it } from 'vitest'
import { decidePull, decidePush, fingerprint, MAX_BLOB_CHARS, readRemote } from './protocol'
import { buildLedgerFile, encodeLedger } from '../domain/ledger'
import { makeExpense, makeMember, makeTrip, rng } from '../domain/testkit'
import type { Trip } from '../domain/types'

const clone = (t: Trip): Trip => JSON.parse(JSON.stringify(t))
const blobOf = (t: Trip, device = 'server') => encodeLedger(buildLedgerFile({ [t.id]: t }, device))

function baseTrip(): Trip {
  return makeTrip('trip-0001', [makeMember('m1', 'Asha'), makeMember('m2', 'Bilal'), makeMember('m3', 'Chen')])
}

/**
 * A fake Firestore document plus N phones, driven exactly the way the real
 * adapter drives the protocol: a push is a transaction (read, decide, maybe
 * write), and every write is delivered to every phone as a snapshot, which
 * each phone pulls and then re-checks for anything it still needs to push.
 *
 * `settle` runs until a full round produces no writes. If the protocol ever
 * looped — write, snapshot, write, snapshot — it would never settle, blow
 * through the round limit, and throw.
 */
function network(phones: Trip[]) {
  const server = { blob: null as string | null, writes: 0 }
  const local = phones.map(clone)

  function push(i: number) {
    const d = decidePush(local[i]!, server.blob, `dev${i}`)
    if (d.action === 'write') {
      server.blob = d.blob
      server.writes += 1
      local[i] = d.merged
      return true
    }
    return false
  }

  function deliver() {
    let wrote = false
    for (let i = 0; i < local.length; i += 1) {
      const p = decidePull(local[i]!, server.blob)
      if (p.action === 'adopt') local[i] = p.merged
      if (push(i)) wrote = true
    }
    return wrote
  }

  function settle(maxRounds = 50) {
    for (let round = 0; round < maxRounds; round += 1) {
      if (!deliver()) return round
    }
    throw new Error(`did not settle within ${maxRounds} rounds: the sync is looping`)
  }

  return { server, local, push, settle }
}

describe('fingerprint', () => {
  it('is identical for equal content held in a different key order', () => {
    const a = baseTrip()
    a.expenses.x = makeExpense({ id: 'x', paidBy: 'm1' })
    a.expenses.y = makeExpense({ id: 'y', paidBy: 'm2' })
    const b = clone(a)
    b.expenses = { y: b.expenses.y!, x: b.expenses.x! }
    expect(fingerprint(a)).toBe(fingerprint(b))
  })

  it('differs when only a record body differs under identical metadata', () => {
    // The exact case a metadata-only fingerprint misses: same id, same
    // updatedAt, same updatedBy, different content. If this compared equal,
    // two phones could hold different versions and never sync.
    const a = baseTrip()
    a.expenses.x = makeExpense({ id: 'x', description: 'Dinner', updatedAt: 5, updatedBy: 'dev0' })
    const b = clone(a)
    b.expenses.x!.description = 'Lunch'
    expect(fingerprint(a)).not.toBe(fingerprint(b))
  })
})

describe('decidePush', () => {
  it('writes when the server is empty', () => {
    expect(decidePush(baseTrip(), null, 'dev0').action).toBe('write')
  })

  it('skips when the server already holds exactly this content', () => {
    const t = baseTrip()
    expect(decidePush(t, blobOf(t), 'dev0')).toEqual({ action: 'skip', reason: 'identical' })
  })

  it('merges the server copy in before writing, so nothing on it is lost', () => {
    const mine = baseTrip()
    mine.expenses.mine = makeExpense({ id: 'mine', updatedBy: 'dev0' })
    const theirs = baseTrip()
    theirs.expenses.theirs = makeExpense({ id: 'theirs', updatedBy: 'dev1' })

    const d = decidePush(mine, blobOf(theirs), 'dev0')
    expect(d.action).toBe('write')
    if (d.action !== 'write') return
    expect(Object.keys(d.merged.expenses).sort()).toEqual(['mine', 'theirs'])
    expect(Object.keys(readRemote(d.blob, 'trip-0001')!.expenses).sort()).toEqual(['mine', 'theirs'])
  })

  it('replaces an unreadable server document instead of choking on it', () => {
    const d = decidePush(baseTrip(), 'not a ledger', 'dev0')
    expect(d.action).toBe('write')
  })

  it('refuses a ledger too large for one Firestore document', () => {
    const t = baseTrip()
    const rand = rng(1)
    // Random descriptions defeat gzip, which is what makes this big.
    for (let i = 0; i < 4000; i += 1) {
      const junk = Array.from({ length: 180 }, () => String.fromCharCode(33 + Math.floor(rand() * 90))).join('')
      t.expenses[`e${i}`] = makeExpense({ id: `e${i}`, description: junk.slice(0, 200) })
    }
    const d = decidePush(t, null, 'dev0')
    expect(d).toMatchObject({ action: 'refuse', reason: 'too-large' })
    if (d.action === 'refuse' && d.reason === 'too-large') {
      expect(d.chars).toBeGreaterThan(MAX_BLOB_CHARS)
    }
  })
})

describe('decidePull', () => {
  it('ignores its own write coming back, which is what stops the loop', () => {
    const t = baseTrip()
    expect(decidePull(t, blobOf(t))).toEqual({ action: 'ignore', reason: 'identical' })
  })

  it('adopts a remote expense this phone has not seen', () => {
    const local = baseTrip()
    const remote = baseTrip()
    remote.expenses.new = makeExpense({ id: 'new' })
    const p = decidePull(local, blobOf(remote))
    expect(p.action).toBe('adopt')
    if (p.action === 'adopt') expect(p.merged.expenses.new).toBeDefined()
  })

  it('ignores garbage and a ledger for some other trip', () => {
    expect(decidePull(baseTrip(), 'garbage').action).toBe('ignore')
    expect(decidePull(baseTrip(), blobOf(makeTrip('someOtherTrip'))).action).toBe('ignore')
  })
})

describe('sync between phones, end to end over a fake server', () => {
  it('converges three phones that each logged different expenses', () => {
    const phones = [0, 1, 2].map((i) => {
      const t = baseTrip()
      t.expenses[`e${i}`] = makeExpense({ id: `e${i}`, updatedBy: `dev${i}` })
      return t
    })
    const net = network(phones)
    net.settle()

    const server = readRemote(net.server.blob, 'trip-0001')!
    expect(Object.keys(server.expenses).sort()).toEqual(['e0', 'e1', 'e2'])
    for (const p of net.local) expect(fingerprint(p)).toBe(fingerprint(server))
  })

  it('stops writing once everyone agrees: no billing loop', () => {
    const phones = [0, 1, 2, 3, 4].map((i) => {
      const t = baseTrip()
      t.expenses[`e${i}`] = makeExpense({ id: `e${i}`, updatedBy: `dev${i}` })
      return t
    })
    const net = network(phones)
    net.settle()
    const writesWhenSettled = net.server.writes

    // Deliver snapshots many more times. A looping protocol would keep writing.
    for (let i = 0; i < 20; i += 1) net.settle()
    expect(net.server.writes).toBe(writesWhenSettled)
    // Each phone had one thing to contribute, so at most one write each.
    expect(writesWhenSettled).toBeLessThanOrEqual(phones.length)
  })

  it('converges on randomised edits, deletes and repayments across many rounds', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const rand = rng(seed)
      const net = network([baseTrip(), baseTrip(), baseTrip(), baseTrip()])
      let clock = 10_000
      for (let step = 0; step < 30; step += 1) {
        const i = Math.floor(rand() * 4)
        const phone = net.local[i]!
        const roll = rand()
        clock += 1 + Math.floor(rand() * 3)
        const ids = Object.keys(phone.expenses)
        if (roll < 0.6 || ids.length === 0) {
          const id = `s${seed}-${step}`
          phone.expenses[id] = makeExpense({ id, amountMinor: 1 + Math.floor(rand() * 9999), updatedAt: clock, updatedBy: `dev${i}` })
        } else if (roll < 0.8) {
          const id = ids[Math.floor(rand() * ids.length)]!
          phone.expenses[id] = { ...phone.expenses[id]!, description: `edit ${step}`, updatedAt: clock, updatedBy: `dev${i}` }
        } else {
          const id = ids[Math.floor(rand() * ids.length)]!
          phone.expenses[id] = { ...phone.expenses[id]!, deletedAt: clock, updatedAt: clock, updatedBy: `dev${i}` }
        }
        // Phones sync unevenly: sometimes a push goes out, sometimes it waits.
        if (rand() < 0.5) net.push(i)
      }
      net.settle()
      const server = fingerprint(readRemote(net.server.blob, 'trip-0001')!)
      for (const p of net.local) expect(fingerprint(p)).toBe(server)
    }
  })

  it('heals after someone overwrites the server with a stripped ledger', () => {
    // Anyone holding the trip id can overwrite the document. Because every
    // honest phone keeps its full copy and merging is a union, the missing
    // records come straight back the next time any honest phone syncs.
    const full = baseTrip()
    for (const id of ['a', 'b', 'c']) full.expenses[id] = makeExpense({ id, updatedBy: 'dev0' })
    const net = network([full, baseTrip()])
    net.settle()

    net.server.blob = blobOf(baseTrip(), 'intruder') // every expense gone
    net.settle()

    const server = readRemote(net.server.blob, 'trip-0001')!
    expect(Object.keys(server.expenses).sort()).toEqual(['a', 'b', 'c'])
  })

  it('resolves two versions of one record that share identical metadata', () => {
    // Regression for the metadata-only fingerprint: both phones must end up
    // holding the same winner rather than each keeping its own forever.
    const a = baseTrip()
    a.expenses.x = makeExpense({ id: 'x', description: 'Dinner', updatedAt: 7, updatedBy: 'dev0' })
    const b = clone(a)
    b.expenses.x!.description = 'Lunch'
    const net = network([a, b])
    net.settle()
    expect(net.local[0]!.expenses.x!.description).toBe(net.local[1]!.expenses.x!.description)
  })
})

describe('records other phones would reject (audit bug A)', () => {
  // A cleared date picker used to save date "". The decoder rejects that, so
  // the phone holding it could never match the server and wrote forever.
  function withDatelessExpense(): Trip {
    const t = baseTrip()
    t.expenses.bad = makeExpense({ id: 'bad', date: '', paidBy: 'm1', updatedBy: 'dev0' })
    t.expenses.good = makeExpense({ id: 'good', paidBy: 'm2', updatedBy: 'dev0' })
    return t
  }

  it('settles instead of writing forever', () => {
    const net = network([withDatelessExpense(), baseTrip()])
    expect(net.settle()).toBeLessThan(5)
    const writes = net.server.writes
    for (let i = 0; i < 20; i += 1) net.settle()
    expect(net.server.writes).toBe(writes)
    expect(writes).toBeLessThanOrEqual(2)
  })

  it('still delivers the valid records, and never deletes the bad one from its phone', () => {
    const net = network([withDatelessExpense(), baseTrip()])
    net.settle()
    expect(Object.keys(net.local[1]!.expenses)).toEqual(['good'])
    expect(Object.keys(net.local[0]!.expenses).sort()).toEqual(['bad', 'good'])
  })

  it('settles when text is longer than other phones keep, whichever version wins', () => {
    // Over-long text is cut on import. Depending on the characters, the full
    // version can win the merge tie — which used to mean a write loop.
    for (const tail of ['~~~', '   ', 'zzz', '!!!']) {
      const t = baseTrip()
      t.expenses.x = makeExpense({ id: 'x', description: 'a'.repeat(200) + tail, updatedBy: 'dev0' })
      const net = network([t, baseTrip()])
      expect(net.settle()).toBeLessThan(5)
    }
  })
})

describe('a server copy from a newer app version (audit bug F)', () => {
  const newer = (t: Trip) => encodeLedger({ ...buildLedgerFile({ [t.id]: t }, 'future'), schema: 99 })

  it('is never overwritten by this older version', () => {
    expect(decidePush(baseTrip(), newer(baseTrip()), 'dev0')).toEqual({
      action: 'refuse',
      reason: 'newer-version',
    })
  })

  it('is not adopted either, and says why', () => {
    expect(decidePull(baseTrip(), newer(baseTrip()))).toEqual({
      action: 'ignore',
      reason: 'newer-version',
    })
  })

  it('CONTROL: garbage on the server is still replaced, so a bad copy heals', () => {
    expect(decidePush(baseTrip(), 'not a ledger', 'dev0').action).toBe('write')
  })
})

describe('an encrypted server copy this phone cannot open', () => {
  // The adapter opens ciphertext before calling the protocol. Whatever is
  // still sealed when it gets here means "no key, or the wrong one".
  async function sealedBlob(t: Trip) {
    const { newTripKey, seal } = await import('./crypto')
    return seal(blobOf(t), newTripKey(), t.id)
  }

  it('is never overwritten: a plaintext write would expose the whole group', async () => {
    const t = baseTrip()
    const mine = clone(t)
    mine.expenses.x = makeExpense({ id: 'x', updatedBy: 'dev0', updatedAt: 5 })
    const d = decidePush(mine, await sealedBlob(t), 'dev0')
    expect(d).toEqual({ action: 'refuse', reason: 'locked' })
  })

  it('is not adopted either, and says why', async () => {
    const t = baseTrip()
    const p = decidePull(clone(t), await sealedBlob(t))
    expect(p).toEqual({ action: 'ignore', reason: 'locked' })
  })

  it('CONTROL: once opened with the key, the same document syncs normally', async () => {
    const { newTripKey, seal, open } = await import('./crypto')
    const t = baseTrip()
    const key = newTripKey()
    const sealed = await seal(blobOf(t), key, t.id)
    const opened = await open(sealed, key, t.id)
    const mine = clone(t)
    mine.expenses.x = makeExpense({ id: 'x', updatedBy: 'dev0', updatedAt: 5 })
    expect(decidePush(mine, opened, 'dev0').action).toBe('write')
  })
})

describe('rewrite: replacing a plaintext server copy after a key is turned on', () => {
  it('writes identical content when asked to, and skips it otherwise', () => {
    const t = baseTrip()
    const blob = blobOf(t)
    expect(decidePush(clone(t), blob, 'dev0').action).toBe('skip')
    const d = decidePush(clone(t), blob, 'dev0', { rewrite: true })
    expect(d.action).toBe('write')
    // Still merges the server copy in, so nothing is lost by the rewrite.
    expect(d.action === 'write' && fingerprint(d.merged)).toBe(fingerprint(t))
  })

  it('never rewrites over a newer version or a sealed copy', async () => {
    const { newTripKey, seal } = await import('./crypto')
    const t = baseTrip()
    const sealed = await seal(blobOf(t), newTripKey(), t.id)
    expect(decidePush(clone(t), sealed, 'dev0', { rewrite: true }).action).toBe('refuse')
  })
})
