import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Id, Trip } from '../domain/types'
import { useStore } from '../storage/store'
import type { SyncEngine, SyncStatus } from './engine'

/**
 * Connects the local store to live sync.
 *
 * The Firebase SDK is loaded with a dynamic import, so it never sits between
 * the user and the first screen: the app opens and works offline exactly as
 * before, and sync attaches a moment later when the chunk arrives.
 *
 * Deleted trips are deliberately not synced. Deleting a trip removes it from
 * THIS phone only; everyone else keeps theirs, which is what the delete
 * dialog promises.
 */

const SyncContext = createContext<Record<Id, SyncStatus>>({})

export function useSyncStatus(tripId: Id): SyncStatus | null {
  return useContext(SyncContext)[tripId] ?? null
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const store = useStore()
  const [statuses, setStatuses] = useState<Record<Id, SyncStatus>>({})
  const [engine, setEngine] = useState<SyncEngine | null>(null)

  // The engine calls back into the store long after this render; a ref keeps
  // those callbacks reading the latest state rather than a stale closure.
  const storeRef = useRef(store)
  storeRef.current = store

  useEffect(() => {
    let cancelled = false
    let created: SyncEngine | null = null
    void (async () => {
      const [{ createSync }, { firebaseConfig }] = await Promise.all([
        import('./engine'),
        import('./config'),
      ])
      if (cancelled) return
      const emulatorHost = import.meta.env.VITE_FIREBASE_EMULATOR_HOST as string | undefined
      created = createSync({
        config: firebaseConfig,
        deviceId: storeRef.current.db.deviceId,
        ...(emulatorHost
          ? { emulator: { host: emulatorHost, firestorePort: 8080, authPort: 9099 } }
          : {}),
        replica: {
          get: (id: Id): Trip | null => {
            const t = storeRef.current.db.trips[id]
            return t && t.deletedAt === null ? t : null
          },
          adopt: (trip: Trip) => {
            storeRef.current.importTrips({ [trip.id]: trip })
          },
        },
        onStatus: (id, s) => setStatuses((prev) => (prev[id] === s ? prev : { ...prev, [id]: s })),
      })
      setEngine(created)
    })()
    return () => {
      cancelled = true
      void created?.close()
    }
  }, [])

  // Watch every live trip; push whichever trip object changed identity.
  const seen = useRef<Record<Id, Trip>>({})
  const trips = store.db.trips
  useEffect(() => {
    if (!engine) return
    const next: Record<Id, Trip> = {}
    for (const [id, trip] of Object.entries(trips)) {
      if (trip.deletedAt !== null) continue
      next[id] = trip
      if (!seen.current[id]) engine.watch(id)
      else if (seen.current[id] !== trip) engine.changed(id)
    }
    for (const id of Object.keys(seen.current)) if (!next[id]) engine.unwatch(id)
    seen.current = next
  }, [engine, trips])

  // Back online, or back on screen: push anything that piled up. Phones
  // freeze a backgrounded app's timers, so returning to it is the moment a
  // pending retry would otherwise be waiting on a timer that never ran.
  useEffect(() => {
    if (!engine) return
    const onOnline = () => engine.resume()
    const onVisible = () => {
      if (document.visibilityState === 'visible') engine.resume()
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [engine])

  return <SyncContext.Provider value={statuses}>{children}</SyncContext.Provider>
}
