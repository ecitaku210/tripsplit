import { useMemo } from 'react'
import { useStore } from '../../storage/store'
import { closedPeriods, computeTotals, liveExpenses, liveSettlements } from '../../domain/balance'
import { formatMoney } from '../../domain/money'
import { Alert, shortDate } from '../components'
import { Icon } from '../icons'
import { tap } from '../haptics'
import { useToast } from '../toast'
import { countOf } from '../plural'
import type { Trip } from '../../domain/types'

/** The local calendar date of a moment, as the ledger writes dates. */
export function localIso(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * "Close the books": the way a group that keeps going, a flat or a running
 * tab, starts a fresh count without deleting anything. Offered only when
 * everyone is square, so a closed period is always a finished story, and
 * only when there is something in the period to close.
 */
export function CloseBooks({ trip, onClosed }: { trip: Trip; onClosed?: () => void }) {
  const { closeBooks, reopenBooks } = useStore()
  const { show: toast } = useToast()
  const totals = useMemo(() => computeTotals(trip), [trip])
  const square = totals.balances.every((b) => b.netMinor === 0)
  const count = liveExpenses(trip).length + liveSettlements(trip).length
  if (!square || count === 0) return null

  return (
    <div className="card pad closebooks">
      <p className="kicker">Everyone is square</p>
      <p className="lede">
        Close the books to start a fresh count. The{' '}
        <strong>{countOf(liveExpenses(trip).length, 'expense', 'expenses')}</strong> and{' '}
        <strong>{formatMoney(totals.totalSpentMinor, trip.currency)}</strong> so far stay in the
        history, and balances restart from zero. Nothing is deleted.
      </p>
      <button
        className="btn primary block"
        onClick={() => {
          const id = closeBooks(trip.id)
          if (!id) return
          tap()
          toast('Books closed. New expenses start from zero.', {
            action: { label: 'Undo', onClick: () => reopenBooks(trip.id, id) },
          })
          onClosed?.()
        }}
      >
        <Icon name="flag" size={18} />
        Close the books
      </button>
    </div>
  )
}

/** A one-line note on the trip hero when the current period started with a closing. */
export function PeriodNote({ trip }: { trip: Trip }) {
  const periods = closedPeriods(trip)
  if (periods.length === 0) return null
  const last = periods[0]!
  return (
    <Alert tone="info">
      Counting since the books were closed on <strong>{shortDate(localIso(last.closing.at))}</strong>.
      Earlier expenses are under <strong>Closed periods</strong>.
    </Alert>
  )
}
