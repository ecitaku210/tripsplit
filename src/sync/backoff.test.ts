import { describe, expect, it } from 'vitest'
import {
  classifyFailure,
  RETRY_FAST_ATTEMPTS,
  RETRY_FAST_MAX_MS,
  RETRY_MIN_MS,
  RETRY_SLOW_MS,
  retryDelay,
} from './backoff'

describe('retryDelay', () => {
  it('doubles from 2 s and caps at 30 s while the failure is fresh', () => {
    expect(retryDelay(1)).toBe(RETRY_MIN_MS)
    expect(retryDelay(2)).toBe(4_000)
    expect(retryDelay(3)).toBe(8_000)
    expect(retryDelay(4)).toBe(16_000)
    expect(retryDelay(5)).toBe(RETRY_FAST_MAX_MS)
    expect(retryDelay(RETRY_FAST_ATTEMPTS - 1)).toBe(RETRY_FAST_MAX_MS)
  })

  it('drops to one attempt per five minutes once a failure has persisted', () => {
    expect(retryDelay(RETRY_FAST_ATTEMPTS)).toBe(RETRY_SLOW_MS)
    expect(retryDelay(100)).toBe(RETRY_SLOW_MS)
  })

  it('keeps a stuck phone under 300 billed reads a day instead of nearly 3,000', () => {
    const perDay = (24 * 3600 * 1000) / retryDelay(RETRY_FAST_ATTEMPTS)
    expect(perDay).toBeLessThan(300)
    expect((24 * 3600 * 1000) / RETRY_FAST_MAX_MS).toBeGreaterThan(2_800)
  })
})

describe('classifyFailure', () => {
  it('names quota exhaustion and does not retry it by timer', () => {
    expect(classifyFailure('resource-exhausted', false)).toEqual({ status: 'quota', retry: false })
  })

  it('treats network loss as offline and keeps trying', () => {
    expect(classifyFailure('unavailable', false)).toEqual({ status: 'offline', retry: true })
    expect(classifyFailure('', true)).toEqual({ status: 'offline', retry: true })
  })

  it('keeps retrying a rules refusal, which is unbilled and usually transient', () => {
    expect(classifyFailure('permission-denied', false)).toEqual({ status: 'error', retry: true })
  })

  it('retries anything unexpected, as an error', () => {
    expect(classifyFailure('internal', false)).toEqual({ status: 'error', retry: true })
  })
})
