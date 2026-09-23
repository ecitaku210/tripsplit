import { deleteApp, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app'
import {
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  type Auth,
} from 'firebase/auth'
import {
  connectFirestoreEmulator,
  doc,
  getFirestore,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore'
import type { Id, Trip } from '../domain/types'
import { decidePull, decidePush } from './protocol'

/**
 * The Firestore adapter. It moves bytes and makes no decisions: every "should
 * I write?" and "should I adopt this?" is answered by protocol.ts, which is
 * pure and tested without a network.
 *
 * One document per trip, `trips/{tripId}`, holding the compressed ledger. The
 * server never needs to understand it; phones merge.
 */

export type SyncStatus =
  /** Signing in or waiting for the first snapshot. */
  | 'connecting'
  /** Up to date with the server. */
  | 'live'
  /** A write is in flight. */
  | 'saving'
  /** No network. Changes are safe on this phone and go up on reconnect. */
  | 'offline'
  /** The trip outgrew one Firestore document; manual sharing still works. */
  | 'too-large'
  /** Something the app cannot recover from by itself, e.g. quota exhausted. */
  | 'error'

/** How the engine reads and changes this phone's copy. */
export interface Replica {
  /** The current local trip, or null if it is gone or deleted on this phone. */
  get(tripId: Id): Trip | null
  /** Merge a trip that came from the server into local state. */
  adopt(trip: Trip): void
}

export interface SyncOptions {
  config: FirebaseOptions
  deviceId: Id
  replica: Replica
  onStatus: (tripId: Id, status: SyncStatus) => void
  /** Wait this long after a local change before pushing, to batch edits. */
  debounceMs?: number
  /** Point at the local emulators instead of production (tests only). */
  emulator?: { host: string; firestorePort: number; authPort: number }
  /** Distinct app name, so tests can run several "phones" in one process. */
  appName?: string
}

export interface SyncStats {
  snapshots: number
  transactions: number
  writes: number
}

interface Channel {
  unsubscribe: () => void
  timer: ReturnType<typeof setTimeout> | null
  /** The blob last seen on or written to the server. */
  remote: string | null
  pushing: boolean
  again: boolean
}

export function createSync(opts: SyncOptions) {
  const app: FirebaseApp = initializeApp(opts.config, opts.appName ?? '[DEFAULT]')
  const auth: Auth = getAuth(app)
  const db: Firestore = getFirestore(app)
  if (opts.emulator) {
    connectAuthEmulator(auth, `http://${opts.emulator.host}:${opts.emulator.authPort}`, {
      disableWarnings: true,
    })
    connectFirestoreEmulator(db, opts.emulator.host, opts.emulator.firestorePort)
  }

  const debounceMs = opts.debounceMs ?? 400
  const channels = new Map<Id, Channel>()
  const stats: SyncStats = { snapshots: 0, transactions: 0, writes: 0 }
  let closed = false

  /**
   * Resolves once this phone has an anonymous identity. If the account is ever
   * deleted server-side, onAuthStateChanged reports null and we simply sign in
   * again: data is keyed by trip id, not by user, so nothing is lost.
   */
  let uid: string | null = null
  let ready: Promise<string>
  let resolveReady: (u: string) => void = () => undefined
  const resetReady = () => {
    ready = new Promise<string>((r) => (resolveReady = r))
  }
  resetReady()
  onAuthStateChanged(auth, (user) => {
    if (user) {
      uid = user.uid
      resolveReady(user.uid)
    } else if (!closed) {
      // Firebase reports "no user" once at startup, before any sign-in. Only
      // a genuine sign-out (we HAD a user) gets a fresh promise. Replacing it
      // at startup orphans every watcher already waiting on the first one:
      // they wait forever, and sync silently never starts. The two-phone
      // emulator test caught exactly that.
      if (uid !== null) resetReady()
      uid = null
      signInAnonymously(auth).catch(() => undefined)
    }
  })

  const status = (tripId: Id, s: SyncStatus) => {
    if (!closed) opts.onStatus(tripId, s)
  }
  const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

  async function push(tripId: Id): Promise<void> {
    const ch = channels.get(tripId)
    if (!ch || closed) return
    // One write per trip at a time; a change arriving mid-write runs after.
    if (ch.pushing) {
      ch.again = true
      return
    }

    const local = opts.replica.get(tripId)
    if (!local) return
    // Cheap pre-check against the last known server copy: most local changes
    // that follow an adopt have nothing new to send, and this avoids a
    // transaction (and its billed read) entirely.
    if (decidePush(local, ch.remote, opts.deviceId).action === 'skip') {
      status(tripId, 'live')
      return
    }
    if (isOffline()) {
      status(tripId, 'offline')
      return
    }

    ch.pushing = true
    status(tripId, 'saving')
    try {
      const me = await ready
      const ref = doc(db, 'trips', tripId)
      stats.transactions += 1
      // The callback may run more than once if another phone writes at the
      // same moment; Firestore retries it with fresh data. It must therefore
      // stay free of side effects apart from the transaction's own calls.
      const outcome = await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref)
        const blob = snap.exists() ? (snap.data().ledger as string) : null
        const current = opts.replica.get(tripId)
        if (!current) return { kind: 'gone' as const }
        const d = decidePush(current, blob, opts.deviceId)
        if (d.action === 'write') {
          tx.set(ref, { ledger: d.blob, updatedAt: serverTimestamp(), updatedBy: me })
          return { kind: 'wrote' as const, blob: d.blob, merged: d.merged }
        }
        return { kind: d.action, blob }
      })

      if (outcome.kind === 'wrote') {
        stats.writes += 1
        ch.remote = outcome.blob
        // The write may have merged in records that were already on the
        // server; hand those back to this phone as well.
        opts.replica.adopt(outcome.merged)
        status(tripId, 'live')
      } else if (outcome.kind === 'refuse') {
        status(tripId, 'too-large')
      } else if (outcome.kind === 'skip') {
        ch.remote = outcome.blob
        status(tripId, 'live')
      }
    } catch (err) {
      const code = (err as { code?: string }).code ?? ''
      // Transient: the network dropped. Everything is still safe locally,
      // and the 'online' listener pushes again.
      status(tripId, code === 'unavailable' || isOffline() ? 'offline' : 'error')
    } finally {
      ch.pushing = false
      if (ch.again) {
        ch.again = false
        void push(tripId)
      }
    }
  }

  function watch(tripId: Id): void {
    if (channels.has(tripId) || closed) return
    const ch: Channel = { unsubscribe: () => undefined, timer: null, remote: null, pushing: false, again: false }
    channels.set(tripId, ch)
    status(tripId, 'connecting')

    void ready.then(() => {
      if (closed || channels.get(tripId) !== ch) return
      ch.unsubscribe = onSnapshot(
        doc(db, 'trips', tripId),
        (snap) => {
          stats.snapshots += 1
          const blob = snap.exists() ? (snap.data().ledger as string) : null
          ch.remote = blob
          const local = opts.replica.get(tripId)
          if (!local) return
          const pull = decidePull(local, blob)
          const current = pull.action === 'adopt' ? pull.merged : local
          if (pull.action === 'adopt') opts.replica.adopt(pull.merged)
          // This phone may hold records the server lacks — a trip created
          // before sync existed, or edits made offline. Send them up.
          if (decidePush(current, blob, opts.deviceId).action === 'write') void push(tripId)
          else status(tripId, 'live')
        },
        () => status(tripId, isOffline() ? 'offline' : 'error'),
      )
    })
  }

  function unwatch(tripId: Id): void {
    const ch = channels.get(tripId)
    if (!ch) return
    ch.unsubscribe()
    if (ch.timer) clearTimeout(ch.timer)
    channels.delete(tripId)
  }

  /** Call after any local change to a trip; pushes are debounced. */
  function changed(tripId: Id): void {
    const ch = channels.get(tripId)
    if (!ch || closed) return
    if (ch.timer) clearTimeout(ch.timer)
    ch.timer = setTimeout(() => {
      ch.timer = null
      void push(tripId)
    }, debounceMs)
  }

  /** After reconnecting, push every watched trip. */
  function resume(): void {
    for (const id of channels.keys()) void push(id)
  }

  async function close(): Promise<void> {
    closed = true
    for (const id of [...channels.keys()]) unwatch(id)
    await deleteApp(app)
  }

  return {
    watch,
    unwatch,
    changed,
    resume,
    close,
    stats: (): SyncStats => ({ ...stats }),
    uid: () => uid,
  }
}

export type SyncEngine = ReturnType<typeof createSync>
