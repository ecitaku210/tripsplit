import { useMemo, useState } from 'react'
import { useStore, useTrip } from '../../storage/store'
import { computeTotals, liveMembers } from '../../domain/balance'
import { Avatar, Money, NotFound, TopBar } from '../components'
import { Icon } from '../icons'
import { navigate } from '../router'
import type { Id } from '../../domain/types'

export function PeopleScreen({ tripId }: { tripId: Id }) {
  const trip = useTrip(tripId)
  const { db, addMember, renameMember, removeMember, setMyself, renameTrip, deleteTrip } =
    useStore()
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<Id | null>(null)
  const [editName, setEditName] = useState('')
  /**
   * `null` means "showing whatever the trip is called". A merge can rename the
   * trip underneath us, and a plain `useState(trip.name)` would keep showing
   * the stale name forever, with the Save button wrongly greyed out.
   */
  const [draftName, setDraftName] = useState<string | null>(null)

  const totals = useMemo(() => (trip ? computeTotals(trip) : null), [trip])

  if (!trip) return <NotFound what="trip" />

  const members = liveMembers(trip)
  const me = db.identities[trip.id]
  const netOf = (id: Id) => totals?.balances.find((b) => b.memberId === id)?.netMinor ?? 0
  const tripName = draftName ?? trip.name

  return (
    <>
      <TopBar title="People" subtitle={trip.name} onBack />
      <div className="content no-fab">
        <div className="section">
          <h2>On this trip</h2>
          <div className="card">
            {members.map((m) => {
              const net = netOf(m.id)
              return (
                <div key={m.id} className="row static">
                  <Avatar member={m} />
                  <div className="grow">
                    {editing === m.id ? (
                      <input
                        autoFocus
                        value={editName}
                        maxLength={80}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={() => {
                          if (editName.trim()) renameMember(trip.id, m.id, editName.trim())
                          setEditing(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur()
                          if (e.key === 'Escape') setEditing(null)
                        }}
                      />
                    ) : (
                      <>
                        <div className="title">
                          {m.name}
                          {m.id === me && <span className="chip tiny accent">you</span>}
                        </div>
                        <div className="meta">
                          {net > 0 ? 'is owed ' : net < 0 ? 'owes ' : 'all square'}
                          {net !== 0 && (
                            <Money amount={Math.abs(net)} currency={trip.currency} />
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  {editing !== m.id && (
                    <>
                      <button
                        className="btn ghost icon-only"
                        aria-label={`Rename ${m.name}`}
                        onClick={() => {
                          setEditing(m.id)
                          setEditName(m.name)
                        }}
                      >
                        <Icon name="edit" size={18} />
                      </button>
                      <button
                        className="btn ghost icon-only"
                        style={{ color: 'var(--negative)' }}
                        aria-label={`Remove ${m.name}`}
                        onClick={() => {
                          const warning =
                            net === 0
                              ? ''
                              : `\n\n${m.name} is not square yet, so their balance will stay on the books.`
                          if (
                            confirm(
                              `Remove ${m.name} from this trip?\n\nExpenses they paid for or shared in stay exactly as they are — nothing is recalculated.${warning}`,
                            )
                          ) {
                            removeMember(trip.id, m.id)
                          }
                        }}
                      >
                        <Icon name="trash" size={18} />
                      </button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
          <p className="hint">
            Removing someone only hides them from new expenses. Their past shares stay on the books,
            because rewriting history would change what everyone else owes.
          </p>
        </div>

        <div className="section">
          <h2>Add someone</h2>
          <div className="inline">
            <input
              value={newName}
              placeholder="Name"
              maxLength={80}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newName.trim()) {
                  addMember(trip.id, newName.trim())
                  setNewName('')
                }
              }}
            />
            <button
              className="btn primary"
              disabled={!newName.trim()}
              onClick={() => {
                addMember(trip.id, newName.trim())
                setNewName('')
              }}
            >
              <Icon name="plus" size={18} />
              Add
            </button>
          </div>
          <p className="hint">
            Add everyone on one phone, then share the trip — that way the whole group uses the same
            person records instead of each phone inventing its own.
          </p>
        </div>

        <div className="section">
          <h2>Which one is you?</h2>
          <select value={me ?? ''} onChange={(e) => setMyself(trip.id, e.target.value)}>
            <option value="">Not set</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <p className="hint">
            Used to highlight your own balance and to pre-fill who paid. It stays on this phone and
            is never shared.
          </p>
        </div>

        <div className="section">
          <h2>Trip name</h2>
          <div className="inline">
            <input
              value={tripName}
              maxLength={120}
              onChange={(e) => setDraftName(e.target.value)}
            />
            <button
              className="btn"
              disabled={!tripName.trim() || tripName.trim() === trip.name}
              onClick={() => {
                renameTrip(trip.id, tripName.trim())
                setDraftName(null)
              }}
            >
              Save
            </button>
          </div>
        </div>

        <div className="section">
          <button
            className="btn danger block"
            onClick={() => {
              if (
                confirm(
                  `Delete "${trip.name}" from this phone?\n\nIt is removed from this phone only and stops syncing here. Everyone else on the trip keeps it.`,
                )
              ) {
                deleteTrip(trip.id)
                navigate('/')
              }
            }}
          >
            <Icon name="trash" size={18} />
            Delete this trip
          </button>
        </div>
      </div>
    </>
  )
}
