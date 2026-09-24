import { describe, expect, it } from 'vitest'
import { firstProblem, type ProblemInput } from './expenseProblems'

const good: ProblemInput = {
  amountText: '600',
  amountMinor: 60000,
  decimals: 2,
  description: 'Court booking',
  hasNote: false,
  paidBy: 'a',
  memberCount: 5,
  dateOk: true,
  split: { ok: true },
}

describe('firstProblem', () => {
  it('passes a complete expense', () => {
    expect(firstProblem(good)).toBeNull()
  })

  it('names the amount box for an empty, unparsable or zero amount', () => {
    expect(firstProblem({ ...good, amountText: '', amountMinor: null })?.at).toBe('amount')
    expect(firstProblem({ ...good, amountText: 'abc', amountMinor: null })).toEqual({
      at: 'amount',
      message: expect.stringContaining('2 decimal places'),
    })
    expect(firstProblem({ ...good, amountText: '0', amountMinor: 0 })).toEqual({
      at: 'amount',
      message: 'Amount must be more than zero.',
    })
  })

  it('names the description box, and mentions the note when the note was filled instead', () => {
    expect(firstProblem({ ...good, description: '   ' })).toEqual({
      at: 'description',
      message: 'Say what this was for in a few words, so everyone knows.',
    })
    expect(firstProblem({ ...good, description: '', hasNote: true })?.message).toContain('The note below')
  })

  it('names who-paid for an empty trip or no payer', () => {
    expect(firstProblem({ ...good, memberCount: 0, paidBy: '' })).toEqual({
      at: 'paidBy',
      message: 'Add someone to the trip before logging an expense.',
    })
    expect(firstProblem({ ...good, paidBy: '' })).toEqual({ at: 'paidBy', message: 'Pick who paid.' })
  })

  it('names the date when the picker was cleared', () => {
    expect(firstProblem({ ...good, dateOk: false })).toEqual({ at: 'date', message: 'Pick a date.' })
  })

  it('passes the split message through, at the split', () => {
    expect(firstProblem({ ...good, split: { ok: false, message: 'Pick at least one person.' } })).toEqual({
      at: 'split',
      message: 'Pick at least one person.',
    })
    expect(firstProblem({ ...good, split: null, amountMinor: null, amountText: 'x' })?.at).toBe('amount')
  })

  it('reports the highest box on the form first', () => {
    const everythingWrong: ProblemInput = {
      amountText: '',
      amountMinor: null,
      decimals: 2,
      description: '',
      hasNote: true,
      paidBy: '',
      memberCount: 0,
      dateOk: false,
      split: { ok: false, message: 'x' },
    }
    expect(firstProblem(everythingWrong)?.at).toBe('amount')
    expect(firstProblem({ ...everythingWrong, amountText: '5', amountMinor: 500 })?.at).toBe('description')
    expect(firstProblem({ ...everythingWrong, amountText: '5', amountMinor: 500, description: 'x' })?.at).toBe('paidBy')
  })
})
