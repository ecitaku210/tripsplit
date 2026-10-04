import { useId, useRef, useState } from 'react'
import { useStore } from '../../storage/store'
import { computeTotals, liveMembers } from '../../domain/balance'
import { DEFAULT_CURRENCIES, formatMoney } from '../../domain/money'
import { ActionSheet, Alert, AvatarStack, Empty, Field, TopBar, firstName, verdict, type SheetAction } from '../components'
import { settlementPlan } from '../../domain/settle'
import { cardVerdict, obligationsOf } from '../../domain/standing'
import { Icon } from '../icons'
import { navigate } from '../router'
import type { Currency, Trip } from '../../domain/types'
import { countOf } from '../plural'
import { tap } from '../haptics'
import { useLongPress } from '../longPress'
import { useToast } from '../toast'
import { useSyncStatus } from '../../sync/SyncProvider'
import { isCutOff } from './TripScreen'

export function HomeScreen() {
  const { db, createTrip, usage, saveError } = useStore()
  const [creating, setCreating] = useState(false)

  const live = Object.values(db.trips)
    .filter((t) => t.deletedAt === null)
    .sort((a, b) => b.createdAt - a.createdAt)
  // Put-away trips sit under a fold at the bottom: readable, not in the way.
  const trips = live.filter((t) => !(t.id in db.archived))
  const archived = live.filter((t) => t.id in db.archived)

  return (
    <>
      <TopBar
        brand
        title="TripSplit"
        subtitle={trips.length ? countOf(trips.length, 'group', 'groups') : 'Split costs with anyone, fairly'}
        right={
          <button
            className="btn ghost icon-only"
            onClick={() => navigate('/help')}
            aria-label="Help and FAQ"
          >
            <Icon name="info" size={20} />
          </button>
        }
      />
      <div className="content no-fab">
        {saveError && (
          <div className="section">
            <Alert tone="bad">
              {saveError === 'blocked'
                ? 'This browser is blocking storage, so nothing is being saved. Private/Incognito mode does this — open the app in a normal window.'
                : 'Storage is full, so your last change was not saved. Export this group and delete an old one.'}
            </Alert>
          </div>
        )}

        {usage.ratio > 0.8 && !saveError && (
          <div className="section">
            <Alert tone="warn">
              Local storage is <strong>{Math.round(usage.ratio * 100)}% full</strong>. Export and
              delete finished groups to make room.
            </Alert>
          </div>
        )}

        {trips.length === 0 && archived.length === 0 && !creating && <FirstRun />}

        {trips.length > 1 && <Standing trips={trips} identities={db.identities} />}

        {trips.length > 0 && (
          <div className="section">
            <h2>Your groups</h2>
            {trips.map((trip) => (
              <TripCard key={trip.id} trip={trip} me={db.identities[trip.id]} />
            ))}
          </div>
        )}

        {creating ? (
          <NewTripForm
            onCancel={() => setCreating(false)}
            onCreate={(name, currency, myName) => {
              const id = createTrip(name, currency, myName)
              setCreating(false)
              navigate(`/trip/${id}`)
            }}
          />
        ) : (
          <div className="section">
            <div className="btn-row">
              <button className="btn primary" onClick={() => setCreating(true)}>
                <Icon name="plus" size={18} />
                New group
              </button>
              <button className="btn" onClick={() => navigate('/import')}>
                <Icon name="download" size={18} />
                Import
              </button>
            </div>
          </div>
        )}

        {archived.length > 0 && (
          <div className="section">
            <details className="howto">
              <summary>
                <Icon name="archive" size={18} />
                Archived
                <span className="dim"> · {archived.length}</span>
                <Icon name="chevron" size={18} className="chev" />
              </summary>
              <div className="body">
                {archived.map((trip) => (
                  <TripCard key={trip.id} trip={trip} me={db.identities[trip.id]} />
                ))}
              </div>
            </details>
          </div>
        )}

      </div>
    </>
  )
}

/**
 * One trip, as a card: who is on it, how much has gone through it, and the
 * only number the reader actually wants — where they stand — in words.
 */
