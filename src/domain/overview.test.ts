import { describe, expect, it } from 'vitest'
import { computeTotals } from './balance'
import { overview } from './overview'
import { makeExpense, makeMember, makeTrip, randomTrip } from './testkit'
import type { Trip } from './types'

const INR = { code: 'INR', symbol: '₹', decimals: 2 }
const USD = { code: 'USD', symbol: '$', decimals: 2 }

/** A group where `payer` paid `amountMinor` for everyone, split equally. */
function group(id: string, name: string, people: string[], payer: string, amountMinor: number, currency = INR): Trip {
  const trip = makeTrip(id, people.map((p) => makeMember(`${id}-${p}`, p)))
  trip.name = name
  trip.currency = currency
  trip.expenses.e1 = makeExpense({
    id: 'e1',
    amountMinor,
    paidBy: `${id}-${payer}`,
    parts: people.map((p) => ({ memberId: `${id}-${p}`, weight: 1 })),
  })
  return trip
}

describe('overview', () => {
  // Tarun is owed by Chirag in one group and owes Chirag in another.
  const wolf = group('wolf', 'Wolfpack', ['Tarun', 'Chirag'], 'Tarun', 20_000)
  const pickle = group('pickle', 'Pickleball', ['Tarun', 'Chirag'], 'Chirag', 6_000)
  const gym = group('gym', 'Gym', ['Tarun', 'Roshni'], 'Tarun', 0)
  const me = { wolf: 'wolf-Tarun', pickle: 'pickle-Tarun', gym: 'gym-Tarun' }

  it('lists who pays the reader and whom the reader pays, group by group, without netting', () => {
    const [inr] = overview([wolf, pickle, gym], me).currencies
    expect(inr!.receive).toEqual([{ tripId: 'wolf', tripName: 'Wolfpack', memberId: 'wolf-Chirag', amountMinor: 10_000 }])
    expect(inr!.pay).toEqual([{ tripId: 'pickle', tripName: 'Pickleball', memberId: 'pickle-Chirag', amountMinor: 3_000 }])
    expect(inr!.netMinor).toBe(7_000)
    expect(inr!.groups).toBe(3)
  })

  it('names the groups where the reader is square', () => {
    expect(overview([wolf, pickle, gym], me).currencies[0]!.settled).toEqual([{ tripId: 'gym', tripName: 'Gym' }])
  })

  it('leaves out, and names, groups where the reader has not said who they are', () => {
    const result = overview([wolf, pickle], { wolf: 'wolf-Tarun' })
    expect(result.unnamed).toEqual([{ tripId: 'pickle', tripName: 'Pickleball' }])
    expect(result.currencies[0]!.groups).toBe(1)
  })

  it('keeps each currency apart', () => {
    const trip = group('nyc', 'New York', ['Tarun', 'Asha'], 'Asha', 5_000, USD)
    const result = overview([wolf, trip], { wolf: 'wolf-Tarun', nyc: 'nyc-Tarun' })
    expect(result.currencies.map((c) => [c.currency.code, c.netMinor])).toEqual([
      ['INR', 10_000],
      ['USD', -2_500],
    ])
  })

  it('puts the largest amounts first', () => {
    const big = group('big', 'Big', ['Tarun', 'Dev'], 'Tarun', 90_000)
    const lines = overview([wolf, big], { wolf: 'wolf-Tarun', big: 'big-Tarun' }).currencies[0]!.receive
    expect(lines.map((l) => l.amountMinor)).toEqual([45_000, 10_000])
  })

  it('adds up to exactly the reader\'s balance in every group (200 random ledgers)', () => {
    // If this fails, the overview shows money the group's own balance does not.
    for (let seed = 1; seed <= 200; seed += 1) {
      const trip = randomTrip(seed)
      for (const b of computeTotals(trip).balances) {
        const [entry] = overview([trip], { [trip.id]: b.memberId }).currencies
        const received = entry!.receive.reduce((s, l) => s + l.amountMinor, 0)
        const paid = entry!.pay.reduce((s, l) => s + l.amountMinor, 0)
        expect(received - paid).toBe(b.netMinor)
        expect(entry!.netMinor).toBe(b.netMinor)
      }
    }
  })
})
