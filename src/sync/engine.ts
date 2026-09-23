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
import { decidePull, decidePush, type PushDecision } from './protocol'

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
  /** The server copy was written by a newer app version; this one must update. */
  | 'outdated'
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

type Timer = ReturnType<typeof setTimeout>

interface Channel {
  unsubscribe: () => void
  /** Debounce for local edits. */
  timer: Timer | null
  /** Pending retry of a push that failed. */
  retry: Timer | null
  retryDelay: number
  /** Pending re-attach of a listener that died. */
  relisten: Timer | null
  listenDelay: number
  /** The blob last seen on or written to the server. */
  remote: string | null
  pushing: boolean
  again: boolean
}

/**
 * Every failure retries by itself, backing off from 2 s to at most 30 s.
 *
 * The browser's 'online' event is not enough on its own. It fires only when
 * the phone flips from "no network" to "network", and on one bar of signal or
 * a captive hotel Wi-Fi the phone never thinks it is offline at all: uploads
 * failed, nothing retried, and expenses sat on one phone until the next edit.
 * A failed attempt while offline costs nothing, so trying again is cheap.
 */
const RETRY_MIN_MS = 2_000
const RETRY_MAX_MS = 30_000
const backoff = (ms: number) => Math.min(ms * 2, RETRY_MAX_MS)

