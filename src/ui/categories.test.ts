import { describe, expect, it } from 'vitest'
import { CATEGORIES, categoryOf, OTHER } from './categories'

describe('categoryOf', () => {
  it.each([
    ['Beach shack dinner', 'food'],
    ['Kingfisher round', 'drinks'],
    ['Airport taxi', 'travel'],
    ['Scooter rental', 'travel'],
    ['Villa for two nights', 'stay'],
    ['Flights for everyone', 'tickets'],
    ['Groceries', 'shopping'],
    ['Petrol', 'fuel'],
    ['Pickleball court', 'activity'],
    ['NTF', 'other'],
    ['', 'other'],
  ])('%s -> %s', (text, id) => {
    expect(categoryOf(text).id).toBe(id)
  })

  it('takes the first matching word, so "Taxi to dinner" is travel', () => {
    expect(categoryOf('Taxi to dinner').id).toBe('travel')
  })

  it('matches whole words only: "carpet" is not a car', () => {
    expect(categoryOf('Carpet from the market').id).toBe('shopping')
  })

  it('is case-insensitive and ignores punctuation', () => {
    expect(categoryOf('DINNER!!').id).toBe('food')
  })

  it('maps every chip label back to its own category', () => {
    for (const c of CATEGORIES) expect(categoryOf(c.label).id).toBe(c.id)
    expect(categoryOf('Other')).toBe(OTHER)
  })

  it('has no word claimed by two categories', () => {
    const seen = new Map<string, string>()
    for (const c of CATEGORIES) {
      for (const w of c.words) {
        expect(seen.get(w), `"${w}" in ${c.id} and ${seen.get(w)}`).toBeUndefined()
        seen.set(w, c.id)
      }
    }
  })
})
