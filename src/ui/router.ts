import { useEffect, useState } from 'react'

/**
 * A hash router in 40 lines instead of a dependency.
 *
 * The hash is deliberate: the app is a static bundle that has to work from a
 * `file://` URL, a GitHub Pages subpath, and offline from the home screen.
 * Path-based routing needs a server that rewrites unknown paths to index.html;
 * `#/trip/123` needs nothing at all.
 */

export type Route =
  | { name: 'home' }
  | { name: 'trip'; tripId: string }
  /** `expenseId` null is a new expense. `edit` opens the form; otherwise the detail view. */
  | { name: 'expense'; tripId: string; expenseId: string | null; edit: boolean }
  | { name: 'settle'; tripId: string }
  | { name: 'share'; tripId: string }
  | { name: 'people'; tripId: string }
  | { name: 'import'; payload: string | null }
  | { name: 'help' }

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '')
  const [pathPart = '', queryPart = ''] = raw.split('?')
  const segments = pathPart.split('/').filter(Boolean)
  const query = new URLSearchParams(queryPart)

  if (segments[0] === 'import') return { name: 'import', payload: query.get('d') }
  if (segments[0] === 'help') return { name: 'help' }

  if (segments[0] === 'trip' && segments[1]) {
    const tripId = decodeURIComponent(segments[1])
    switch (segments[2]) {
      case undefined:
        return { name: 'trip', tripId }
      case 'settle':
        return { name: 'settle', tripId }
      case 'share':
        return { name: 'share', tripId }
      case 'people':
        return { name: 'people', tripId }
      case 'expense': {
        const expenseId =
          segments[3] && segments[3] !== 'new' ? decodeURIComponent(segments[3]) : null
        return { name: 'expense', tripId, expenseId, edit: expenseId === null || segments[4] === 'edit' }
      }
      default:
        return { name: 'trip', tripId }
    }
  }
  return { name: 'home' }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

/**
 * Navigation and the back button.
 *
 * Every in-app push records how deep into the app the person is
 * (`history.state.depth`). That number is what makes "back" honest: a screen
 * that has finished its job (an expense saved or deleted) goes BACK to where
 * the person came from instead of pushing a new entry on top. Pushing left the
 * finished screen in history, so the phone's back button returned to an editor
 * for an expense that no longer existed, with an Undo toast still on screen.
 *
 * A screen opened from a link or a refresh has depth 0 and no in-app history
 * behind it, so "back" REPLACES the entry with the natural parent instead of
 * leaving the app.
 */
function depth(): number {
  const state = window.history.state as { depth?: number } | null
  return state?.depth ?? 0
}

function urlFor(to: string): string {
  return `${window.location.pathname}${window.location.search}#${to}`
}

function announce(): void {
  // pushState/replaceState never fire hashchange; useRoute listens for it.
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

/** Go forward to a new screen. */
export function navigate(to: string): void {
  if (window.location.hash.replace(/^#/, '') === to) return
  window.history.pushState({ depth: depth() + 1 }, '', urlFor(to))
  announce()
}

/** Replaces the entry so the back button does not return to a consumed link. */
export function replace(to: string): void {
  window.history.replaceState({ depth: depth() }, '', urlFor(to))
  announce()
}

/**
 * Leave the current screen. Returns to the previous in-app screen when there
 * is one; otherwise (opened from a link, or after a refresh) shows `fallback`
 * in its place.
 */
export function back(fallback = '/'): void {
  if (depth() > 0) window.history.back()
  else replace(fallback)
}

/**
 * Leave the last `steps` in-app screens at once and land on `to`: after
 * deleting an expense from its editor, both the editor and the detail view
 * behind it are about something that no longer exists. When fewer in-app
 * entries than that exist (a deep link), it goes back as far as it can and
 * shows `to` in place of whatever is there.
 */
export function leave(to: string, steps: number): void {
  const n = Math.min(depth(), steps)
  if (n === 0) {
    replace(to)
    return
  }
  const onArrive = () => {
    window.removeEventListener('popstate', onArrive)
    if (n < steps || window.location.hash.replace(/^#/, '') !== to) replace(to)
  }
  window.addEventListener('popstate', onArrive)
  window.history.go(-n)
}

/**
 * Drop every in-app entry and land on `to`, for when the thing the history
 * was about no longer exists (a deleted trip). Going back from there leaves
 * the app, as it should, instead of stepping through screens of a trip that
 * is gone.
 */
export function reset(to: string): void {
  leave(to, Number.POSITIVE_INFINITY)
}