function refusalStatus(d: Extract<PushDecision, { action: 'refuse' }>): SyncStatus {
  if (d.reason === 'too-large') return 'too-large'
  if (d.reason === 'newer-version') return 'outdated'
  return 'error'
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
  const status = (tripId: Id, s: SyncStatus) => {
    if (!closed) opts.onStatus(tripId, s)
  }
  const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

  /**
   * Anonymous sign-in, retried until it works.
   *
   * It needs the network exactly once per phone; afterwards Firebase keeps the
   * identity on the device. A first launch with no signal used to try once,
   * fail, and never try again — so sync never started that session, and the
   * trip sat on "Saving…" until the app was closed and reopened.
   */
  let signingIn = false
  let signInTimer: Timer | null = null
  let signInDelay = RETRY_MIN_MS
  function signIn(): void {
    if (closed || uid !== null || signingIn) return
    if (signInTimer) {
      clearTimeout(signInTimer)
      signInTimer = null
    }
    signingIn = true
    signInAnonymously(auth)
      .then(() => {
        signInDelay = RETRY_MIN_MS
      })
      .catch((err: unknown) => {
        if (closed) return
        const code = (err as { code?: string }).code ?? ''
        const s = code === 'auth/network-request-failed' || isOffline() ? 'offline' : 'error'
        for (const id of channels.keys()) status(id, s)
        signInTimer = setTimeout(() => {
          signInTimer = null
          signIn()
        }, signInDelay)
        signInDelay = backoff(signInDelay)
      })
      .finally(() => {
        signingIn = false
      })
  }

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
      signIn()
    }
  })

  function scheduleRetry(tripId: Id, ch: Channel): void {
    if (closed || channels.get(tripId) !== ch || ch.retry) return
    ch.retry = setTimeout(() => {
      ch.retry = null
      void push(tripId)
    }, ch.retryDelay)
    ch.retryDelay = backoff(ch.retryDelay)
  }

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
    const pre = decidePush(local, ch.remote, opts.deviceId)
    if (pre.action === 'skip') {
      ch.retryDelay = RETRY_MIN_MS
      status(tripId, 'live')
      return
    }
    if (pre.action === 'refuse') {
      status(tripId, refusalStatus(pre))
      return
    }
    if (isOffline()) {
      // The 'online' event (and returning to the app) pushes again.
      status(tripId, 'offline')
      return
    }

    ch.pushing = true
    status(tripId, uid === null ? 'connecting' : 'saving')
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
        if (d.action === 'refuse') return { kind: 'refuse' as const, decision: d }
        return { kind: 'skip' as const, blob }
      })

      if (outcome.kind === 'wrote') {
        stats.writes += 1
        ch.remote = outcome.blob
        ch.retryDelay = RETRY_MIN_MS
        // The write may have merged in records that were already on the
        // server; hand those back to this phone as well.
        opts.replica.adopt(outcome.merged)
        status(tripId, 'live')
      } else if (outcome.kind === 'refuse') {
        status(tripId, refusalStatus(outcome.decision))
      } else if (outcome.kind === 'skip') {
        ch.remote = outcome.blob
        ch.retryDelay = RETRY_MIN_MS
        status(tripId, 'live')
      }
    } catch (err) {
      const code = (err as { code?: string }).code ?? ''
      // Everything is still safe locally. Try again by itself: see RETRY_MIN_MS.
      status(tripId, code === 'unavailable' || isOffline() ? 'offline' : 'error')
      scheduleRetry(tripId, ch)
    } finally {
      ch.pushing = false
      if (ch.again) {
        ch.again = false
        void push(tripId)
      }
    }
  }

  function listen(tripId: Id, ch: Channel): void {
    if (closed || channels.get(tripId) !== ch) return
    ch.unsubscribe = onSnapshot(
      doc(db, 'trips', tripId),
      (snap) => {
        stats.snapshots += 1
        ch.listenDelay = RETRY_MIN_MS
        const blob = snap.exists() ? (snap.data().ledger as string) : null
        ch.remote = blob
        const local = opts.replica.get(tripId)
        if (!local) return
        const pull = decidePull(local, blob)
        const current = pull.action === 'adopt' ? pull.merged : local
        if (pull.action === 'adopt') opts.replica.adopt(pull.merged)
        // This phone may hold records the server lacks — a trip created
        // before sync existed, or edits made offline. Send them up.
        const next = decidePush(current, blob, opts.deviceId)
        if (next.action === 'write') void push(tripId)
        else if (next.action === 'refuse') status(tripId, refusalStatus(next))
        else status(tripId, 'live')
      },
      () => {
        // Firestore ends a listener for good after any error (a quota limit,
        // say). Left alone it stayed dead until the app was restarted, and
        // this phone stopped seeing anyone else's expenses.
        status(tripId, isOffline() ? 'offline' : 'error')
        ch.unsubscribe = () => undefined
        if (closed || channels.get(tripId) !== ch) return
        ch.relisten = setTimeout(() => {
          ch.relisten = null
          listen(tripId, ch)
        }, ch.listenDelay)
        ch.listenDelay = backoff(ch.listenDelay)
      },
    )
  }

  function watch(tripId: Id): void {
    if (channels.has(tripId) || closed) return
    const ch: Channel = {
      unsubscribe: () => undefined,
      timer: null,
      retry: null,
      retryDelay: RETRY_MIN_MS,
      relisten: null,
      listenDelay: RETRY_MIN_MS,
      remote: null,
      pushing: false,
      again: false,
    }
    channels.set(tripId, ch)
    status(tripId, 'connecting')
    void ready.then(() => listen(tripId, ch))
  }

  function unwatch(tripId: Id): void {
    const ch = channels.get(tripId)
    if (!ch) return
    ch.unsubscribe()
    for (const t of [ch.timer, ch.retry, ch.relisten]) if (t) clearTimeout(t)
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

  /**
   * Try everything now: after reconnecting, or when the app comes back to
   * the screen. Cheap when all is in step — each push is a local comparison
   * that ends without touching the network.
   */
  function resume(): void {
    if (closed) return
    if (uid === null) {
      signInDelay = RETRY_MIN_MS
      signIn()
    }
    for (const [id, ch] of channels) {
      if (ch.retry) {
        clearTimeout(ch.retry)
        ch.retry = null
      }
      ch.retryDelay = RETRY_MIN_MS
      void push(id)
    }
  }

  async function close(): Promise<void> {
    closed = true
    if (signInTimer) clearTimeout(signInTimer)
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
