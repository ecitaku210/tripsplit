import { describe, expect, it } from 'vitest'
import type { Member } from '../domain/types'
import { firstName, shortName } from './names'

const group = (...names: [string, string, (number | null)?][]): Record<string, Member> =>
  Object.fromEntries(
    names.map(([id, name, deletedAt = null]) => [id, { id, name, updatedAt: 1, updatedBy: 'a', deletedAt }]),
  )

describe('firstName', () => {
  it('takes the first word', () => {
    expect(firstName('  Rahul   Sharma ')).toBe('Rahul')
    expect(firstName('Ö')).toBe('Ö')
  })
})

describe('shortName', () => {
  it('is the first name when nobody else in the group shares it', () => {
    const g = group(['a', 'Rahul Sharma'], ['b', 'Priya Nair'])
    expect(shortName(g, 'a')).toBe('Rahul')
    expect(shortName(g, 'b')).toBe('Priya')
  })

  it('adds the last initial when two people share a first name', () => {
    const g = group(['a', 'Rahul Sharma'], ['b', 'Rahul Verma'], ['c', 'Priya'])
    expect(shortName(g, 'a')).toBe('Rahul S.')
    expect(shortName(g, 'b')).toBe('Rahul V.')
    expect(shortName(g, 'c')).toBe('Priya')
  })

  it('compares first names without regard to case', () => {
    const g = group(['a', 'rahul Sharma'], ['b', 'Rahul Verma'])
    expect(shortName(g, 'a')).toBe('rahul S.')
  })

  it('falls back to the full name when the initials clash too', () => {
    const g = group(['a', 'Rahul Sharma'], ['b', 'Rahul Singh'])
    expect(shortName(g, 'a')).toBe('Rahul Sharma')
    expect(shortName(g, 'b')).toBe('Rahul Singh')
  })

  it('uses the full name for a one-word name that clashes', () => {
    const g = group(['a', 'Rahul'], ['b', 'Rahul Verma'])
    expect(shortName(g, 'a')).toBe('Rahul')
    expect(shortName(g, 'b')).toBe('Rahul V.')
  })

  it('counts removed members, whose old expenses still show', () => {
    const g = group(['a', 'Sam Lee'], ['b', 'Sam Ortiz', 5])
    expect(shortName(g, 'a')).toBe('Sam L.')
  })

  it('keeps the initial of a name that starts with an emoji or accent', () => {
    const g = group(['a', 'Zoë Émile'], ['b', 'Zoë 🦄'])
    expect(shortName(g, 'a')).toBe('Zoë É.')
    expect(shortName(g, 'b')).toBe('Zoë 🦄.')
  })

  it('is empty for an id the group does not have', () => {
    expect(shortName(group(['a', 'Ana']), 'zz')).toBe('')
  })
})
