import type { Currency, Minor } from './types'

/**
 * Largest amount accepted, in minor units — one billion major units at 2
 * decimals (₹100 crore), which no trip will ever approach.
 *
 * The value is not arbitrary. Splitting computes `amount * weight` before
 * dividing, and a percentage split uses weights in basis points totalling
 * 10,000. So the largest product the arithmetic can face is
 * `MAX_MINOR * 10_000 = 1e15`, comfortably inside Number.MAX_SAFE_INTEGER
 * (9.007e15) where integers are still exact.
 *
 * Raising this without raising that headroom would make the largest allowed
 * amount impossible to split by percentage — the two limits have to move
 * together.
 */
export const MAX_MINOR = 100_000_000_000

export function isValidMinor(n: unknown): n is Minor {
  return (
    typeof n === 'number' &&
    Number.isSafeInteger(n) &&
    Math.abs(n) <= MAX_MINOR
  )
}

/**
 * Parse user input ("1,234.5", "₹80", "12") into minor units.
 * Returns null on anything it cannot read exactly — never a guess, because a
 * silently misread amount is worse than a rejected one.
 *
 * Parsing is done on the STRING, not via parseFloat, so `0.07` becomes exactly
 * 7 and not 6 (which `Math.round(0.07 * 100)` can produce on other inputs).
 */
export function parseAmount(input: string, decimals: number): Minor | null {
  const cleaned = input.replace(/[\s, ]/g, '').replace(/^[^\d.-]+/, '')
  if (cleaned === '' || cleaned === '-') return null

  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(cleaned)
  if (!m) return null

  const sign = m[1] === '-' ? -1 : 1
  const whole = m[2] ?? ''
  const frac = m[3] ?? ''
  if (whole === '' && frac === '') return null
  // More precision than the currency has is a typo, not a rounding request.
  if (frac.length > decimals) return null

  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals)
  const value = sign * Number(`${whole || '0'}${padded}`)
  return isValidMinor(value) ? value : null
}

/**
 * `evaluateAmount("1200+340+80", 2)` -> 162000. People add a bill up in the
 * amount field; letting them type the sum saves the calculator app. Only `+`
 * and `-` between amounts; anything else is rejected the same way a bad
 * amount is. A single plain amount goes through unchanged.
 */
export function evaluateAmount(input: string, decimals: number): Minor | null {
  const text = input.replace(/\s/g, '')
  if (!/[+-]/.test(text.slice(1))) return parseAmount(input, decimals)
  const tokens = text.match(/[+-]?[^+-]+/g)
  if (!tokens || tokens.join('') !== text) return null
  let total = 0
  for (const t of tokens) {
    const sign = t.startsWith('-') ? -1 : 1
    const body = t.replace(/^[+-]/, '')
    const v = parseAmount(body, decimals)
    if (v === null || v < 0) return null
    total += sign * v
  }
  return isValidMinor(total) ? total : null
}

/**
 * How digits are grouped for reading. `thousand` is 1,234,567; `lakh` is the
 * Indian system, 12,34,567: the last three digits, then pairs. To someone who
 * thinks in lakhs and crores, "₹150,000" takes a beat to read and
 * "₹1,50,000" does not.
 */
export type Grouping = 'thousand' | 'lakh'

/** Currencies whose users read amounts in lakhs. Display only; never stored. */
export function groupingFor(currency: Currency): Grouping {
  return currency.code === 'INR' ? 'lakh' : 'thousand'
}

/**
 * Insert group separators. Done by hand rather than with
 * `toLocaleString` on purpose: that follows the *device* locale, so a German
 * phone would render 1200.50 as "1.200" + "." + "50" = "1.200.50". Worse,
 * `parseAmount` expects `,` grouping and a `.` decimal point, so a
 * locale-formatted string would not survive a round trip. A shared ledger
 * has to read the same on every phone in the group.
 */
function group(digits: string, grouping: Grouping): string {
  if (grouping === 'thousand' || digits.length <= 3) {
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }
  const last3 = digits.slice(-3)
  const head = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  return `${head},${last3}`
}

/** Render minor units as a plain decimal string, no symbol. `1235` -> `12.35`. */
export function formatMinor(amount: Minor, decimals: number, grouping: Grouping = 'thousand'): string {
  const sign = amount < 0 ? '-' : ''
  const abs = Math.abs(amount).toString().padStart(decimals + 1, '0')
  if (decimals === 0) return sign + group(abs, grouping)
  const whole = abs.slice(0, -decimals)
  const frac = abs.slice(-decimals)
  return `${sign}${group(whole, grouping)}.${frac}`
}

/** Render with the trip's symbol, e.g. `₹1,234.50` or `₹1,50,000.00`. */
export function formatMoney(amount: Minor, currency: Currency): string {
  const body = formatMinor(Math.abs(amount), currency.decimals, groupingFor(currency))
  return `${amount < 0 ? '-' : ''}${currency.symbol}${body}`
}

export const DEFAULT_CURRENCIES: Currency[] = [
  { code: 'INR', symbol: '₹', decimals: 2 },
  { code: 'USD', symbol: '$', decimals: 2 },
  { code: 'EUR', symbol: '€', decimals: 2 },
  { code: 'GBP', symbol: '£', decimals: 2 },
  { code: 'AED', symbol: 'AED ', decimals: 2 },
  { code: 'SAR', symbol: 'SAR ', decimals: 2 },
  { code: 'JPY', symbol: '¥', decimals: 0 },
  { code: 'THB', symbol: '฿', decimals: 2 },
  { code: 'SGD', symbol: 'S$', decimals: 2 },
  { code: 'AUD', symbol: 'A$', decimals: 2 },
]
