import { useId, useRef, useState } from 'react'
import { useStore } from '../../storage/store'
import { computeTotals, liveExpenses, liveMembers } from '../../domain/balance'
import { DEFAULT_CURRENCIES, formatMoney } from '../../domain/money'
import { Alert, AvatarStack, Empty, Field, TopBar, verdict } from '../components'
import { Icon } from '../icons'
import { navigate } from '../router'
import type { Currency, Trip } from '../../domain/types'
import { countOf } from '../plural'
import { timeAgo } from '../dates'
import { tap } from '../haptics'

export function HomeScreen() {
  const { db, createTrip, usage, saveError } = useStore()
  const [creating, setCreating] = useState(false)

  const trips = Object.values(db.trips)
    .filter((t) => t.deletedAt === null)
    .sort((a, b) => b.createdAt - a.createdAt)

  return (
    <>
      <TopBar
        brand
        title="TripSplit"
        subtitle={trips.length ? countOf(trips.length, 'trip', 'trips') : 'Split trip costs, fairly'}
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
                : 'Storage is full, so your last change was not saved. Export this trip and delete an old one.'}
            </Alert>
          </div>
        )}

        {usage.ratio > 0.8 && !saveError && (
          <div className="section">
            <Alert tone="warn">
              Local storage is <strong>{Math.round(usage.ratio * 100)}% full</strong>. Export and
              delete finished trips to make room.
            </Alert>
          </div>
        )}

        {trips.length === 0 && !creating && <FirstRun />}

        {trips.length > 1 && <Standing trips={trips} identities={db.identities} />}

        {trips.length > 0 && (
          <div className="section">
            <h2>Your trips</h2>
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
                New trip
              </button>
              <button className="btn" onClick={() => navigate('/import')}>
                <Icon name="download" size={18} />
                Import
              </button>
            </div>
            <p className="hint">
              Someone sent you a trip? <strong>Import</strong> it once, and it stays in step from
              then on.
            </p>
          </div>
        )}

        <div className="section">
          <button className="tile wide" onClick={() => navigate('/help')}>
            <span className="ic">
              <Icon name="info" size={18} />
            </span>
            <span className="t-title">Help &amp; FAQ</span>
            <span className="t-sub">
              How to install on iPhone or Android, join a trip, split a bill and settle up.
            </span>
          </button>
          <div className="spacer" />
          <details className="howto">
            <summary>
              <Icon name="wifi" size={18} />
              How syncing and privacy work
              <Icon name="chevron" size={18} className="chev" />
            </summary>
            <div className="body">
              <p>
                <strong>Trips sync live</strong> between everyone&apos;s phones through Google
                Firebase whenever there is signal. Expenses are stored there as well as on your
                phone.
              </p>
              <p>
                <strong>No signal is fine.</strong> The app keeps working and catches up by itself
                once you are back online.
              </p>
              <p>
                <strong>Anyone with a trip&apos;s share code can see and edit it.</strong> Share it
                only with the people on the trip.
              </p>
            </div>
          </details>
        </div>
      </div>
    </>
  )
}

/**
 * One trip, as a card: who is on it, how much has gone through it, and the
 * only number the reader actually wants — where they stand — in words.
 */
function TripCard({ trip, me }: { trip: Trip; me: string | undefined }) {
  const members = liveMembers(trip)
  const totals = computeTotals(trip)
  const mine = me ? totals.balances.find((b) => b.memberId === me) : undefined

  let verdictNode
  if (!mine) {
    // A trip you imported has no "me" yet, and showing ₹0.00 there would read
    // as "you are square" when the truth is "nobody has told the app who you
    // are".
    verdictNode = <span className="verdict ask">Who are you? Tap to pick</span>
  } else {
    const v = verdict(mine.netMinor)
    verdictNode = (
      <span className={`verdict ${v.tone}`}>
        {v.label}
        {mine.netMinor !== 0 && (
          <>
            {' '}
            <span className="num">{formatMoney(Math.abs(mine.netMinor), trip.currency)}</span>
          </>
        )}
      </span>
    )
  }

  return (
    <button className="trip-card" onClick={() => navigate(`/trip/${trip.id}`)}>
      <div className="top">
        <span className="name">{trip.name}</span>
        <Icon name="chevron" size={18} className="chev" />
      </div>
      <div className="mid">
        <AvatarStack members={members} />
        <span className="facts">
          {countOf(members.length, 'person', 'people')} ·{' '}
          {countOf(liveExpenses(trip).length, 'expense', 'expenses')}
          <span className="when">
            <Icon name="clock" size={12} />
            {timeAgo(lastActivity(trip), Date.now())}
          </span>
        </span>
      </div>
      <div className="bottom">
        {verdictNode}
        <span className="spent num">{formatMoney(totals.totalSpentMinor, trip.currency)} spent</span>
      </div>
    </button>
  )
}

/** When anything on the trip last changed, on any phone. */
function lastActivity(trip: Trip): number {
  let at = trip.updatedAt
  for (const e of Object.values(trip.expenses)) at = Math.max(at, e.updatedAt)
  for (const s of Object.values(trip.settlements)) at = Math.max(at, s.updatedAt)
  for (const m of Object.values(trip.members)) at = Math.max(at, m.updatedAt)
  return at
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
              <span className="kicker">Across {countOf(r.trips, 'trip', 'trips')}</span>
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
        <Empty icon="sparkle" title="Split a trip in three steps">
          Log who paid for what, and the app works out who owes whom at the end.
        </Empty>
        <ol className="steps">
          <li>
            <span className="n">1</span>
            <div>
              <div className="s-title">Create a trip and add everyone going</div>
              <div className="s-body">One person does this, so the group shares one trip.</div>
            </div>
          </li>
          <li>
            <span className="n">2</span>
            <div>
              <div className="s-title">Send the group the share code</div>
              <div className="s-body">
                They import it once. From then on every phone stays in step by itself.
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
      <h2>New trip</h2>
      <div className="card pad">
        <Field
          label="Trip name"
          htmlFor={`${uid}-name`}
          error={tried && nameMissing ? 'Give the trip a name.' : null}
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
          hint="This is how you appear to everyone else on the trip."
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
          hint="One currency per trip. Convert before entering an expense."
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
