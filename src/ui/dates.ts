/**
 * Calendar labels for the expense list. Pure functions over ISO dates
 * (`YYYY-MM-DD`), so they can be tested without a clock.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function parts(iso: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return [y, mo, d]
}

/** The ISO date one day before `iso`. Done in UTC so DST cannot skip a day. */
export function dayBefore(iso: string): string | null {
  const p = parts(iso)
  if (!p) return null
  const t = new Date(Date.UTC(p[0], p[1] - 1, p[2] - 1))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/**
 * Heading for a day in the list: "Today", "Yesterday", "22 Sep", and with
 * the year once it is not this year, so last December's trip reads right in
 * January.
 */
export function dayLabel(iso: string, today: string): string {
  const p = parts(iso)
  if (!p) return 'No date'
  if (iso === today) return 'Today'
  if (iso === dayBefore(today)) return 'Yesterday'
  const [y, mo, d] = p
  const thisYear = parts(today)?.[0]
  const base = `${d} ${MONTHS[mo - 1]}`
  return y === thisYear ? base : `${base} ${y}`
}
