import { useId, useMemo, useRef, useState } from 'react'
import { todayISO, useStore, useTrip } from '../../storage/store'
import { liveMembers } from '../../domain/balance'
import { isParty } from '../../domain/settle'
import { formatMinor, formatMoney, parseAmount } from '../../domain/money'
import { amountInWords } from '../../domain/words'
import { Alert, NotFound, TopBar, firstName } from '../components'
import { Icon } from '../icons'
import { tap } from '../haptics'
import { back } from '../router'
import { useToast } from '../toast'
import type { Id } from '../../domain/types'

/**
 * "Paid someone? Record it": one screen for any money that changed hands
 * outside the Settle up plan — a part payment, or two people the plan did not
 * pair. Reached from the group screen (beside Add expense) and from Settle
 * up, so there is one form to learn rather than two.
 */
export function RepayScreen({ tripId }: { tripId: Id }) {
  const trip = useTrip(tripId)
  const { db, addSettlement } = useStore()
  const { show: toast } = useToast()
  const me = db.identities[tripId]
  const [from, setFrom] = useState<Id>('')
  const [to, setTo] = useState<Id>('')
  const [amount, setAmount] = useState('')
  const amountBox = useRef<HTMLInputElement>(null)
  const uid = useId()

  // Sorted the same way as every other member list in the app, so the order
  // does not shuffle between screens.
  const members = useMemo(() => (trip ? liveMembers(trip) : []), [trip])

  if (!trip) return <NotFound what="trip" />
  const decimals = trip.currency.decimals
  const minor = amount.trim() === '' ? null : parseAmount(amount, decimals)

  // Resolved at render rather than in useState, because the member list is
  // not known on the very first render of a freshly imported trip.
  // The reader is the likeliest payer, so they are the default.
  const fromId = from || (me && members.some((m) => m.id === me) ? me : members[0]?.id) || ''
  const toId = to || members.find((m) => m.id !== fromId)?.id || ''
  const party = isParty(me, { fromMember: fromId, toMember: toId })
  const valid = fromId !== '' && toId !== '' && fromId !== toId && minor !== null && minor > 0 && party
  const shortName = (id: Id) => (trip.members[id] ? firstName(trip.members[id]!.name) : 'Someone')

  return (
    <>
      <TopBar
        title="Record a payment"
        subtitle="Money that has already changed hands"
        onBack
        backTo={`/trip/${tripId}`}
        backLabel={trip.name}
      />
      <div className="content no-fab">
        {!me && (
          <div className="section">
            <Alert tone="info">
              <strong>Pick who you are</strong> under People first. Only the two people in a
              payment can record it.
            </Alert>
          </div>
        )}
        <div className="section">
          <div className="card pad">
            <div className="field">
              <label htmlFor={`${uid}-from`}>Who paid</label>
              <select id={`${uid}-from`} value={fromId} onChange={(e) => setFrom(e.target.value)}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${uid}-to`}>Who received</label>
              <select id={`${uid}-to`} value={toId} onChange={(e) => setTo(e.target.value)}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${uid}-amount`}>Amount ({trip.currency.code})</label>
              <input
                id={`${uid}-amount`}
                ref={amountBox}
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
            {fromId !== toId && !party && (
              <div className="error">
                {me
                  ? 'You can only record a payment you are part of. Pick yourself as who paid or who received.'
                  : 'Pick who you are under People before recording a payment.'}
              </div>
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
              <button className="btn ghost" onClick={() => back(`/trip/${tripId}`)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  // Never a dead button: a missing or bad amount gets the cursor.
                  // The two-people mistake already shows its own message above.
                  if (!valid) {
                    if (minor === null || minor <= 0) amountBox.current?.focus()
                    tap()
                    return
                  }
                  if (minor === null) return
                  addSettlement(tripId, {
                    fromMember: fromId,
                    toMember: toId,
                    amountMinor: minor,
                    date: todayISO(),
                    note: '',
                  })
                  toast(
                    `Recorded ${shortName(fromId)} → ${shortName(toId)} ${formatMoney(minor, trip.currency)}`,
                  )
                  back(`/trip/${tripId}`)
                }}
              >
                <Icon name="check" size={16} />
                Record
              </button>
            </div>
          </div>
          <p className="hint">
            A part payment is fine: the balances shrink by what was paid.
          </p>
        </div>
      </div>
    </>
  )
}
