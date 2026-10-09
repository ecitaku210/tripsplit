import { useMemo, useState } from 'react'
import { todayISO, useStore, useTrip } from '../../storage/store'
import { closedPeriods, computeTotals, liveExpenses, liveMembers, liveSettlements } from '../../domain/balance'
import { isParty, settlementPlan } from '../../domain/settle'
import { counterpartyLabel, obligationsOf, standingSentence } from '../../domain/standing'
import { findProbableDuplicates, findProbableDuplicateSettlements } from '../../domain/merge'
import { unsyncableExpenses } from '../../domain/ledger'
import { formatMoney } from '../../domain/money'
import {
  Alert,
  Avatar,
  AvatarPair,
  Empty,
  Money,
  NotFound,
  Pill,
  Segmented,
  TopBar,
  UnknownAvatar,
  firstName,
  shortDate,
  verdict,
} from '../components'
import { Icon } from '../icons'
import { navigate } from '../router'
import { useToast } from '../toast'
import { dayLabel } from '../dates'
import { myLineOn } from '../expenseLines'
import { CATEGORIES, OTHER, categoryColor, categoryOf, type Category } from '../categories'
import type { Expense, Id, Member, Trip } from '../../domain/types'
import { useSyncStatus } from '../../sync/SyncProvider'
import type { SyncStatus } from '../../sync/engine'
import { countOf } from '../plural'
import { CloseBooks, PeriodNote, localIso } from './CloseBooks'

/**
 * Worded for someone standing at a till, not for a developer. The degraded
 * states all say the data is safe, because the first question a person has
 * on seeing "offline" is whether they just lost the expense.
 */
const SYNC: Record<
  SyncStatus,
  { label: string; tone: 'live' | 'busy' | 'warn' | 'bad'; note?: string }
> = {
  connecting: { label: 'Connecting…', tone: 'busy' },
  live: { label: 'Live', tone: 'live' },
  saving: { label: 'Saving…', tone: 'busy' },
  offline: {
    label: 'Offline',
    tone: 'warn',
    note: 'Saved on this phone. It uploads by itself when signal returns.',
  },
  'too-large': {
    label: 'Too big to sync',
    tone: 'warn',
    note: 'This group has outgrown live sync. Pass updates on with Invite & share.',
  },
  outdated: {
    label: 'Update needed',
    tone: 'bad',
    note: 'Someone saved this group with a newer version. Close the app fully and open it again.',
  },
  locked: {
    label: 'Locked',
    tone: 'bad',
    note: 'This phone does not have the group’s code, so it is not getting updates. Ask anyone in the group for the link.',
  },
  quota: {
    label: 'Daily limit',
    tone: 'warn',
    note: 'The free daily sync limit is used up. Saved on this phone; syncing resumes after the reset at 12:30 pm IST.',
  },
  error: {
    label: 'Sync problem',
    tone: 'bad',
    note: 'Saved on this phone. The app keeps retrying by itself.',
  },
}

type Tab = 'expenses' | 'balances'

export function TripScreen({ tripId }: { tripId: Id }) {
  const trip = useTrip(tripId)
  const { db } = useStore()
  const [tab, setTab] = useState<Tab>('expenses')
  const sync = useSyncStatus(tripId)

  if (!trip) return <NotFound what="trip" />
  const members = liveMembers(trip)
  const me = db.identities[trip.id]

  return (
    <>
      <TopBar
        title={trip.name}
        subtitle={countOf(members.length, 'person', 'people')}
        onBack
        backTo="/"
        backLabel="Groups"
        right={
          <span className="right-group">
            <button
              className="btn ghost icon"
              onClick={() => navigate(`/trip/${tripId}/share`)}
              aria-label="Invite & share"
            >
              <Icon name="share" size={18} />
              Share
            </button>
            <button
              className="btn ghost icon"
              onClick={() => navigate(`/trip/${tripId}/people`)}
              aria-label="People in this group"
            >
              <Icon name="users" size={18} />
              People
            </button>
          </span>
        }
      />
      <div className="content">
        <CutOff trip={trip} sync={sync} />
        <div className="section">
          <BalanceHero trip={trip} me={me} sync={sync} />
        </div>

        <Warnings trip={trip} />

        <div className="section">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'expenses', label: 'Expenses' },
              { value: 'balances', label: 'Balances' },
            ]}
          />
        </div>

        {tab === 'expenses' ? <ExpensesTab trip={trip} me={me} /> : <BalancesTab trip={trip} />}
      </div>

      {/*
        The two things people do most, side by side at the thumb: log a
        shared cost, or say that money changed hands. Before, recording a
        payment meant knowing it lived at the bottom of Settle up.
      */}
      <div className="fab-bar">
        <button className="btn primary fab" onClick={() => navigate(`/trip/${tripId}/expense/new`)}>
          <Icon name="plus" size={20} />
          Add expense
        </button>
        <button className="btn fab secondary" onClick={() => navigate(`/trip/${tripId}/repay`)}>
          <Icon name="handshake" size={20} />
          Paid someone
        </button>
      </div>
    </>
  )
}

