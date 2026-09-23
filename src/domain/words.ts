import type { Currency, Minor } from './types'

/**
 * An amount in words, the way a cheque or a bank confirmation writes it:
 * "one lakh fifty thousand rupees and fifty paise". Shown under the amount
 * field as the person types, because a misplaced zero is the most common
 * money mistake and digits alone do not catch it. Rupees use the Indian
 * system (lakh, crore); every other currency uses thousands and millions.
 */

const ONES = [
  '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
]
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

/** 0..999 in words; '' for 0. */
function belowThousand(n: number): string {
  const parts: string[] = []
  const h = Math.floor(n / 100)
  const rest = n % 100
  if (h) parts.push(`${ONES[h]} hundred`)
  if (rest < 20) {
    if (rest) parts.push(ONES[rest]!)
  } else {
    const t = TENS[Math.floor(rest / 10)]!
    const o = ONES[rest % 10]!
    parts.push(o ? `${t}-${o}` : t)
  }
  return parts.join(' ')
}

/** Indian grouping: crore (1e7), lakh (1e5), thousand, then 0..999. */
function indian(n: number): string {
  if (n === 0) return 'zero'
  const parts: string[] = []
  const crore = Math.floor(n / 1e7)
  const lakh = Math.floor((n % 1e7) / 1e5)
  const thousand = Math.floor((n % 1e5) / 1e3)
  const rest = n % 1e3
  if (crore) parts.push(`${crore >= 100 ? indian(crore) : belowThousand(crore)} crore`)
  if (lakh) parts.push(`${belowThousand(lakh)} lakh`)
  if (thousand) parts.push(`${belowThousand(thousand)} thousand`)
  if (rest) parts.push(belowThousand(rest))
  return parts.join(' ')
}

/** Western grouping: billion, million, thousand, then 0..999. */
function western(n: number): string {
  if (n === 0) return 'zero'
  const names = ['', 'thousand', 'million', 'billion']
  const parts: string[] = []
  let i = 0
  while (n > 0 && i < names.length) {
    const chunk = n % 1000
    if (chunk) parts.unshift(`${belowThousand(chunk)}${names[i] ? ` ${names[i]}` : ''}`)
    n = Math.floor(n / 1000)
    i += 1
  }
  return parts.join(' ')
}

interface Unit {
  major: [string, string]
  minor: [string, string] | null
}

const UNITS: Record<string, Unit> = {
  INR: { major: ['rupee', 'rupees'], minor: ['paisa', 'paise'] },
  USD: { major: ['dollar', 'dollars'], minor: ['cent', 'cents'] },
  EUR: { major: ['euro', 'euros'], minor: ['cent', 'cents'] },
  GBP: { major: ['pound', 'pounds'], minor: ['penny', 'pence'] },
  AED: { major: ['dirham', 'dirhams'], minor: ['fils', 'fils'] },
  SAR: { major: ['riyal', 'riyals'], minor: ['halala', 'halalas'] },
  JPY: { major: ['yen', 'yen'], minor: null },
  THB: { major: ['baht', 'baht'], minor: ['satang', 'satang'] },
  SGD: { major: ['dollar', 'dollars'], minor: ['cent', 'cents'] },
  AUD: { major: ['dollar', 'dollars'], minor: ['cent', 'cents'] },
}

/**
 * `amountInWords(15000050, INR)` -> "one lakh fifty thousand rupees and
 * fifty paise". Null for zero, negatives, and amounts too large to read
 * aloud sensibly (over 99 crore / 999 billion).
 */
export function amountInWords(amount: Minor, currency: Currency): string | null {
  if (!Number.isSafeInteger(amount) || amount <= 0) return null
  const scale = 10 ** currency.decimals
  const major = Math.floor(amount / scale)
  const minor = amount % scale
  if (major >= 1e12) return null
  const unit = UNITS[currency.code] ?? { major: [currency.code, currency.code], minor: null }
  const number = currency.code === 'INR' ? indian : western

  const parts: string[] = []
  if (major > 0 || minor === 0) {
    parts.push(`${number(major)} ${major === 1 ? unit.major[0] : unit.major[1]}`)
  }
  if (minor > 0 && currency.decimals > 0) {
    const minorName = unit.minor
      ? minor === 1
        ? unit.minor[0]
        : unit.minor[1]
      : `hundredth${minor === 1 ? '' : 's'}`
    parts.push(`${number(minor)} ${minorName}`)
  }
  return parts.join(' and ')
}
