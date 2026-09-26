import { describe, expect, it } from 'vitest'
import { cardVerdict, counterpartyLabel, listNames, obligationsOf, standingSentence } from './standing'
import type { Transfer } from './settle'

const plan: Transfer[] = [
  { fromMember: 'tarun', toMember: 'bhavya', amountMinor: 1150 },
  { fromMember: 'urvashi', toMember: 'bhavya', amountMinor: 70150 },
  { fromMember: 'roshni', toMember: 'bhavya', amountMinor: 70150 },
  { fromMember: 'dev', toMember: 'asha', amountMinor: 500 },
  { fromMember: 'dev', toMember: 'bhavya', amountMinor: 900 },
]

describe('obligationsOf', () => {
  it('reads one debtor\'s line out of the plan', () => {
    expect(obligationsOf(plan, 'tarun')).toEqual({ pay: [{ to: 'bhavya', amountMinor: 1150 }], receive: [] })
  })
  it('lists a creditor\'s payers, largest first', () => {
    expect(obligationsOf(plan, 'bhavya').receive.map((r) => r.from)).toEqual(['urvashi', 'roshni', 'tarun', 'dev'])
    expect(obligationsOf(plan, 'bhavya').pay).toEqual([])
  })
  it('a debtor owing two people gets both, largest first', () => {
    expect(obligationsOf(plan, 'dev').pay).toEqual([
      { to: 'bhavya', amountMinor: 900 },
      { to: 'asha', amountMinor: 500 },
    ])
  })
  it('someone square has nothing either way', () => {
    expect(obligationsOf(plan, 'nobody')).toEqual({ pay: [], receive: [] })
  })
})

describe('listNames', () => {
  it('joins in plain English', () => {
    expect(listNames([])).toBe('')
    expect(listNames(['Asha'])).toBe('Asha')
    expect(listNames(['Asha', 'Chirag'])).toBe('Asha and Chirag')
    expect(listNames(['Asha', 'Chirag', 'Dev'])).toBe('Asha, Chirag and Dev')
  })
  it('folds a long list into "and N others"', () => {
    expect(listNames(['Asha', 'Chirag', 'Dev', 'Esha'])).toBe('Asha, Chirag and 2 others')
    expect(listNames(['Asha', 'Chirag', 'Dev', 'Esha', 'Farah'], 2)).toBe('Asha and 4 others')
  })
})

const INR = { code: 'INR', symbol: '₹', decimals: 2 }
const name = (id: string) => id[0]!.toUpperCase() + id.slice(1)

describe('standingSentence', () => {
  it('names the one person to pay', () => {
    expect(standingSentence(obligationsOf(plan, 'tarun'), name, INR)).toBe('Pay Bhavya ₹11.50 and you are square.')
  })
  it('lists several people to pay, largest first', () => {
    expect(standingSentence(obligationsOf(plan, 'dev'), name, INR)).toBe('Pay Bhavya ₹9.00 and Asha ₹5.00.')
  })
  it('names who owes the reader', () => {
    expect(standingSentence(obligationsOf(plan, 'asha'), name, INR)).toBe('Dev owes you ₹5.00.')
    expect(standingSentence(obligationsOf(plan, 'bhavya'), name, INR)).toBe(
      'Urvashi owes you ₹701.50, Roshni ₹701.50, Tarun ₹11.50 and Dev ₹9.00.',
    )
  })
  it('square', () => {
    expect(standingSentence(obligationsOf(plan, 'nobody'), name, INR)).toBe('You have paid exactly your share.')
  })
})

describe('counterpartyLabel', () => {
  it('says who a person pays or is paid by', () => {
    expect(counterpartyLabel(obligationsOf(plan, 'tarun'), name)).toBe('pays Bhavya')
    expect(counterpartyLabel(obligationsOf(plan, 'dev'), name)).toBe('pays Bhavya and Asha')
    expect(counterpartyLabel(obligationsOf(plan, 'bhavya'), name)).toBe('is owed by Urvashi, Roshni and 2 others')
    expect(counterpartyLabel(obligationsOf(plan, 'nobody'), name)).toBe('all square')
  })
})

describe('cardVerdict', () => {
  it('names the single counterparty on the card', () => {
    expect(cardVerdict(obligationsOf(plan, 'tarun'), -1150, name)).toEqual({ tone: 'neg', before: 'You owe Bhavya', after: '' })
    expect(cardVerdict(obligationsOf(plan, 'asha'), 500, name)).toEqual({ tone: 'pos', before: 'Dev owes you', after: '' })
  })
  it('counts people when there are several', () => {
    expect(cardVerdict(obligationsOf(plan, 'dev'), -1400, name)).toEqual({ tone: 'neg', before: 'You owe', after: 'to 2 people' })
    expect(cardVerdict(obligationsOf(plan, 'bhavya'), 142350, name)).toEqual({ tone: 'pos', before: 'You are owed', after: 'by 4 people' })
  })
  it('square', () => {
    expect(cardVerdict(obligationsOf(plan, 'nobody'), 0, name)).toEqual({ tone: 'zero', before: 'All settled', after: '' })
  })
})
