import type { Id } from '../domain/types'
import {
  decodeLedger,
  encodeSealed,
  fromBase64Url,
  isTripKey,
  toBase64Url,
  type Sealed,
} from '../domain/ledger'

/**
 * End-to-end encryption of a trip.
 *
 * THE MODEL. Each trip has one random 256-bit key. It lives on the phones and
 * travels inside the share code, never to Firebase. What the server stores
 * is AES-256-GCM ciphertext of the gzipped ledger, so Google, or anyone who
 * gets hold of the database, holds nothing readable. Sharing is unchanged
 * for the people on the trip: the code was already the password, and now it
 * carries the key too.
 *
 * GCM gives confidentiality AND integrity: a flipped bit anywhere fails to
 * decrypt rather than yielding a slightly different ledger. The trip id is
 * bound in as associated data, so a ciphertext copied from one trip's
 * document into another's is refused as well.
 *
 * WHAT IT DOES NOT DO. Anyone holding the code can still read and edit the
 * trip, exactly as before. And the Firestore rules, not the encryption,
 * still decide who may write: a person with the trip id but no key can
 * overwrite the document with junk, and the group would see "Locked" until
 * a phone that holds the key writes a good copy again. The rules cap what
 * that junk can be; the tombstone ledger heals the rest.
 */

const KEY_BYTES = 32
const IV_BYTES = 12
const ALG = 'AES-GCM'

const subtle = (): SubtleCrypto => {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('This browser has no WebCrypto; encryption is not available here.')
  }
  return crypto.subtle
}

/** A fresh key for a new trip. */
export function newTripKey(): string {
  const bytes = new Uint8Array(KEY_BYTES)
  crypto.getRandomValues(bytes)
  return toBase64Url(bytes)
}

const keyCache = new Map<string, Promise<CryptoKey>>()
function cryptoKey(key: string): Promise<CryptoKey> {
  let k = keyCache.get(key)
  if (!k) {
    k = subtle().importKey('raw', bytes(key), { name: ALG }, false, ['encrypt', 'decrypt'])
    keyCache.set(key, k)
  }
  return k
}

const aad = (tripId: Id) => new TextEncoder().encode(`tripsplit:${tripId}`)

/** WebCrypto wants a view over a plain ArrayBuffer; `slice` guarantees one. */
const bytes = (text: string): Uint8Array<ArrayBuffer> => fromBase64Url(text).slice()

/**
 * Encrypt a plaintext ledger code (what `encodeLedger` returns) for the
 * server. The result decodes, on any app version, as a schema-2 envelope.
 */
export async function seal(plainCode: string, key: string, tripId: Id): Promise<string> {
  if (!isTripKey(key)) throw new Error('Malformed trip key.')
  const iv = new Uint8Array(IV_BYTES)
  crypto.getRandomValues(iv)
  const ct = await subtle().encrypt(
    { name: ALG, iv, additionalData: aad(tripId) },
    await cryptoKey(key),
    bytes(plainCode),
  )
  const sealed: Sealed = { v: 1, iv: toBase64Url(iv), ct: toBase64Url(new Uint8Array(ct)) }
  return encodeSealed(sealed)
}

/** Is this server document ciphertext (whether or not we can open it)? */
export function isSealed(blob: string | null | undefined): boolean {
  if (typeof blob !== 'string' || blob === '') return false
  const d = decodeLedger(blob)
  return !d.ok && d.reason === 'sealed'
}

/**
 * Turn what the server holds into what the protocol reads.
 *
 * Plaintext (a trip from before encryption) passes through unchanged. A
 * sealed envelope is decrypted when the key fits. Otherwise the envelope is
 * returned AS IS: the protocol recognises it and refuses to overwrite it,
 * which is the one outcome that must never happen — a phone without the
 * key clobbering the group's encrypted ledger with its own plaintext.
 */
export async function open(
  blob: string | null | undefined,
  key: string | null,
  tripId: Id,
): Promise<string | null> {
  if (typeof blob !== 'string' || blob === '') return null
  const d = decodeLedger(blob)
  if (d.ok || d.reason !== 'sealed' || !d.sealed) return blob
  if (!key || !isTripKey(key)) return blob
  try {
    const plain = await subtle().decrypt(
      { name: ALG, iv: bytes(d.sealed.iv), additionalData: aad(tripId) },
      await cryptoKey(key),
      bytes(d.sealed.ct),
    )
    return toBase64Url(new Uint8Array(plain))
  } catch {
    // Wrong key, or tampered: leave the envelope sealed.
    return blob
  }
}
