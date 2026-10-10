import { useMemo, useRef, useState } from 'react'
import { useStore, useTrip } from '../../storage/store'
import { computeTotals, liveMembers } from '../../domain/balance'
import { Avatar, Money, NotFound, TopBar, Why } from '../components'
import { Icon } from '../icons'
import { reset } from '../router'
import { useToast } from '../toast'
import { countOf } from '../plural'
import { tap } from '../haptics'
import type { Id } from '../../domain/types'

export function PeopleScreen({ tripId }: { tripId: Id }) {
  const trip = useTrip(tripId)
  const archived = !!useStore().db.archived[tripId]
  const {
    db,
    addMember,
    renameMember,
    removeMember,
    restoreMember,
    setMyself,
    renameTrip,
    deleteTrip, archiveTrip, unarchiveTrip,
    restoreTrip,
  } = useStore()
  const { show: toast } = useToast()
  const [newName, setNewName] = useState('')
  const newNameBox = useRef<HTMLInputElement>(null)
  const tripNameBox = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState<Id | null>(null)
  const [editName, setEditName] = useState('')
  /**
   * `null` means "showing whatever the group is called". A merge can rename the
   * group underneath us, and a plain `useState(trip.name)` would keep showing
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
      <TopBar
        title="People"
        subtitle={countOf(members.length, 'person', 'people')}
        onBack
        backTo={`/trip/${trip.id}`}
        backLabel={trip.name}
      />
      <div className="content no-fab">
        <div className="section">
          <div className="card list">
            {members.map((m) => {
              const net = netOf(m.id)
              const isEditing = editing === m.id
              return isEditing ? (
                <div key={m.id} className="row static person">
                  <Avatar member={m} group={trip.members} />
                  <div className="grow">
                    <input
                      autoFocus
                      aria-label={`Rename ${m.name}`}
                      value={editName}
                      maxLength={80}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => {
                        const next = editName.trim()
                        if (next && next !== m.name) renameMember(trip.id, m.id, next)
                        setEditing(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') setEditing(null)
                      }}
                    />
                  </div>
                  <div className="tools">
                    <button
                      className="btn ghost icon-only"
                      style={{ color: 'var(--negative)' }}
                      aria-label={`Remove ${m.name}`}
                      // mousedown, so the input's blur (which closes editing)
                      // does not swallow the tap.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        // Their past shares stay on the books either way, so
                        // there is nothing to warn about up front; Undo covers a slip.
                        setEditing(null)
                        removeMember(trip.id, m.id)
                        toast(`Removed ${m.name}`, {
                          action: { label: 'Undo', onClick: () => restoreMember(trip.id, m.id) },
                        })
                      }}
                    >
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  key={m.id}
                  className="row person"
                  aria-label={`Edit ${m.name}`}
                  onClick={() => {
                    setEditing(m.id)
                    setEditName(m.name)
                  }}
                >
                  <Avatar member={m} group={trip.members} />
                  <div className="grow">
                    <div className="title">
                      {m.name}
                      {m.id === me && <span className="chip tiny accent">you</span>}
                    </div>
                    <div className="meta">
                      {net > 0 ? 'is owed ' : net < 0 ? 'owes ' : 'all square'}
                      {net !== 0 && <Money amount={Math.abs(net)} currency={trip.currency} tone={net > 0 ? 'pos' : 'neg'} />}
                    </div>
                  </div>
                  <Icon name="edit" size={16} className="chev" />
                </button>
              )
            })}
          </div>
          <div className="spacer" />
          <div className="inline">
            <input
              ref={newNameBox}
              aria-label="Name of the person to add"
              value={newName}
              placeholder="Add a person"
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
              onClick={() => {
                // An empty box is not a reason for a dead button: put the cursor there.
                if (!newName.trim()) {
                  newNameBox.current?.focus()
                  tap()
                  return
                }
                addMember(trip.id, newName.trim())
                setNewName('')
              }}
            >
              <Icon name="plus" size={18} />
              Add
            </button>
          </div>
          <Why label="Adding and removing people">
            Add everyone on one phone, then share the group, so every phone uses the same person
            records. Tap a name to rename or remove them. Removing someone only hides them from
            new expenses; their past shares stay on the books, because rewriting history would
            change what everyone else owes.
          </Why>
        </div>

        <div className="section">
          <h2>Which one is you?</h2>
          <select
            aria-label="Which one is you?"
            value={me ?? ''}
            onChange={(e) => setMyself(trip.id, e.target.value)}
          >
            <option value="">Not set</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <Why>
            It highlights your own balance and pre-fills who paid. It stays on this phone and is
            never shared.
          </Why>
        </div>

        <div className="section">
          <details className="howto">
            <summary>
              <Icon name="edit" size={18} />
              <span className="grow">Rename, archive or delete this group</span>
              <Icon name="chevron" size={18} className="chev" />
            </summary>
            <div className="body">
              <div className="spacer" />
              <div className="inline">
                <input
                  ref={tripNameBox}
                  aria-label="Group name"
                  value={tripName}
                  maxLength={120}
                  onChange={(e) => setDraftName(e.target.value)}
                />
                <button
                  className="btn"
                  // Disabled only while there is nothing to save. An emptied box
                  // keeps the button live so a tap returns the cursor to it.
                  disabled={tripName.trim() === trip.name}
                  onClick={() => {
                    if (!tripName.trim()) {
                      tripNameBox.current?.focus()
                      tap()
                      return
                    }
                    renameTrip(trip.id, tripName.trim())
                    setDraftName(null)
                  }}
                >
                  Save
                </button>
              </div>
              <div className="spacer" />
              {archived ? (
                <button
                  className="btn block"
                  onClick={() => {
                    unarchiveTrip(trip.id)
                    toast(`${trip.name} is back on your list`)
                  }}
                >
                  <Icon name="refresh" size={18} />
                  Bring back from Archived
                </button>
              ) : (
                <button
                  className="btn block"
                  onClick={() => {
                    archiveTrip(trip.id)
                    reset('/')
                    toast(`Archived ${trip.name}. Find it under Archived on the home screen.`)
                  }}
                >
                  <Icon name="archive" size={18} />
                  Archive this group
                </button>
              )}
              <Why label="What archiving does">
                It puts a finished group away on this phone only: readable under{' '}
                <strong>Archived</strong> on the home screen, keeps everything, and stops checking
                for updates. Nobody else is affected.
              </Why>
              <div className="spacer" />
              <button
                className="btn danger block"
                onClick={() => {
                  // Removed from this phone only; everyone else keeps it (deleted
                  // trips are never synced, see SyncProvider). Undo brings it
                  // back with everything that arrived in the meantime.
                  const id = trip.id
                  deleteTrip(id)
                  // Every screen behind this one belonged to the trip just
                  // deleted, so drop them all rather than leave "back" stepping
                  // through a trip that is gone.
                  reset('/')
                  toast(`Deleted ${trip.name} from this phone`, {
                    action: { label: 'Undo', onClick: () => restoreTrip(id) },
                  })
                }}
              >
                <Icon name="trash" size={18} />
                Delete this group
              </button>
            </div>
          </details>
        </div>
      </div>
    </>
  )
}