function TripCard({ trip, me }: { trip: Trip; me: string | undefined }) {
  const { db, archiveTrip, unarchiveTrip, deleteTrip, restoreTrip } = useStore()
  const { show: toast } = useToast()
  const [menu, setMenu] = useState(false)
  const press = useLongPress(() => {
    tap()
    setMenu(true)
  })
  const members = liveMembers(trip)
  const totals = computeTotals(trip)
  const mine = me ? totals.balances.find((b) => b.memberId === me) : undefined
  const archived = trip.id in db.archived
  const sync = useSyncStatus(trip.id)
  const someoneOwes = settlementPlan(totals.balances).length > 0

  let verdictNode
  if (!mine) {
    // A trip you imported has no "me" yet, and showing ₹0.00 there would read
    // as "you are square" when the truth is "nobody has told the app who you
    // are".
    verdictNode = <span className="verdict ask">Who are you? Tap to pick</span>
  } else {
    // "You owe Bhavya ₹11.50", not "You owe ₹11.50": the name is the
    // action. Read from the same plan Settle up shows.
    const nameOf = (id: string) => (trip.members[id] ? firstName(trip.members[id]!.name) : 'someone')
    const v = cardVerdict(obligationsOf(settlementPlan(totals.balances), me!), mine.netMinor, nameOf)
    verdictNode = (
      <span className={`verdict ${v.tone}`}>
        {v.before}
        {mine.netMinor !== 0 && (
          <>
            {' '}
            <span className="num">{formatMoney(Math.abs(mine.netMinor), trip.currency)}</span>
          </>
        )}
        {v.after && ` ${v.after}`}
      </span>
    )
  }

  /*
   * The things people reach for without wanting to open the group first.
   * Delete and Archive carry Undo, like everywhere else in the app.
   */
  const actions: SheetAction[] = [
    { label: 'Add expense', icon: 'plus', onSelect: () => navigate(`/trip/${trip.id}/expense/new`) },
    ...(someoneOwes
      ? [{ label: 'Settle up', icon: 'handshake' as const, onSelect: () => navigate(`/trip/${trip.id}/settle`) }]
      : []),
    { label: 'Share', icon: 'share', onSelect: () => navigate(`/trip/${trip.id}/share`) },
    archived
      ? {
          label: 'Bring back from Archived',
          icon: 'refresh',
          onSelect: () => {
            unarchiveTrip(trip.id)
            toast(`${trip.name} is back on your list`)
          },
        }
      : {
          label: 'Archive',
          icon: 'archive',
          onSelect: () => {
            archiveTrip(trip.id)
            toast(`Archived ${trip.name}`, { action: { label: 'Undo', onClick: () => unarchiveTrip(trip.id) } })
          },
        },
    {
      label: 'Delete from this phone',
      icon: 'trash',
      danger: true,
      onSelect: () => {
        deleteTrip(trip.id)
        toast(`Deleted ${trip.name} from this phone`, { action: { label: 'Undo', onClick: () => restoreTrip(trip.id) } })
      },
    },
  ]

  return (
    <div className="trip-card-wrap">
      <button
        className="trip-card"
        {...press.handlers}
        onClick={() => {
          if (press.swallowClick()) return
          navigate(`/trip/${trip.id}`)
        }}
      >
        <div className="top">
          <span className="name">{trip.name}</span>
        </div>
        {/* Faces and the verdict: who is in it, and where you stand. Nothing else. */}
        <div className="bottom lean">
          <AvatarStack members={members} />
          {verdictNode}
        </div>
        {/*
          The balance above can be stale when this phone is cut off; say so
          on the card itself, where the number is read.
        */}
        {isCutOff(sync) && (
          <div className="card-flag">
            <Icon name={sync === 'locked' ? 'lock' : 'refresh'} size={14} />
            {sync === 'locked' ? 'Not getting updates · tap to fix' : 'Needs the new version · tap to update'}
          </div>
        )}
      </button>
      {/*
        The same menu for anyone who does not know to hold: a thumb, a
        keyboard, a screen reader. It takes the chevron's place, so the card
        gains nothing to read.
      */}
      <button
        className="btn ghost icon-only trip-more"
        aria-label={`More for ${trip.name}`}
        aria-haspopup="dialog"
        onClick={() => setMenu(true)}
      >
        <Icon name="more" size={22} strokeWidth={3.25} />
      </button>
      {menu && <ActionSheet title={trip.name} actions={actions} onClose={() => setMenu(false)} />}
    </div>
  )
}

/**
 * Where the reader stands across every trip they have named themselves on,
 * one currency at a time. The single most useful number on the home screen
 * for someone on two or three trips at once.
 */
