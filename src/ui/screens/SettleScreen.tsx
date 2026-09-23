import { useMemo, useState } from 'react'
import { todayISO, useStore, useTrip } from '../../storage/store'
import { computeTotals, liveMembers } from '../../domain/balance'
import { settlementPlan } from '../../domain/settle'
import { formatMinor, formatMoney, parseAmount } from '../../domain/money'
import { amountInWords } from '../../domain/words'
import { Alert, AvatarPair, Empty, Money, NotFound, TopBar, firstName } from '../components'
import { Icon } from '../icons'
import { tap } from '../haptics'
import { back } from '../router'
import type { Id, Minor } from '../../domain/types'

interface Recorded {
  fromName: string
  toName: string
  amountMinor: Minor
}

export function SettleScreen({ tripId }: { tripId: Id }) {
  const trip = useTrip(tripId)
  const { addSettlement } = useStore()
  /**
   * Recording a payment changes the balances, so that transfer immediately
   * drops out of the plan below. Without this list the row would simply
   * vanish under the user's thumb with no confirmation that anything
   * happened — so the receipt is kept here and shown back to them.
   */
  const [recorded, setRecorded] = useState<Recorded[]>([])

  const totals = useMemo(() => (trip ? computeTotals(trip) : null), [trip])
  const plan = useMemo(() => (totals ? settlementPlan(totals.balances) : []), [totals])

  if (!trip) return <NotFound what="trip" />

  const nameOf = (id: Id) => trip.members[id]?.name ?? 'Someone (removed)'
  const shortName = (id: Id) => (trip.members[id] ? firstName(trip.members[id]!.name) : 'Someone')

  return (
    <>
      <TopBar
        title="Settle up"
        subtitle="The fewest payments that make everyone square"
        onBack
        backTo={`/trip/${tripId}`}
        backLabel={trip.name}
      />
      <div className="content no-fab">
        {recorded.length > 0 && (
          <div className="section">
            <Alert tone="good">
              <strong>Recorded:</strong>
              {recorded.map((r, i) => (
                <div key={i}>
                  {r.fromName} → {r.toName} ·{' '}
                  <Money amount={r.amountMinor} currency={trip.currency} />
                </div>
              ))}
              <div className="spacer" />
              Everyone else sees these as soon as this phone has signal.
            </Alert>
          </div>
        )}

        {plan.length === 0 ? (
          <Empty icon="check" title="Nothing to settle">
            Everyone is square. If anyone has been offline, check again once they reconnect so
            their latest expenses are included.
          </Empty>
        ) : (
          <>
            <div className="section">
              <div className="hero">
                <p className="kicker">The plan</p>
                <p className="headline zero">
                  {plan.length} payment{plan.length > 1 ? 's' : ''}
                </p>
                <p className="lede">
                  {plan.length === 1 ? 'clears' : 'clear'} the whole group. Instead of everyone
                  paying everyone, the debts are netted off first.
                </p>
              </div>
            </div>

            <div className="section">
              <h2>Who pays whom</h2>
              <div className="card">
                {plan.map((t) => {
                  return (
                  <div key={`${t.fromMember}>${t.toMember}`} className="row static">
                    <AvatarPair from={trip.members[t.fromMember]} to={trip.members[t.toMember]} />
                    <div className="grow">
                      <div className="title pay-line">
                        <span>{shortName(t.fromMember)}</span>
                        <Icon name="arrow" size={16} className="arrow" />
                        <span>{shortName(t.toMember)}</span>
                      </div>
                      <div className="meta">{shortName(t.fromMember)} pays {shortName(t.toMember)}</div>
                    </div>
                    <div className="amount">
                      <Money amount={t.amountMinor} currency={trip.currency} />
                    <button
                      className="btn icon"
                      onClick={() => {
                        tap()
                        addSettlement(tripId, {
                          fromMember: t.fromMember,
                          toMember: t.toMember,
                          amountMinor: t.amountMinor,
                          date: todayISO(),
                          note: 'Settle up',
                        })
                        setRecorded((prev) => [
                          ...prev,
                          {
                            fromName: nameOf(t.fromMember),
                            toName: nameOf(t.toMember),
                            amountMinor: t.amountMinor,
                          },
                        ])
                      }}
                    >
                      <Icon name="check" size={16} />
                      Record
                    </button>
                    </div>
                  </div>
                  )
                })}
              </div>
              <p className="hint">
                Tap <strong>Record</strong> only once the money has actually changed hands, and only
                on one phone. It reaches everyone else as soon as this phone has signal.
              </p>
            </div>
          </>
        )}

        <ManualRepayment tripId={tripId} />

        <div className="spacer" />
        <button className="btn block ghost" onClick={() => back(`/trip/${tripId}`)}>
          Back to trip
        </button>
      </div>
    </>
  )
}

function ManualRepayment({ tripId }: { tripId: Id }) {
  const trip = useTrip(tripId)
  const { addSettlement } = useStore()
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState<Id>('')
  const [to, setTo] = useState<Id>('')
  const [amount, setAmount] = useState('')

  // Sorted the same way as every other member list in the app, so the order
  // does not shuffle between screens.
  const members = useMemo(() => (trip ? liveMembers(trip) : []), [trip])

  if (!trip) return null
  const decimals = trip.currency.decimals
  const minor = amount.trim() === '' ? null : parseAmount(amount, decimals)

  // Resolved at render rather than in useState, because the member list is
  // not known on the very first render of a freshly imported trip.
  const fromId = from || members[0]?.id || ''
  const toId = to || members.find((m) => m.id !== fromId)?.id || ''
  const valid = fromId !== '' && toId !== '' && fromId !== toId && minor !== null && minor > 0

  if (!open) {
    return (
      <div className="section">
        <button className="btn block ghost" onClick={() => setOpen(true)}>
          <Icon name="plus" size={18} />
          Record a different repayment
        </button>
      </div>
    )
  }

  return (
    <div className="section">
      <h2>Record a repayment</h2>
      <div className="card pad">
      <div className="field">
        <label>Who paid</label>
        <select value={fromId} onChange={(e) => setFrom(e.target.value)}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Who received</label>
        <select value={toId} onChange={(e) => setTo(e.target.value)}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Amount ({trip.currency.code})</label>
        <input
          inputMode="decimal"
          className="num"
          value={amount}
          placeholder={formatMinor(0, decimals)}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      {fromId === toId && fromId !== '' && (
        <div className="error">Pick two different people.</div>
      )}
      {amount.trim() !== '' && minor === null && (
        <div className="error">That is not an amount this currency can hold.</div>
      )}
      {minor !== null && minor > 0 && (
        <p className="amount-words" aria-live="polite">
          <span className="num">{formatMoney(minor, trip.currency)}</span>
          {' · '}
          {amountInWords(minor, trip.currency)}
        </p>
      )}
      <div className="btn-row">
        <button className="btn ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={!valid}
          onClick={() => {
            if (minor === null) return
            addSettlement(tripId, {
              fromMember: fromId,
              toMember: toId,
              amountMinor: minor,
              date: todayISO(),
              note: '',
            })
            setAmount('')
            setOpen(false)
          }}
        >
          <Icon name="check" size={16} />
          Record
        </button>
      </div>
      </div>
    </div>
  )
}
