import { describe, expect, it } from 'vitest'
import { isSealed, newTripKey, open, seal } from './crypto'
import {
  buildLedgerFile,
  decodeLedger,
  encodeLedger,
  fromBase64Url,
  isTripKey,
  parseLedger,
} from '../domain/ledger'
import { SCHEMA_VERSION, SEALED_SCHEMA } from '../domain/types'
import { makeExpense, makeMember, makeTrip } from '../domain/testkit'
import { gunzipSync, strFromU8 } from 'fflate'

function trip() {
  const t = makeTrip('trip-0001', [makeMember('m1', 'Asha'), makeMember('m2', 'Bilal')])
  t.expenses.dinner = makeExpense({ id: 'dinner', amountMinor: 4200, paidBy: 'm1' })
  return t
}
// Built once: a ledger file carries exportedAt, so two builds differ.
const PLAIN = encodeLedger(buildLedgerFile({ 'trip-0001': trip() }, 'dev'))
const plain = () => PLAIN

describe('trip keys', () => {
  it('are 32 random bytes as 43 base64url characters', () => {
    const k = newTripKey()
    expect(isTripKey(k)).toBe(true)
    expect(fromBase64Url(k).length).toBe(32)
    expect(newTripKey()).not.toBe(k)
  })

  it('rejects anything else as a key', () => {
    expect(isTripKey('')).toBe(false)
    expect(isTripKey('short')).toBe(false)
    expect(isTripKey(newTripKey() + 'x')).toBe(false)
    expect(isTripKey(newTripKey().replace(/./, '+'))).toBe(false)
    expect(isTripKey(42)).toBe(false)
  })
})

describe('seal and open', () => {
  it('round-trips a ledger code, and the opened code decodes to the same trip', async () => {
    const key = newTripKey()
    const sealed = await seal(plain(), key, 'trip-0001')
    expect(sealed).not.toBe(plain())
    const opened = await open(sealed, key, 'trip-0001')
    expect(opened).toBe(plain())
    const decoded = decodeLedger(opened!)
    expect(decoded.ok && decoded.file.trips['trip-0001']!.expenses.dinner!.amountMinor).toBe(4200)
  })

  it('produces different ciphertext each time (fresh IV), all opening to the same code', async () => {
    const key = newTripKey()
    const a = await seal(plain(), key, 'trip-0001')
    const b = await seal(plain(), key, 'trip-0001')
    expect(a).not.toBe(b)
    expect(await open(a, key, 'trip-0001')).toBe(await open(b, key, 'trip-0001'))
  })

  it('stays sealed under the wrong key', async () => {
    const sealed = await seal(plain(), newTripKey(), 'trip-0001')
    const opened = await open(sealed, newTripKey(), 'trip-0001')
    expect(opened).toBe(sealed)
    expect(isSealed(opened)).toBe(true)
  })

  it('stays sealed with no key at all', async () => {
    const sealed = await seal(plain(), newTripKey(), 'trip-0001')
    expect(await open(sealed, null, 'trip-0001')).toBe(sealed)
  })

  it('refuses a ciphertext moved to another trip (associated data)', async () => {
    const key = newTripKey()
    const sealed = await seal(plain(), key, 'trip-0001')
    expect(await open(sealed, key, 'trip-0002')).toBe(sealed)
  })

  it('refuses tampered ciphertext instead of yielding a different ledger', async () => {
    const key = newTripKey()
    const sealed = await seal(plain(), key, 'trip-0001')
    // Flip one character deep inside the envelope's payload.
    const env = JSON.parse(strFromU8(gunzipSync(fromBase64Url(sealed)))) as {
      sealed: { ct: string }
    }
    const ct = env.sealed.ct
    const mid = Math.floor(ct.length / 2)
    env.sealed.ct = ct.slice(0, mid) + (ct[mid] === 'A' ? 'B' : 'A') + ct.slice(mid + 1)
    const { gzipSync, strToU8 } = await import('fflate')
    const { toBase64Url } = await import('../domain/ledger')
    const tampered = toBase64Url(gzipSync(strToU8(JSON.stringify(env))))
    expect(await open(tampered, key, 'trip-0001')).toBe(tampered)
    expect(isSealed(tampered)).toBe(true)
  })

  it('passes plaintext and empty documents through untouched', async () => {
    expect(await open(plain(), newTripKey(), 'trip-0001')).toBe(plain())
    expect(await open(null, newTripKey(), 'trip-0001')).toBeNull()
    expect(await open('', newTripKey(), 'trip-0001')).toBeNull()
    expect(isSealed(plain())).toBe(false)
    expect(isSealed(null)).toBe(false)
  })

  it('does not leak the ledger into the envelope', async () => {
    const sealed = await seal(plain(), newTripKey(), 'trip-0001')
    const json = strFromU8(gunzipSync(fromBase64Url(sealed)))
    expect(json).not.toContain('Asha')
    expect(json).not.toContain('dinner')
    expect(json).not.toContain('4200')
  })
})

describe('the envelope as older apps see it', () => {
  it('decodes as a sealed ledger for this app', async () => {
    const sealed = await seal(plain(), newTripKey(), 'trip-0001')
    const d = decodeLedger(sealed)
    expect(d.ok).toBe(false)
    expect(!d.ok && d.reason).toBe('sealed')
  })

  it('claims a schema above this app’s, so a pre-encryption app stands down as "newer version"', async () => {
    const sealed = await seal(plain(), newTripKey(), 'trip-0001')
    const env = JSON.parse(strFromU8(gunzipSync(fromBase64Url(sealed)))) as Record<string, unknown>
    expect(env.schema).toBe(SEALED_SCHEMA)
    expect(SEALED_SCHEMA).toBeGreaterThan(SCHEMA_VERSION)
    // An app from before encryption does not know the `sealed` field. Its
    // parser reaches the version check and refuses, exactly as bug F's fix
    // intended: refusing is what stops it overwriting ciphertext with
    // plaintext. Modelled here by hiding the field from the parser.
    const { sealed: _hidden, ...asOldAppSeesIt } = env
    const d = parseLedger(asOldAppSeesIt)
    expect(!d.ok && d.reason).toBe('newer-version')
  })
})
