import { useMemo, useState } from 'react'
import { todayISO, useStore, useTrip } from '../../storage/store'
import { computeTotals } from '../../domain/balance'
import { isParty, settlementPlan } from '../../domain/settle'
import { Alert, AvatarPair, Empty, Money, NotFound, TopBar, firstName } from '../components'
import { Icon } from '../icons'
import { tap } from '../haptics'
import { back, navigate } from '../router'
import { CloseBooks } from './CloseBooks'
import type { Id, Minor } from '../../domain/types'

interface Recorded {
  fromName: string
  toName: string
  amountMinor: Minor
}

export function SettleScreen({ tripId }: { tripId: Id }) {
  const trip = useTrip(tripId)
  const { db, addSettlement } = useStore()
  const me = db.identities[tripId]
  /**
   * Recording a payment changes the balances, so that transfer immediately
   * drops out of the plan below. Without this list the row would simply
   * vanish under the user's thumb with no confirmation that anything
   * happened — so the receipt is kept here and shown back to them.
   */
  const [recorded, setRecorded] = useState<Recorded[]>([])
  /**
   * A third person tapping Record gets told why nothing happened, right under
   * that row. Hiding the button would leave them wondering where it went.
   */
  const [refused, setRefused] = useState<string | null>(null)

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
          <>
            <Empty icon="check" title="Nothing to settle">
              Everyone is square. If anyone has been offline, check again once they reconnect so
              their latest expenses are included.
            </Empty>
            <div className="section">
              <CloseBooks trip={trip} onClosed={() => back(`/trip/${tripId}`)} />
            </div>
          </>
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

            {!me && (
              <div className="section">
                <Alert tone="info">
                  <strong>Pick who you are</strong> under People to record a payment. Only the two
                  people in a payment can record it.
                </Alert>
              </div>
            )}
            <div className="section">
              <h2>Who pays whom</h2>
              <div className="card">
                {plan.map((t) => {
                  const party = isParty(me, t)
                  const key = `${t.fromMember}>${t.toMember}`
                  return (
                  <div key={key} className="row static wrap">
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
                    {/*
                      Record belongs to the two people the money moves
                      between. A third phone still sees the button, so a tap
                      can explain why nothing happened instead of the button
                      being mysteriously missing. Nothing is written.
                    */}
                    <button
                      className={party ? 'btn icon' : 'btn icon muted'}
                      onClick={() => {
                        tap()
                        if (!party) {
                          setRefused(key)
                          return
                        }
                        setRefused(null)
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
                    {refused === key && (
                      <div className="error" role="alert">
                        {me
                          ? `Only ${shortName(t.fromMember)} or ${shortName(t.toMember)} can record this payment. Nothing was recorded.`
                          : 'Pick who you are under People first. Only the two people in a payment can record it.'}
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>
              <p className="hint">
                Tap <strong>Record</strong> only once the money has actually changed hands, and only
                on one phone. Only the two people in a payment can record it. It reaches everyone
                else as soon as this phone has signal.
              </p>
            </div>
          </>
        )}

        <div className="section">
          <button className="btn block ghost" onClick={() => navigate(`/trip/${tripId}/repay`)}>
            <Icon name="plus" size={18} />
            Paid someone? Record it
          </button>
        </div>

        <div className="spacer" />
        <button className="btn block ghost" onClick={() => back(`/trip/${tripId}`)}>
          Back to group
        </button>
      </div>
    </>
  )
}
