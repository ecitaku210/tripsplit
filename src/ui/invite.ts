/**
 * The invitation link and how to read one back.
 *
 * The whole trip rides in the hash of the app's own address, so a friend
 * who taps it lands on the import screen with nothing fetched from any
 * server. Pure, so it is testable without a browser.
 */
/** The installable address of this very deployment, wherever it is hosted. */
export function appUrl(): string {
  return `${window.location.origin}${window.location.pathname}`
}

/** The link a friend taps to join: the whole trip rides in the hash, so no server is involved. */
export function inviteLink(code: string): string {
  return `${appUrl()}#/import?d=${code}`
}

/**
 * A pasted invitation may be the bare code or the whole link, with or
 * without the chat app's decorations around it. Either way, the code is
 * the last base64url run after `d=`, or the text itself.
 */
export function codeFrom(pasted: string): string {
  const text = pasted.trim()
  const m = /[?&]d=([A-Za-z0-9_-]+)/.exec(text)
  return m ? m[1]! : text
}
