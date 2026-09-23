import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  Currency,
  Database,
  Expense,
  Id,
  Settlement,
  SplitMode,
  SplitPart,
  Trip,
} from '../domain/types'
import {
  liveTrips,
  mergeTripMaps,
  restoreDeletedTrips,
  summariseMerge,
  type MergeSummary,
} from '../domain/merge'
import { loadDatabase, newId, saveDatabase, storageUsage, type StorageUsage } from './db'
import { newTripKey } from '../sync/crypto'

/**
 * Single source of truth for the app.
 *
 * Every mutation below stamps `updatedAt` / `updatedBy` and uses a tombstone
 * instead of deleting. That discipline is what makes the merge correct — if
 * one mutation forgets it, two phones can silently disagree forever. Hence
 * `stamp()`: no component ever builds those fields by hand.
 */

interface StoreValue {
  db: Database
  usage: StorageUsage
  /** Set when a write failed, so the UI can stop pretending data is safe. */
  saveError: 'quota' | 'blocked' | null

  createTrip(name: string, currency: Currency, myName: string): Id
  renameTrip(tripId: Id, name: string): void
  deleteTrip(tripId: Id): void
  /** Undo a delete on this phone. Only meaningful right after deleteTrip. */
  restoreTrip(tripId: Id): void

  addMember(tripId: Id, name: string): Id
  renameMember(tripId: Id, memberId: Id, name: string): void
  removeMember(tripId: Id, memberId: Id): void
  restoreMember(tripId: Id, memberId: Id): void
  setMyself(tripId: Id, memberId: Id): void

  saveExpense(tripId: Id, draft: ExpenseDraft): void
  deleteExpense(tripId: Id, expenseId: Id): void
  restoreExpense(tripId: Id, expenseId: Id): void

  addSettlement(tripId: Id, s: SettlementDraft): void
  deleteSettlement(tripId: Id, settlementId: Id): void
  restoreSettlement(tripId: Id, settlementId: Id): void

  /**
   * Merge trips in. `restoreDeleted` is for imports a person starts: it
   * brings back a trip they had deleted on this phone. Sync never sets it.
   * `keys` are the encryption keys carried by a shared file; a key in the
   * file replaces the one held, because the person importing chose that
   * code as the current one.
   */
  importTrips(
    trips: Record<Id, Trip>,
    opts?: { restoreDeleted?: boolean; keys?: Record<Id, string> },
  ): MergeSummary

  /**
   * Turn on end-to-end encryption for a trip created before it existed. From
   * the next sync the server holds ciphertext; everyone else needs the new
   * share code, which carries the key.
   */
  encryptTrip(tripId: Id): void
}

export interface ExpenseDraft {
  /** Absent for a new expense. */
  id?: Id
  description: string
  amountMinor: number
  paidBy: Id
  date: string
  splitMode: SplitMode
  parts: SplitPart[]
  note: string
}

export interface SettlementDraft {
  fromMember: Id
  toMember: Id
  amountMinor: number
  date: string
  note: string
}

const StoreContext = createContext<StoreValue | null>(null)

