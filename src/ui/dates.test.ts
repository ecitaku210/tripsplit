import { describe, expect, it } from 'vitest'
import { dayBefore, dayLabel, timeAgo } from './dates'

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

describe('timeAgo', () => {
  const now = Date.UTC(2026, 8, 23, 12, 0, 0)
  it.each([
    [0, 'just now'],
    [45_000, 'just now'],
    [5 * 60_000, '5 min ago'],
    [3 * 3_600_000, '3 h ago'],
    [26 * 3_600_000, 'yesterday'],
    [4 * 86_400_000, '4 days ago'],
  ])('%i ms ago -> %s', (delta, expected) => {
    expect(timeAgo(now - delta, now)).toBe(expected)
  })

  it('falls back to the short date after a week', () => {
    expect(timeAgo(now - 10 * 86_400_000, now)).toMatch(/^\d{1,2} Sep$/)
  })

  it('never says "in the future" for a clock slightly ahead', () => {
    expect(timeAgo(now + 5_000, now)).toBe('just now')
  })
})
