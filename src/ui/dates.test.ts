import { describe, expect, it } from 'vitest'
import { dayBefore, dayLabel } from './dates'

describe('dayBefore', () => {
  it.each([
    ['2026-09-23', '2026-09-22'],
    ['2026-03-01', '2026-02-28'],
    ['2024-03-01', '2024-02-29'],
    ['2026-01-01', '2025-12-31'],
  ])('%s -> %s', (iso, expected) => {
    expect(dayBefore(iso)).toBe(expected)
  })

  it('returns null for anything that is not a date', () => {
    expect(dayBefore('')).toBeNull()
    expect(dayBefore('yesterday')).toBeNull()
  })
})

describe('dayLabel', () => {
  const today = '2026-09-23'

  it('names today and yesterday', () => {
    expect(dayLabel('2026-09-23', today)).toBe('Today')
    expect(dayLabel('2026-09-22', today)).toBe('Yesterday')
  })

  it('does not call the day before yesterday anything special', () => {
    expect(dayLabel('2026-09-21', today)).toBe('21 Sep')
  })

  it('adds the year only when it differs from this year', () => {
    expect(dayLabel('2026-01-04', today)).toBe('4 Jan')
    expect(dayLabel('2025-12-31', today)).toBe('31 Dec 2025')
  })

  it('crosses the year boundary for yesterday', () => {
    expect(dayLabel('2025-12-31', '2026-01-01')).toBe('Yesterday')
  })

  it('labels a missing or broken date honestly', () => {
    expect(dayLabel('', today)).toBe('No date')
    expect(dayLabel('2026-13-40', today)).toBe('No date')
  })
})
