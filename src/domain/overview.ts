/**
 * The reader's position across every group they have named themselves in:
 * who pays them and whom they pay, group by group.
 *
 * Each line is read from that group's own settlement plan, so the overview
 * names exactly the people and amounts that group's Settle up screen does.
 * Nothing is netted across groups: a payment is recorded in one group, and
 * two groups' "Chirag" may not be the same person, so a combined figure
 * could be wrong and could not be settled anywhere.
 */
import { computeTotals } from './balance'
import { settlementPlan } from './settle'
import { obligationsOf } from './standing'
import type { Currency, Id, Minor, Trip } from './types'

export interface OverviewLine {
  tripId: Id
  tripName: string
  /** The other person, a member of that trip. */
  memberId: Id
  amountMinor: Minor
}

export interface CurrencyOverview {
  currency: Currency
  /** The reader's net across these groups: what the home screen headline shows. */
  netMinor: Minor
  groups: number
  /** People who pay the reader, largest first. */
  receive: OverviewLine[]
  /** People the reader pays, largest first. */
  pay: OverviewLine[]
  /** Groups where the reader is square. */
  settled: { tripId: Id; tripName: string }[]
}

export interface Overview {
  /** One entry per currency, in the order the groups were given. */
  currencies: CurrencyOverview[]
  /** Groups left out because the reader has not said who they are there. */
  unnamed: { tripId: Id; tripName: string }[]
}

export function overview(trips: Trip[], identities: Record<Id, Id>): Overview {
  const byCode = new Map<string, CurrencyOverview>()
  const unnamed: Overview['unnamed'] = []
  for (const trip of trips) {
    const me = identities[trip.id]
    const totals = computeTotals(trip)
    const mine = me ? totals.balances.find((b) => b.memberId === me) : undefined
    if (!mine) {
      unnamed.push({ tripId: trip.id, tripName: trip.name })
      continue
    }
    let entry = byCode.get(trip.currency.code)
    if (!entry) {
      entry = { currency: trip.currency, netMinor: 0, groups: 0, receive: [], pay: [], settled: [] }
      byCode.set(trip.currency.code, entry)
    }
    entry.netMinor += mine.netMinor
    entry.groups += 1
    const ob = obligationsOf(settlementPlan(totals.balances), mine.memberId)
    for (const r of ob.receive)
      entry.receive.push({ tripId: trip.id, tripName: trip.name, memberId: r.from, amountMinor: r.amountMinor })
    for (const p of ob.pay)
      entry.pay.push({ tripId: trip.id, tripName: trip.name, memberId: p.to, amountMinor: p.amountMinor })
    if (ob.receive.length === 0 && ob.pay.length === 0) entry.settled.push({ tripId: trip.id, tripName: trip.name })
  }
  const byAmount = (a: OverviewLine, b: OverviewLine) => b.amountMinor - a.amountMinor
  for (const entry of byCode.values()) {
    entry.receive.sort(byAmount)
    entry.pay.sort(byAmount)
  }
  return { currencies: [...byCode.values()], unnamed }
}
