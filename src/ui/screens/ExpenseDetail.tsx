import { useMemo } from 'react'
import { useStore, useTrip } from '../../storage/store'
import { computeSplit } from '../../domain/split'
import { formatMoney } from '../../domain/money'
import { Alert, Avatar, Money, NotFound, TopBar, UnknownAvatar, firstName, shortDate } from '../components'
import { Icon } from '../icons'
import { navigate } from '../router'
import { myLineOn, splitModeLabel } from '../expenseLines'
import type { Id } from '../../domain/types'

/**
 * One expense, read-only: who paid, who owes what for THIS expense, and an
 * Edit button. Tapping a row used to drop the reader straight into a form,
 * which reads as "you are about to change something" when all they wanted
 * was to look. The form is one tap further now.
 */
export function ExpenseDetail({ tripId, expenseId }: { tripId: Id; expenseId: Id }) {
  const trip = useTrip(tripId)
  const { db } = useStore()
  const expense = trip?.expenses[expenseId]
  const split = useMemo(
    () => (expense ? computeSplit(expense.amountMinor, expense.splitMode, expense.parts) : null),
    [expense],
  )

  if (!trip) return <NotFound what="trip" />
  if (!expense || expense.deletedAt !== null) return <NotFound what="expense" />

  const me = db.identities[tripId]
  const payer = trip.members[expense.paidBy]
  const line = myLineOn(expense, me, trip.currency)
  const total = expense.parts.reduce((a, p) => a + Math.max(p.weight, 0), 0)

  // Participants in the order of the split, with anyone since removed from
  // the trip still shown: their share is still part of this expense.
  const rows = expense.parts.map((p) => {
    const member = trip.members[p.memberId]
    const share = split?.ok ? (split.shares.get(p.memberId) ?? 0) : null
    let weight = ''
    if (expense.splitMode === 'shares') weight = `${p.weight} ${p.weight === 1 ? 'share' : 'shares'}`
    if (expense.splitMode === 'percent') weight = `${(p.weight / 100).toFixed(p.weight % 100 === 0 ? 0 : 2)}%`
    if (expense.splitMode === 'exact' && total > 0) weight = `${Math.round((p.weight / total) * 100)}%`
    return { p, member, share, weight }
  })

  return (
    <>
      <TopBar
        title={expense.description || 'Expense'}
        subtitle={shortDate(expense.date)}
        onBack
        backTo={`/trip/${tripId}`}
        right={
          <button
            className="btn ghost icon"
            onClick={() => navigate(`/trip/${tripId}/expense/${expenseId}/edit`)}
            aria-label="Edit expense"
          >
            <Icon name="edit" size={18} />
            Edit
          </button>
        }
      />
      <div className="content no-fab">
        <div className="section">
          <div className="hero detail">
            <p className="kicker">{splitModeLabel(expense.splitMode, expense.parts.length)}</p>
            <p className="headline num zero">{formatMoney(expense.amountMinor, trip.currency)}</p>
            <div className="paid-by">
              {payer ? <Avatar member={payer} small /> : <UnknownAvatar small />}
              <span>
                <strong>{payer ? firstName(payer.name) : 'Someone (removed)'}</strong> paid
                {expense.paidBy === me ? ' (you)' : ''}
              </span>
            </div>
            {line && line.text !== 'not involved' && line.text !== 'just you' && (
              <p className={`lede mine ${line.tone}`}>
                {line.tone === 'pos' ? 'You lent ' : 'You owe '}
                <strong className="num">
                  {line.text.replace(/^you (lent|owe) /, '')}
                </strong>
                {line.tone === 'pos' ? ' on this one.' : ' for this one.'}
              </p>
            )}
            {expense.note && <p className="note">{expense.note}</p>}
          </div>
        </div>

        {split && !split.ok && (
          <div className="section">
            <Alert tone="bad">
              This expense cannot be added up ({split.message.toLowerCase()}), so it is left out
              of every balance. Tap <strong>Edit</strong> and save it again.
            </Alert>
          </div>
        )}

        <div className="section">
          <h2>Who owes what for this</h2>
          <div className="card">
            {rows.map(({ p, member, share, weight }) => (
              <div key={p.memberId} className="row static">
                {member ? <Avatar member={member} /> : <UnknownAvatar />}
                <div className="grow">
                  <div className="title">
                    {member?.name ?? 'Someone (removed)'}
                    {p.memberId === me && <span className="chip tiny accent">you</span>}
                    {member?.deletedAt != null && <span className="chip tiny">removed</span>}
                  </div>
                  <div className="meta">
                    {p.memberId === expense.paidBy ? 'paid the bill' : 'owes the payer'}
                    {weight ? ` · ${weight}` : ''}
                  </div>
                </div>
                <div className="amount">
                  {share !== null ? <Money amount={share} currency={trip.currency} /> : '—'}
                </div>
              </div>
            ))}
          </div>
          <p className="hint">
            Shares add up to the amount exactly; any leftover paise go to whoever was rounded down
            most, the same on every phone.
          </p>
        </div>

        <button
          className="btn block"
          onClick={() => navigate(`/trip/${tripId}/expense/${expenseId}/edit`)}
        >
          <Icon name="edit" size={18} />
          Edit expense
        </button>
      </div>
    </>
  )
}
