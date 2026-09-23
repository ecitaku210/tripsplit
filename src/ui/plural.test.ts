import { describe, expect, it } from 'vitest'
import { countOf } from './plural'

describe('countOf', () => {
  it('uses the singular for exactly one', () => {
    expect(countOf(1, 'person', 'people')).toBe('1 person')
    expect(countOf(1, 'expense', 'expenses')).toBe('1 expense')
  })

  it('uses the plural for zero and for more than one', () => {
    expect(countOf(0, 'expense', 'expenses')).toBe('0 expenses')
    expect(countOf(2, 'person', 'people')).toBe('2 people')
  })
})