export function todayISO(): string {
  // Local date, not UTC: an expense added at 1am in Bangkok belongs to that
  // day there, not to yesterday in London.
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database>(() => loadDatabase())
  const [saveError, setSaveError] = useState<'quota' | 'blocked' | null>(null)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const result = saveDatabase(db)
    setSaveError(result.ok ? null : result.reason)
  }, [db])

  const stamp = useCallback(
    () => ({ updatedAt: Date.now(), updatedBy: db.deviceId, deletedAt: null as number | null }),
    [db.deviceId],
  )

  /** Applies a change to one trip and bumps nothing else. */
  const editTrip = useCallback((tripId: Id, fn: (trip: Trip) => Trip) => {
    setDb((prev) => {
      const trip = prev.trips[tripId]
      if (!trip) return prev
      return { ...prev, trips: { ...prev.trips, [tripId]: fn(trip) } }
    })
  }, [])

  const value = useMemo<StoreValue>(() => {
    return {
      db,
      usage: storageUsage(db),
      saveError,

      createTrip(name, currency, myName) {
        const tripId = newId()
        const memberId = newId()
        const now = Date.now()
        const trip: Trip = {
          id: tripId,
          name,
          currency,
          createdAt: now,
          updatedAt: now,
          updatedBy: db.deviceId,
          deletedAt: null,
          members: {
            [memberId]: {
              id: memberId,
              name: myName,
              updatedAt: now,
              updatedBy: db.deviceId,
              deletedAt: null,
            },
          },
          expenses: {},
          settlements: {},
        }
        // Encrypted from the first write: the key is minted with the trip.
        const key = newTripKey()
        setDb((prev) => ({
          ...prev,
          trips: { ...prev.trips, [tripId]: trip },
          identities: { ...prev.identities, [tripId]: memberId },
          keys: { ...prev.keys, [tripId]: key },
        }))
        return tripId
      },

      renameTrip(tripId, name) {
        editTrip(tripId, (trip) => ({ ...trip, name, ...stamp() }))
      },

      deleteTrip(tripId) {
        editTrip(tripId, (trip) => ({
          ...trip,
          updatedAt: Date.now(),
          updatedBy: db.deviceId,
          deletedAt: Date.now(),
        }))
      },

      /*
       * Restores are the Undo behind a delete. Clearing the tombstone with a
       * fresh stamp is a newer version of the record, so it wins the merge on
       * every phone, including any that already received the delete.
       */
      restoreTrip(tripId) {
        editTrip(tripId, (trip) => (trip.deletedAt === null ? trip : { ...trip, ...stamp() }))
      },

      addMember(tripId, name) {
        const memberId = newId()
        editTrip(tripId, (trip) => ({
          ...trip,
          members: {
            ...trip.members,
            [memberId]: { id: memberId, name, ...stamp() },
          },
        }))
        return memberId
      },

      renameMember(tripId, memberId, name) {
        editTrip(tripId, (trip) => {
          const member = trip.members[memberId]
          if (!member) return trip
          return {
            ...trip,
            members: { ...trip.members, [memberId]: { ...member, name, ...stamp() } },
          }
        })
      },

      removeMember(tripId, memberId) {
        editTrip(tripId, (trip) => {
          const member = trip.members[memberId]
          if (!member) return trip
          return {
            ...trip,
            members: {
              ...trip.members,
              [memberId]: {
                ...member,
                updatedAt: Date.now(),
                updatedBy: db.deviceId,
                deletedAt: Date.now(),
              },
            },
          }
        })
      },

      restoreMember(tripId, memberId) {
        editTrip(tripId, (trip) => {
          const member = trip.members[memberId]
          if (!member || member.deletedAt === null) return trip
          return { ...trip, members: { ...trip.members, [memberId]: { ...member, ...stamp() } } }
        })
      },

      setMyself(tripId, memberId) {
        setDb((prev) => ({ ...prev, identities: { ...prev.identities, [tripId]: memberId } }))
      },

      saveExpense(tripId, draft) {
        editTrip(tripId, (trip) => {
          const existing = draft.id ? trip.expenses[draft.id] : undefined
          const id = draft.id ?? newId()
          const expense: Expense = {
            id,
            description: draft.description,
            amountMinor: draft.amountMinor,
            paidBy: draft.paidBy,
            date: draft.date,
            splitMode: draft.splitMode,
            parts: draft.parts,
            note: draft.note,
            createdAt: existing?.createdAt ?? Date.now(),
            ...stamp(),
          }
          return { ...trip, expenses: { ...trip.expenses, [id]: expense } }
        })
      },

      deleteExpense(tripId, expenseId) {
        editTrip(tripId, (trip) => {
          const expense = trip.expenses[expenseId]
          if (!expense) return trip
          const now = Date.now()
          return {
            ...trip,
            expenses: {
              ...trip.expenses,
              [expenseId]: { ...expense, updatedAt: now, updatedBy: db.deviceId, deletedAt: now },
            },
          }
        })
      },

      restoreExpense(tripId, expenseId) {
        editTrip(tripId, (trip) => {
          const expense = trip.expenses[expenseId]
          if (!expense || expense.deletedAt === null) return trip
          return { ...trip, expenses: { ...trip.expenses, [expenseId]: { ...expense, ...stamp() } } }
        })
      },

      addSettlement(tripId, draft) {
        const id = newId()
        editTrip(tripId, (trip) => {
          const settlement: Settlement = { id, ...draft, createdAt: Date.now(), ...stamp() }
          return { ...trip, settlements: { ...trip.settlements, [id]: settlement } }
        })
      },

      deleteSettlement(tripId, settlementId) {
        editTrip(tripId, (trip) => {
          const s = trip.settlements[settlementId]
          if (!s) return trip
          const now = Date.now()
          return {
            ...trip,
            settlements: {
              ...trip.settlements,
              [settlementId]: { ...s, updatedAt: now, updatedBy: db.deviceId, deletedAt: now },
            },
          }
        })
      },

      restoreSettlement(tripId, settlementId) {
        editTrip(tripId, (trip) => {
          const s = trip.settlements[settlementId]
          if (!s || s.deletedAt === null) return trip
          return { ...trip, settlements: { ...trip.settlements, [settlementId]: { ...s, ...stamp() } } }
        })
      },

      encryptTrip(tripId) {
        setDb((prev) => {
          if (!prev.trips[tripId] || prev.keys[tripId]) return prev
          return { ...prev, keys: { ...prev.keys, [tripId]: newTripKey() } }
        })
      },

      importTrips(incoming, { restoreDeleted = false, keys } = {}) {
        const prepare = (trips: Record<Id, Trip>) =>
          restoreDeleted ? restoreDeletedTrips(trips, incoming) : trips
        // Merged once and reused for both the summary and the new state.
        // Merging twice was pure waste on a large ledger, and under
        // StrictMode's double-invoked updater it ran three times.
        const merged = mergeTripMaps(prepare(db.trips), incoming)
        // Counted over visible trips, so a restored trip reads as the new
        // trip it is to the person who sees it reappear.
        const summary = summariseMerge(liveTrips(db.trips), liveTrips(merged))
        setDb((prev) => ({
          ...prev,
          // If another change landed between render and commit, redo the
          // merge against what is actually current rather than clobbering it.
          trips:
            prev.trips === db.trips ? merged : mergeTripMaps(prepare(prev.trips), incoming),
          keys: keys ? { ...prev.keys, ...keys } : prev.keys,
        }))
        return summary
      },
    }
  }, [db, saveError, editTrip, stamp])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore must be used inside <StoreProvider>')
  return value
}

export function useTrip(tripId: Id | null): Trip | null {
  const { db } = useStore()
  if (!tripId) return null
  const trip = db.trips[tripId]
  return trip && trip.deletedAt === null ? trip : null
}
