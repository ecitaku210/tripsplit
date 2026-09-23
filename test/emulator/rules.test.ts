import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore'

/**
 * The security rules, exercised against Google's own Firestore emulator.
 *
 * These matter more than any other test in the project. The Firebase config
 * ships inside the public JavaScript bundle, so the rules are the only barrier
 * between the database and anyone on the internet. Each "fails" case below is
 * an attack the rules must refuse.
 */

const TRIP = 'c0ffee00-1111-4222-8333-444455556666'
let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-tripsplit',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(() => env.cleanup())
beforeEach(() => env.clearFirestore())

const valid = (uid: string) => ({ ledger: 'H4sIAAAA-blob', updatedAt: serverTimestamp(), updatedBy: uid })
const as = (uid: string) => env.authenticatedContext(uid).firestore()
const anon = () => env.unauthenticatedContext().firestore()

async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'trips', TRIP), { ledger: 'seed', updatedAt: Timestamp.now(), updatedBy: 'x' })
  })
}

describe('reading', () => {
  it('lets a signed-in phone read a trip it knows the id of', async () => {
    await seed()
    await assertSucceeds(getDoc(doc(as('alice'), 'trips', TRIP)))
  })

  it('refuses a read with no sign-in at all', async () => {
    await seed()
    await assertFails(getDoc(doc(anon(), 'trips', TRIP)))
  })

  it('refuses listing trips, so nobody can discover ids they were not given', async () => {
    await seed()
    await assertFails(getDocs(collection(as('alice'), 'trips')))
  })
})

describe('writing', () => {
  it('accepts a well-formed write stamped by the server clock', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'trips', TRIP), valid('alice')))
  })

  it('accepts a second phone updating the same trip', async () => {
    await seed()
    await assertSucceeds(setDoc(doc(as('bilal'), 'trips', TRIP), valid('bilal')))
  })

  it('refuses a write with no sign-in', async () => {
    await assertFails(setDoc(doc(anon(), 'trips', TRIP), valid('alice')))
  })

  it('refuses a write that claims to be from somebody else', async () => {
    await assertFails(setDoc(doc(as('mallory'), 'trips', TRIP), valid('alice')))
  })

  it('refuses a client-supplied timestamp', async () => {
    const forged = { ...valid('alice'), updatedAt: Timestamp.fromMillis(Date.now() + 86_400_000) }
    await assertFails(setDoc(doc(as('alice'), 'trips', TRIP), forged))
  })

  it('refuses extra fields smuggled into the document', async () => {
    await assertFails(setDoc(doc(as('alice'), 'trips', TRIP), { ...valid('alice'), admin: true }))
  })

  it('refuses a document missing its ledger', async () => {
    const { ledger: _dropped, ...noLedger } = valid('alice')
    await assertFails(setDoc(doc(as('alice'), 'trips', TRIP), noLedger))
  })

  it('refuses a ledger that is not a string', async () => {
    await assertFails(setDoc(doc(as('alice'), 'trips', TRIP), { ...valid('alice'), ledger: 42 }))
  })

  it('refuses an empty ledger', async () => {
    await assertFails(setDoc(doc(as('alice'), 'trips', TRIP), { ...valid('alice'), ledger: '' }))
  })

  it('refuses a ledger over the size ceiling', async () => {
    const huge = 'x'.repeat(700_001)
    await assertFails(setDoc(doc(as('alice'), 'trips', TRIP), { ...valid('alice'), ledger: huge }))
  })

  it('refuses a malformed trip id', async () => {
    await assertFails(setDoc(doc(as('alice'), 'trips', 'bad id with spaces'), valid('alice')))
  })
})

describe('everything else', () => {
  it('refuses deleting a trip, so nobody can wipe it for the whole group', async () => {
    await seed()
    await assertFails(deleteDoc(doc(as('alice'), 'trips', TRIP)))
  })

  it('refuses writing anywhere outside the trips collection', async () => {
    await assertFails(setDoc(doc(as('alice'), 'users', 'alice'), { hello: 'world' }))
    await assertFails(setDoc(doc(as('alice'), 'trips', TRIP, 'sub', 'x'), { hello: 'world' }))
  })
})
