import type { SyncStatus } from './engine'

/**
 * How long to wait before trying again, by how many attempts have failed.
 *
 * Fast at first: a phone on one bar of signal recovers in seconds. Then slow,
 * so a phone stuck on a failure that never clears does not burn the group's
 * free quota trying. Firestore bills every transaction's read, so a 30-second
 * retry loop from five phones is nearly 15,000 reads a day for nothing; at
 * five minutes it is under 1,500. Everything still resumes at once when the
 * app comes back to the screen or the network returns.
 */
export const RETRY_MIN_MS = 2_000
export const RETRY_FAST_MAX_MS = 30_000
export const RETRY_SLOW_MS = 5 * 60_000
/** Failures before the slow schedule takes over (about 2 minutes of trying). */
export const RETRY_FAST_ATTEMPTS = 8

export function retryDelay(failures: number): number {
  if (failures >= RETRY_FAST_ATTEMPTS) return RETRY_SLOW_MS
  return Math.min(RETRY_MIN_MS * 2 ** Math.max(0, failures - 1), RETRY_FAST_MAX_MS)
}

/**
 * What a failed Firestore call means for the badge, and whether trying
 * again by timer could help. Quota exhaustion resets at a fixed time of
 * day, so retrying every few seconds until then is pure waste: the app
 * waits for the next resume (reopen, or network back) instead.
 */
export function classifyFailure(
  code: string,
  offline: boolean,
): { status: SyncStatus; retry: boolean } {
  if (code === 'resource-exhausted') return { status: 'quota', retry: false }
  if (code === 'unavailable' || offline) return { status: 'offline', retry: true }
  // A rules refusal is usually transient (rules just republished, a token
  // not yet valid) and a denied request is not billed, so it keeps trying
  // on the same slowing schedule as any other error.
  return { status: 'error', retry: true }
}
