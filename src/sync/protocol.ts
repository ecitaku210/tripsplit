import type { Id, Trip } from '../domain/types'
import { mergeTrip } from '../domain/merge'
import { buildLedgerFile, decodeLedger, encodeLedger, normaliseTrip } from '../domain/ledger'

/**
 * The sync decision, with no Firebase anywhere in it.
 *
 * Everything that could be wrong about syncing lives in this file, and none
 * of it needs a network to test. The Firestore adapter beside it only moves
 * bytes; it makes no decisions.
 *
 * WHY THIS IS SO SMALL: the ledger is already a CRDT, so the server never has
 * to resolve anything. Merging is commutative, associative and idempotent,
 * which means "read what is there, merge, write it back" is correct even when
 * several phones do it at the same moment. A normal app would need version
 * vectors or server-side conflict rules here.
 */

/** A Firestore document is capped at 1 MiB; stay well under it. */
export const MAX_BLOB_CHARS = 700_000

export type PushDecision =
  | { action: 'write'; blob: string; merged: Trip }
  | { action: 'skip'; reason: 'identical' }
  | { action: 'refuse'; reason: 'too-large'; chars: number }
  | { action: 'refuse'; reason: 'newer-version' | 'unsendable' }

export type PullDecision =
  | { action: 'adopt'; merged: Trip }
  | { action: 'ignore'; reason: 'identical' | 'unreadable' | 'wrong-trip' | 'newer-version' }

/**
 * Canonical fingerprint of a trip's full content.
 *
 * Used to answer one question: would writing this change anything? Without it
 * the app deadlocks into a billing loop — a write fires the listener, the
 * listener merges and writes, which fires the listener again, forever. Each
 * lap costs a document write. This is the most expensive mistake available in
 * a realtime database, so it gets its own function and its own tests.
 *
 * It serialises the WHOLE trip with sorted keys, not just record ids and
 * timestamps. A metadata-only fingerprint looks sufficient but is not: the
 * merge breaks exact (updatedAt, updatedBy) ties by comparing content, so two
 * replicas can hold different versions of one record under identical
 * metadata. A metadata fingerprint would call them equal, neither phone would
 * push, and they would disagree forever without any error.
 */
export function fingerprint(trip: Trip): string {
  return canonical(trip)
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(',')}}`
}

/** Decode a blob that came off the wire. Never throws; bad input is ignored. */
export function readRemote(blob: string | null | undefined, tripId: Id): Trip | null {
  const r = inspectRemote(blob, tripId)
  return r.kind === 'trip' ? r.trip : null
}

/**
 * What the server holds, told apart by what may be done about it: nothing
 * there, a trip, data from a NEWER app version (never to be overwritten), or
 * garbage (safe to replace — a good copy heals it).
 */
export function inspectRemote(
  blob: string | null | undefined,
  tripId: Id,
):
  | { kind: 'none' }
  | { kind: 'trip'; trip: Trip }
  | { kind: 'newer-version' }
  | { kind: 'unreadable' } {
  if (typeof blob !== 'string' || blob === '') return { kind: 'none' }
  const decoded = decodeLedger(blob)
  if (!decoded.ok) {
    return decoded.reason === 'newer-version' ? { kind: 'newer-version' } : { kind: 'unreadable' }
  }
  const trip = decoded.file.trips[tripId]
  return trip ? { kind: 'trip', trip } : { kind: 'unreadable' }
}

/**
 * What to send up after a local change.
 *
 * The remote copy is merged in first, so a write can never clobber an expense
 * that landed between this phone's last read and now.
 */
export function decidePush(local: Trip, remoteBlob: string | null, deviceId: Id): PushDecision {
  const inspected = inspectRemote(remoteBlob, local.id)
  // An older app must never overwrite what it cannot read: that would erase
  // everything the newer version added, for the whole group.
  if (inspected.kind === 'newer-version') return { action: 'refuse', reason: 'newer-version' }
  const remote = inspected.kind === 'trip' ? inspected.trip : null
  const merged = remote ? mergeTrip(local, remote) : local

  // Fast path: the usual case after any adopt.
  if (remote && fingerprint(merged) === fingerprint(remote)) {
    return { action: 'skip', reason: 'identical' }
  }

  // Compare what the server would END UP holding, not what this phone holds.
  // Other phones read the blob through the import validator, which drops
  // records it rejects and cuts over-long text. If this phone holds anything
  // like that, its copy can never equal the server's, and comparing the two
  // raw meant writing the same blob forever — a billing loop that also used
  // up the whole group's daily quota. Comparing normalised forms makes that
  // impossible, whatever the cause of the mismatch.
  const sendable = normaliseTrip(merged)
  if (!sendable) return { action: 'refuse', reason: 'unsendable' }
  if (remote && fingerprint(sendable) === fingerprint(remote)) {
    return { action: 'skip', reason: 'identical' }
  }

  const blob = encodeLedger(buildLedgerFile({ [sendable.id]: sendable }, deviceId))
  if (blob.length > MAX_BLOB_CHARS) {
    return { action: 'refuse', reason: 'too-large', chars: blob.length }
  }
  return { action: 'write', blob, merged }
}

/** What to do with a document that just arrived from the listener. */
export function decidePull(local: Trip, remoteBlob: string | null): PullDecision {
  const inspected = inspectRemote(remoteBlob, local.id)
  if (inspected.kind === 'newer-version') return { action: 'ignore', reason: 'newer-version' }
  if (inspected.kind !== 'trip') return { action: 'ignore', reason: 'unreadable' }
  const remote = inspected.trip
  if (remote.id !== local.id) return { action: 'ignore', reason: 'wrong-trip' }

  const merged = mergeTrip(local, remote)
  if (fingerprint(merged) === fingerprint(local)) {
    return { action: 'ignore', reason: 'identical' }
  }
  return { action: 'adopt', merged }
}