function Standing({ trips, identities }: { trips: Trip[]; identities: Record<string, string> }) {
  const byCurrency = new Map<string, { currency: Currency; net: number; trips: number }>()
  for (const trip of trips) {
    const me = identities[trip.id]
    if (!me) continue
    const mine = computeTotals(trip).balances.find((b) => b.memberId === me)
    if (!mine) continue
    const entry = byCurrency.get(trip.currency.code) ?? { currency: trip.currency, net: 0, trips: 0 }
    entry.net += mine.netMinor
    entry.trips += 1
    byCurrency.set(trip.currency.code, entry)
  }
  const rows = [...byCurrency.values()].filter((r) => r.trips > 1)
  if (rows.length === 0) return null
  return (
    <div className="section">
      <div className="standing">
        {rows.map((r) => {
          const v = verdict(r.net)
          return (
            <div key={r.currency.code} className="standing-row">
              <span className="kicker">Across {countOf(r.trips, 'group', 'groups')}</span>
              <span className={`verdict ${v.tone}`}>
                {v.label}
                {r.net !== 0 && (
                  <>
                    {' '}
                    <span className="num">{formatMoney(Math.abs(r.net), r.currency)}</span>
                  </>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** The first thing a new user sees. Three steps, then the button. */
function FirstRun() {
  return (
    <div className="section">
      <div className="card pad">
        <Empty icon="sparkle" title="Split costs in three steps">
          Log who paid for what, and the app works out who owes whom at the end.
        </Empty>
        <ol className="steps">
          <li>
            <span className="n">1</span>
            <div>
              <div className="s-title">Create a group and add everyone in it</div>
              <div className="s-body">One person does this, so everyone shares one group.</div>
            </div>
          </li>
          <li>
            <span className="n">2</span>
            <div>
              <div className="s-title">Send the group the link</div>
              <div className="s-body">
                They tap it once. From then on every phone stays in step by itself.
              </div>
            </div>
          </li>
          <li>
            <span className="n">3</span>
            <div>
              <div className="s-title">Add each expense as you pay</div>
              <div className="s-body">
                Five seconds at the table. Settle up at the end with the fewest payments.
              </div>
            </div>
          </li>
        </ol>
      </div>
    </div>
  )
}

function NewTripForm({
  onCreate,
  onCancel,
}: {
  onCreate: (name: string, currency: Currency, myName: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [myName, setMyName] = useState('')
  const [code, setCode] = useState('INR')
  // Set by a refused Create: only then do empty boxes turn red.
  const [tried, setTried] = useState(false)
  const nameBox = useRef<HTMLInputElement>(null)
  const myNameBox = useRef<HTMLInputElement>(null)
  const uid = useId()

  const currency = DEFAULT_CURRENCIES.find((c) => c.code === code) ?? DEFAULT_CURRENCIES[0]!
  const nameMissing = name.trim().length === 0
  const myNameMissing = myName.trim().length === 0
  const valid = !nameMissing && !myNameMissing

  /**
   * Create is never a dead button. Tapped too early, it puts the cursor in
   * the first empty box and says what goes there.
   */
  function create() {
    if (!valid) {
      setTried(true)
      ;(nameMissing ? nameBox : myNameBox).current?.focus()
      tap()
      return
    }
    onCreate(name.trim(), currency, myName.trim())
  }

  return (
    <div className="section">
      <h2>New group</h2>
      <div className="card pad">
        <Field
          label="Group name"
          htmlFor={`${uid}-name`}
          error={tried && nameMissing ? 'Give the group a name.' : null}
        >
          <input
            id={`${uid}-name`}
            ref={nameBox}
            autoFocus
            value={name}
            placeholder="e.g. Goa, March 2026"
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
        </Field>
        <Field
          label="Your name"
          htmlFor={`${uid}-me`}
          hint="This is how you appear to everyone else in the group."
          error={tried && myNameMissing ? 'What do your friends call you?' : null}
        >
          <input
            id={`${uid}-me`}
            ref={myNameBox}
            value={myName}
            placeholder="e.g. Tarun"
            onChange={(e) => setMyName(e.target.value)}
            maxLength={80}
          />
        </Field>
        <Field
          label="Currency"
          htmlFor={`${uid}-cur`}
          hint="One currency per group. Convert before entering an expense."
        >
          <select id={`${uid}-cur`} value={code} onChange={(e) => setCode(e.target.value)}>
            {DEFAULT_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} ({c.symbol.trim()})
              </option>
            ))}
          </select>
        </Field>
        <div className="btn-row">
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={create}>
            <Icon name="check" size={18} />
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