/**
 * The one number the reader came for — where they stand — as a sentence, with
 * the total spent and the sync state beside it. Everything else on the screen
 * is detail.
 */
function BalanceHero({
  trip,
  me,
  sync,
}: {
  trip: Trip
  me: Id | undefined
  sync: SyncStatus | null
}) {
  const { db, setMyself, unarchiveTrip } = useStore()
  const { show: toast } = useToast()
  const totals = useMemo(() => computeTotals(trip), [trip])
  const members = liveMembers(trip)
  const mine = me ? totals.balances.find((b) => b.memberId === me) : undefined
  // The same plan Settle up shows, so the names here and there always agree.
  const plan = useMemo(() => settlementPlan(totals.balances), [totals])
  const nameOf = (id: Id) => (trip.members[id] ? firstName(trip.members[id]!.name) : 'someone')
  // When the phone is cut off, the card above says it in full; no echo here.
  const note = sync && !isCutOff(sync) ? SYNC[sync].note : undefined

  return (
    <div className="hero compact">
      <div className="head">
        <p className="kicker">Your balance</p>
        {sync && <Pill tone={SYNC[sync].tone}>{SYNC[sync].label}</Pill>}
      </div>
      {mine ? (
        <>
          <p className={`headline num ${verdict(mine.netMinor).tone}`}>
            {mine.netMinor === 0
              ? 'All settled'
              : formatMoney(Math.abs(mine.netMinor), trip.currency)}
          </p>
          {/*
            Who, not "the group": a person can act on "Pay Bhavya ₹11.50"
            and cannot act on "you owe the group".
          */}
          <p className="lede">{standingSentence(obligationsOf(plan, me!), nameOf, trip.currency)}</p>
        </>
      ) : (
        <>
          <p className="headline ask">Which person is you?</p>
          <p className="lede">
            Until you say, expenses default to the wrong person and your balance shows as zero.
          </p>
          {/*
            After importing a trip there is no way for the app to know which
            member the new phone belongs to, so it asks once, up front.
          */}
          {members.length > 0 && (
            <select
              value=""
              aria-label="Which person is you?"
              onChange={(e) => {
                if (!e.target.value) return
                setMyself(trip.id, e.target.value)
                // The one line that closes the loop for someone who just joined.
                toast('You’re in. Expenses you add reach everyone in the group.')
              }}
            >
              <option value="">Choose your name…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </>
      )}
      {note && <p className="note">{note}</p>}
      {/*
        One small link, not a button block: the sentence above already says
        what to do, and the two big buttons at the thumb do the daily work.
      */}
      {mine && mine.netMinor !== 0 && members.length > 1 && (
        <div className="actions">
          <button className="btn icon" onClick={() => navigate(`/trip/${trip.id}/settle`)}>
            <Icon name="handshake" size={16} />
            {mine.netMinor < 0 ? 'Settle up' : 'See who pays you'}
          </button>
        </div>
      )}
      <PeriodNote trip={trip} />
      {db.archived[trip.id] && (
        <Alert tone="info">
          <strong>Archived on this phone.</strong> Not checking for updates.{' '}
          <button className="link stand" onClick={() => unarchiveTrip(trip.id)}>
            Bring it back
          </button>
        </Alert>
      )}
    </div>
  )
}

/** States in which this phone neither receives nor sends: the group has moved on without it. */
export function isCutOff(sync: SyncStatus | null): sync is 'locked' | 'outdated' {
  return sync === 'locked' || sync === 'outdated'
}

/**
 * When this phone is cut off from the group, say so in words, say what it
 * costs, and give the one-tap way out. A small pill in the balance card was
 * too easy to miss, and the balances under it still looked current.
 *
 * Locked: the group is encrypted with a code this phone lacks (typically
 * because encryption was turned on after it joined). Opening a fresh invite
 * link carries the code, unlocks the group and catches up.
 * Outdated: someone saved the group with a newer app; reloading picks up the
 * new version, which the service worker installs on load.
 */
function CutOff({ trip, sync }: { trip: Trip; sync: SyncStatus | null }) {
  const { show: toast } = useToast()
  if (!isCutOff(sync)) return null

  if (sync === 'outdated') {
    return (
      <div className="section">
        <div className="cutoff" role="alert">
          <div className="cutoff-head">
            <Icon name="refresh" size={20} />
            <strong>This phone needs the new version</strong>
          </div>
          <p>
            Someone saved this group with a newer TripSplit. Until this phone updates, their
            expenses do not reach you and yours do not reach them.
          </p>
          <button className="btn primary block" onClick={() => window.location.reload()}>
            <Icon name="refresh" size={18} />
            Update now
          </button>
        </div>
      </div>
    )
  }

  const ask = `Hi! TripSplit shows "Locked" for ${trip.name} on my phone. Can you open the group, tap Share and send me the link?`
  async function askForLink() {
    if (navigator.share) {
      try {
        await navigator.share({ text: ask })
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(ask)
      toast('Message copied. Paste it to anyone in the group.')
    } catch {
      toast('Ask anyone in the group to open it, tap Share and send you the link.')
    }
  }

  return (
    <div className="section">
      <div className="cutoff" role="alert">
        <div className="cutoff-head">
          <Icon name="lock" size={20} />
          <strong>This phone is not getting updates</strong>
        </div>
        <p>
          The group is locked with a code this phone does not have. Expenses others add do not
          reach you, and yours do not reach them, so the numbers below may be out of date.
        </p>
        <ol className="steps">
          <li>
            <span className="n">1</span>
            <div>
              <div className="s-title">Ask anyone in the group for the link</div>
              <div className="s-body">They open the group and tap Share.</div>
            </div>
          </li>
          <li>
            <span className="n">2</span>
            <div>
              <div className="s-title">Open the link on this phone</div>
              <div className="s-body">The group unlocks and catches up by itself.</div>
            </div>
          </li>
        </ol>
        <div className="btn-row">
          <button className="btn primary" onClick={() => void askForLink()}>
            <Icon name="share" size={18} />
            Ask for the link
          </button>
          <button className="btn" onClick={() => navigate('/import')}>
            <Icon name="download" size={18} />
            I have the link
          </button>
        </div>
      </div>
    </div>
  )
}

/** Things the user must see: broken records and likely double entries. */
function Warnings({ trip }: { trip: Trip }) {
  const totals = useMemo(() => computeTotals(trip), [trip])
  const duplicates = useMemo(() => findProbableDuplicates(trip), [trip])
  const doubledRepayments = useMemo(() => findProbableDuplicateSettlements(trip), [trip])
  const unsyncable = useMemo(() => unsyncableExpenses(trip), [trip])

  if (
    totals.problems.length === 0 &&
    duplicates.length === 0 &&
    doubledRepayments.length === 0 &&
    unsyncable.length === 0
  ) {
    return null
  }

  return (
    <div className="section">
      {unsyncable.length > 0 && (
        <Alert tone="bad">
          <strong>
            {unsyncable.length === 1
              ? '1 expense is not reaching anyone else’s phone'
              : `${unsyncable.length} expenses are not reaching anyone else’s phone`}
          </strong>
          , so balances differ between phones. Usually it has no date — look for{' '}
          <strong>No date</strong> in the list. Open it, pick a date and save.
        </Alert>
      )}
      {doubledRepayments.length > 0 && (
        <Alert tone="warn">
          <strong>Possible double payment.</strong> The same payment was recorded on two
          phones, so it counts twice. If it was only paid once, delete one of them under{' '}
          <strong>Payments</strong>.
        </Alert>
      )}
      {totals.problems.length > 0 && (
        <Alert tone="bad">
          {countOf(totals.problems.length, 'expense', 'expenses')} could not be added up and{' '}
          {totals.problems.length === 1 ? 'is' : 'are'} being left out of every balance. Open and
          re-save {totals.problems.length === 1 ? 'it' : 'them'} to fix.
        </Alert>
      )}
      {duplicates.length > 0 && (
        <Alert tone="warn">
          <strong>
            {duplicates.length} possible double entry
            {duplicates.length > 1 ? ' groups' : ''}.
          </strong>{' '}
          Two phones logged the same amount, on the same day, paid by the same person. Check the
          expense list and delete whichever is the copy — nothing is removed automatically.
        </Alert>
      )}
    </div>
  )
}

interface Day {
  date: string
  totalMinor: number
  expenses: Expense[]
}

/** Consecutive expenses on the same date, in the order given. */
function groupByDay(expenses: Expense[]): Day[] {
  const days: Day[] = []
  for (const e of expenses) {
    const last = days[days.length - 1]
    if (last && last.date === e.date) {
      last.expenses.push(e)
      last.totalMinor += e.amountMinor
    } else {
      days.push({ date: e.date, totalMinor: e.amountMinor, expenses: [e] })
    }
  }
  return days
}

/**
 * Closed periods: every stretch that ended with "Close the books", newest
 * first, folded away. Each opens to its expenses and repayments, read-only,
 * with a Reopen for the newest in case the closing was a slip.
 */
function ClosedPeriods({ trip }: { trip: Trip }) {
  const { reopenBooks, closeBooks } = useStore()
  const { show: toast } = useToast()
  const periods = useMemo(() => closedPeriods(trip), [trip])
  if (periods.length === 0) return null
  const shortName = (id: Id) => (trip.members[id] ? firstName(trip.members[id]!.name) : 'Someone')
  return (
    <div className="section">
      <div className="section-head">
        <h2>Closed periods</h2>
        <span className="aside">{countOf(periods.length, 'period', 'periods')}</span>
      </div>
      {periods.map((p, i) => {
        const closedOn = shortDate(localIso(p.closing.at))
        const square = p.totals.balances.every((b) => b.netMinor === 0)
        return (
          <details key={p.closing.id} className="howto period">
            <summary>
              <Icon name="flag" size={18} />
              <span className="grow">
                Closed {closedOn}
                <span className="dim"> · {countOf(p.expenses.length, 'expense', 'expenses')}</span>
              </span>
              <span className="num">{formatMoney(p.totals.totalSpentMinor, trip.currency)}</span>
              <Icon name="chevron" size={18} className="chev" />
            </summary>
            <div className="body">
              {!square && (
                <Alert tone="warn">
                  This period is not square: something arrived after the books were closed.
                  Reopen it and close again once everyone has settled.
                </Alert>
              )}
              <div className="card">
                {p.expenses.map((e) => (
                  <button
                    key={e.id}
                    className="row"
                    onClick={() => navigate(`/trip/${trip.id}/expense/${e.id}`)}
                  >
                    {trip.members[e.paidBy] ? (
                      <Avatar member={trip.members[e.paidBy]!} group={trip.members} small />
                    ) : (
                      <UnknownAvatar small />
                    )}
                    <div className="grow">
                      <div className="title">{e.description || 'Expense'}</div>
                      <div className="meta">
                        {shortDate(e.date)} · {shortName(e.paidBy)} paid
                      </div>
                    </div>
                    <div className="amount">
                      <Money amount={e.amountMinor} currency={trip.currency} />
                    </div>
                  </button>
                ))}
                {p.settlements.map((s) => (
                  <div key={s.id} className="row static">
                    <AvatarPair group={trip.members} from={trip.members[s.fromMember]} to={trip.members[s.toMember]} />
                    <div className="grow">
                      <div className="title pay-line">
                        <span>{shortName(s.fromMember)}</span>
                        <Icon name="arrow" size={16} className="arrow" />
                        <span>{shortName(s.toMember)}</span>
                      </div>
                      <div className="meta">{shortDate(s.date)} · payment</div>
                    </div>
                    <div className="amount">
                      <Money amount={s.amountMinor} currency={trip.currency} />
                    </div>
                  </div>
                ))}
              </div>
              {i === 0 && (
                <button
                  className="btn ghost block"
                  onClick={() => {
                    const id = p.closing.id
                    reopenBooks(trip.id, id)
                    toast('Books reopened. This period counts again.', {
                      action: {
                        label: 'Undo',
                        onClick: () => {
                          // Re-closing at the same moment keeps the same boundary.
                          closeBooks(trip.id)
                        },
                      },
                    })
                  }}
                >
                  <Icon name="refresh" size={16} />
                  Reopen this period
                </button>
              )}
            </div>
          </details>
        )
      })}
    </div>
  )
}

function ExpensesTab({ trip, me }: { trip: Trip; me: Id | undefined }) {
  const { db, deleteSettlement, restoreSettlement } = useStore()
  const members = useMemo(() => liveMembers(trip), [trip])
  const { show: toast } = useToast()
  const expenses = useMemo(() => liveExpenses(trip), [trip])
  // liveExpenses is already newest-first by date, so grouping is one pass.
  const days = useMemo(() => groupByDay(expenses), [expenses])
  const today = todayISO()
  const settlements = useMemo(() => liveSettlements(trip), [trip])
  const nameOf = (id: Id) => trip.members[id]?.name ?? 'Someone (removed)'
  const shortName = (id: Id) => (trip.members[id] ? firstName(trip.members[id]!.name) : 'Someone')

  const periods = useMemo(() => closedPeriods(trip), [trip])

  if (expenses.length === 0 && settlements.length === 0) {
    return (
      <>
        {periods.length ? (
          <Empty icon="receipt" title="Fresh count">
            The books were closed on <strong>{shortDate(localIso(periods[0]!.closing.at))}</strong>.
            Anything added now starts from zero.
          </Empty>
        ) : (
          <GettingStarted trip={trip} members={members} shared={trip.id in db.shared} />
        )}
        <ClosedPeriods trip={trip} />
      </>
    )
  }

  return (
    <>
      {expenses.length > 0 && (
        <div className="section">
          {/*
            One card per day, headed "Today" / "Yesterday" / "22 Sep", with
            that day's total on the right. A flat list of forty rows reads as
            a spreadsheet; days read as the trip.
          */}
          {days.map((day) => (
            <div key={day.date} className="day">
              <div className="day-head">
                <span className={day.date ? '' : 'bad'}>{dayLabel(day.date, today)}</span>
                <span className="num">{formatMoney(day.totalMinor, trip.currency)}</span>
              </div>
              <div className="card">
                {day.expenses.map((e) => {
                  const payer = trip.members[e.paidBy]
                  const line = myLineOn(e, me, trip.currency)
                  return (
                    <button
                      key={e.id}
                      className="row"
                      onClick={() => navigate(`/trip/${trip.id}/expense/${e.id}`)}
                    >
                      {payer ? <Avatar member={payer} group={trip.members} /> : <UnknownAvatar />}
                      <div className="grow">
                        <div className="title">
                          {e.description || 'Expense'}
                          {e.paidBy === me && <span className="chip tiny accent">you paid</span>}
                        </div>
                        <div className="meta">
                          <Icon name={categoryOf(e.description).icon} size={12} className="cat" />
                          {shortName(e.paidBy)} paid
                          {/* Show the exception, not the norm: only when not everyone is in. */}
                          {e.parts.length < members.length && ` · ${e.parts.length} of ${members.length}`}
                        </div>
                      </div>
                      <div className="amount">
                        <Money amount={e.amountMinor} currency={trip.currency} />
                        {line && <span className={`minor num ${line.tone}`}>{line.text}</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {settlements.length > 0 && (
        <div className="section">
          <h2>Payments</h2>
          <div className="card">
            {settlements.map((s) => (
              <div key={s.id} className="row static">
                <AvatarPair group={trip.members} from={trip.members[s.fromMember]} to={trip.members[s.toMember]} />
                <div className="grow">
                  <div className="title pay-line">
                    <span>{shortName(s.fromMember)}</span>
                    <Icon name="arrow" size={16} className="arrow" />
                    <span>{shortName(s.toMember)}</span>
                  </div>
                  <div className="meta">
                    {shortDate(s.date)}
                    {s.note ? ` · ${s.note}` : ''}
                  </div>
                </div>
                <div className="amount">
                  <Money amount={s.amountMinor} currency={trip.currency} />
                  {/*
                    Without this a mistaken or doubled Record tap was permanent:
                    there was no way at all to take a repayment back. It sits
                    under the amount so the names keep the width they need.
                  */}
                  <button
                    className="btn ghost icon-only"
                    aria-label={`Delete payment ${nameOf(s.fromMember)} to ${nameOf(s.toMember)}`}
                    onClick={() => {
                      // Only the payer or the receiver may take a repayment
                      // back; anyone else is told so and nothing changes.
                      if (!isParty(me, s)) {
                        toast(
                          `Only ${shortName(s.fromMember)} or ${shortName(s.toMember)} can delete this payment.`,
                        )
                        return
                      }
                      deleteSettlement(trip.id, s.id)
                      toast(`Deleted payment ${shortName(s.fromMember)} → ${shortName(s.toMember)}`, {
                        action: { label: 'Undo', onClick: () => restoreSettlement(trip.id, s.id) },
                      })
                    }}
                  >
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ClosedPeriods trip={trip} />
    </>
  )
}

function BalancesTab({ trip }: { trip: Trip }) {
  const { db } = useStore()
  const totals = useMemo(() => computeTotals(trip), [trip])
  const plan = useMemo(() => settlementPlan(totals.balances), [totals])
  const nameOf = (id: Id) => (trip.members[id] ? firstName(trip.members[id]!.name) : 'someone')
  const me = db.identities[trip.id]
  const settled = totals.balances.every((b) => b.netMinor === 0)
  // The balance card already links to Settle up when the reader owes or is
  // owed; this list offers it only when the card does not.
  const mineNet = totals.balances.find((b) => b.memberId === me)?.netMinor ?? 0
  // Rows opened by a tap, showing how the number came about.
  const [open, setOpen] = useState<Set<Id>>(() => new Set())

  if (totals.balances.length === 0 || liveMembers(trip).length < 2) {
    return (
      <>
        <Empty icon="users" title="Just you so far">
          Add the others, and this shows who owes whom.
        </Empty>
        <div className="section">
          <button className="btn block" onClick={() => navigate(`/trip/${trip.id}/people`)}>
            <Icon name="users" size={18} />
            Add people
          </button>
        </div>
      </>
    )
  }

  // The longest bar is the largest debt or credit; everyone else is drawn
  // relative to it, so the picture says "who carried this group" at a glance.
  const scale = Math.max(1, ...totals.balances.map((b) => Math.abs(b.netMinor)))

  return (
    <div className="section">
      <div className="card">
        {totals.balances.map((b) => {
          const member = trip.members[b.memberId]
          const label = counterpartyLabel(obligationsOf(plan, b.memberId), nameOf)
          const tone = b.netMinor > 0 ? 'pos' : b.netMinor < 0 ? 'neg' : 'zero'
          const width = Math.round((Math.abs(b.netMinor) / scale) * 100)
          const isOpen = open.has(b.memberId)
          return (
            <button
              key={b.memberId}
              className={`row balance-row${isOpen ? ' open' : ''}`}
              aria-expanded={isOpen}
              onClick={() =>
                setOpen((prev) => {
                  const next = new Set(prev)
                  if (next.has(b.memberId)) next.delete(b.memberId)
                  else next.add(b.memberId)
                  return next
                })
              }
            >
              {member ? <Avatar member={member} group={trip.members} /> : <UnknownAvatar />}
              <div className="grow">
                <div className="title">
                  {member?.name ?? 'Someone (removed)'}
                  {b.memberId === me && <span className="chip tiny accent">you</span>}
                  {member?.deletedAt != null && <span className="chip tiny">removed</span>}
                </div>
                <div className="meta">{label}</div>
                <div className="detail">
                  paid <Money amount={b.paidMinor} currency={trip.currency} /> · used{' '}
                  <Money amount={b.owedMinor} currency={trip.currency} />
                  <div className={`bar ${tone}`} aria-hidden="true">
                    <span style={{ width: `${Math.max(width, b.netMinor === 0 ? 0 : 3)}%` }} />
                  </div>
                </div>
              </div>
              <div className="amount">
                <Money amount={b.netMinor} currency={trip.currency} signed />
              </div>
              <Icon name="chevron" size={16} className="chev" />
            </button>
          )
        })}
      </div>
      {plan.length > 0 && mineNet === 0 && (
        <>
          <div className="spacer" />
          <button className="btn block" onClick={() => navigate(`/trip/${trip.id}/settle`)}>
            <Icon name="handshake" size={18} />
            Settle up
          </button>
        </>
      )}
      {settled && (
        <div style={{ marginTop: 10 }}>
          <CloseBooks trip={trip} />
        </div>
      )}

      <SpendByCategory trip={trip} />
    </div>
  )
}

/**
 * Where the money went, from the categories guessed off each description.
 * A stacked bar and a short legend, largest first. Nothing is stored; every
 * phone derives the same picture from the same descriptions.
 */
function SpendByCategory({ trip }: { trip: Trip }) {
  const rows = useMemo(() => {
    const sums = new Map<Category, number>()
    let total = 0
    for (const e of liveExpenses(trip)) {
      const c = categoryOf(e.description)
      sums.set(c, (sums.get(c) ?? 0) + e.amountMinor)
      total += e.amountMinor
    }
    const order = [...CATEGORIES, OTHER]
    return {
      total,
      items: [...sums.entries()]
        .sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))
        .map(([c, minor]) => ({ c, minor, pct: total ? Math.round((minor / total) * 100) : 0 })),
    }
  }, [trip])

  if (rows.total === 0) return null

  // Folded: the total is the one number people glance at; the breakdown is
  // for the curious.
  return (
    <details className="howto" style={{ marginTop: 16 }}>
      <summary>
        <Icon name="tag" size={18} />
        <span className="grow">Where the money went</span>
        <span className="num">{formatMoney(rows.total, trip.currency)}</span>
        <Icon name="chevron" size={18} className="chev" />
      </summary>
      <div className="body">
        <div className="spend-bar" aria-hidden="true">
          {rows.items.map(({ c, minor }) => (
            <span
              key={c.id}
              style={{ width: `${(minor / rows.total) * 100}%`, background: categoryColor(c) }}
            />
          ))}
        </div>
        <div className="card">
          {rows.items.map(({ c, minor, pct }) => (
            <div key={c.id} className="spend-row">
              <span className="swatch" style={{ background: categoryColor(c) }}>
                <Icon name={c.icon} size={15} />
              </span>
              <span className="label">{c.label}</span>
              <span className="pct num">{pct}%</span>
              <Money amount={minor} currency={trip.currency} />
            </div>
          ))}
        </div>
      </div>
    </details>
  )
}

/**
 * A fresh group's first screen: the three things that make it work, each a
 * button, each ticked as it happens. It is the empty state, so it costs a
 * running group nothing and vanishes for good with the first expense.
 */
function GettingStarted({ trip, members, shared }: { trip: Trip; members: Member[]; shared: boolean }) {
  const peopleDone = members.length > 1
  const steps: { label: string; sub: string; done: boolean; to: string; icon: 'users' | 'share' | 'plus' }[] = [
    { label: 'Add the people', sub: peopleDone ? countOf(members.length, 'person', 'people') : 'Everyone who shares costs', done: peopleDone, to: `/trip/${trip.id}/people`, icon: 'users' },
    { label: 'Share the link', sub: shared ? 'Sent' : 'They tap it once and stay in step', done: shared, to: `/trip/${trip.id}/share`, icon: 'share' },
    { label: 'Log the first expense', sub: 'Five seconds at the till', done: false, to: `/trip/${trip.id}/expense/new`, icon: 'plus' },
  ]
  return (
    <div className="section">
      <h2>Getting started</h2>
      <div className="card starter">
        {steps.map((s, i) => (
          <button key={s.label} className={`row${s.done ? ' done' : ''}`} onClick={() => navigate(s.to)}>
            <span className="tick" aria-hidden="true">
              {s.done ? <Icon name="check" size={16} /> : i + 1}
            </span>
            <div className="grow">
              <div className="title">{s.label}</div>
              <div className="meta">{s.sub}</div>
            </div>
            <Icon name={s.done ? 'check' : 'chevron'} size={18} className="chev" />
          </button>
        ))}
      </div>
    </div>
  )
}
