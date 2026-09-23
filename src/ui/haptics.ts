/**
 * A short tick when something is committed: Save, Record, Undo, Delete.
 * Android phones vibrate; iOS Safari has no vibration API and ignores it.
 * The gap between "a web page" and "an app" in the hand is mostly this.
 */
export function tap(): void {
  try {
    navigator.vibrate?.(10)
  } catch {
    // Some browsers throw when the page has not been interacted with.
  }
}
