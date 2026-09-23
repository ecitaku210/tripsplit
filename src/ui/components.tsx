import type { ReactNode } from 'react'
import type { Currency, Member, Minor } from '../domain/types'
import { formatMoney } from '../domain/money'
import { back } from './router'
import { Icon, type IconName } from './icons'

/**
 * Two headers, so the reader always knows where they are.
 *
 * HOME is the only screen with the app's mark and wordmark, and it wears
 * the teal glow. It has no back arrow because there is nowhere back to go.
 *
 * Every SUB-SCREEN gets a compact sticky bar whose left side is a pill
 * naming the screen it came from ("‹ Goa Trip"), then the screen's own
 * title, large, in the page itself. The parent's name in the back pill is
 * what makes the hierarchy legible: you see at once that "Settle up"
 * belongs to Goa Trip, and that Goa Trip belongs to Trips.
 */
export function TopBar({
  title,
  subtitle,
  onBack,
  backTo,
  backLabel,
  right,
  brand,
}: {
  title: string
  subtitle?: string
  onBack?: boolean
  /** Where "back" lands when this screen was opened from a link or refresh. */
  backTo?: string
  /** The parent screen's name, shown in the back pill. Defaults to "Trips". */
  backLabel?: string
  right?: ReactNode
  /** The home variant: app mark and wordmark, no back. */
  brand?: boolean
}) {
  if (brand) {
    return (
      <header className="topbar home">
        <span className="brand" aria-hidden="true">
          <span className="mark">
            <Icon name="wallet" size={20} />
          </span>
        </span>
        <h1>
          {title}
          {subtitle && <span className="sub">{subtitle}</span>}
        </h1>
        {right}
      </header>
    )
  }
  return (
    <>
      <header className="topbar sub">
        {onBack ? (
          <button className="btn ghost backpill" onClick={() => back(backTo)} aria-label="Go back">
            <Icon name="back" size={18} />
            <span className="parent">{backLabel ?? 'Trips'}</span>
          </button>
        ) : (
          <span className="grow" />
        )}
        <span className="grow" />
        {right}
      </header>
      <div className="page-head">
        <h1>{title}</h1>
        {subtitle && <p className="sub">{subtitle}</p>}
      </div>
    </>
  )
}

/**
 * Colour is derived from the member id rather than stored, so the same person
 * gets the same colour on every phone in the group without that colour having
 * to be replicated and merged.
 */
export function avatarColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  // Hues 70..330: greens, blues, violets, magentas. The 60° band around
  // gold is the brand, the band around red is "you owe"; a person must not
  // wear either.
  return `hsl(${70 + (hash % 260)} 62% 66%)`
}

/** "Chirag Tandon" -> "Chirag". Dense rows have no room for surnames. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase()
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase()
}

export function Avatar({ member, small }: { member: Member; small?: boolean }) {
  return (
    <div
      className={`avatar${small ? ' sm' : ''}`}
      style={{ background: avatarColor(member.id) }}
      aria-hidden="true"
    >
      {initials(member.name)}
    </div>
  )
}

/** For a payer or participant whose record this phone does not hold. */
export function UnknownAvatar({ small }: { small?: boolean }) {
  return (
    <div className={`avatar unknown${small ? ' sm' : ''}`} aria-hidden="true">
      ?
    </div>
  )
}

/**
 * Two avatars, payer over payee, for a repayment: "Asha → Chirag" as a
 * picture, so a list of repayments reads without parsing names.
 */
export function AvatarPair({ from, to }: { from: Member | undefined; to: Member | undefined }) {
  return (
    <div className="avatar-pair" aria-hidden="true">
      {from ? <Avatar member={from} small /> : <UnknownAvatar small />}
      {to ? <Avatar member={to} small /> : <UnknownAvatar small />}
    </div>
  )
}

/** Overlapping small avatars: "who is on this trip" at a glance. */
export function AvatarStack({ members, max = 4 }: { members: Member[]; max?: number }) {
  const shown = members.slice(0, max)
  const rest = members.length - shown.length
  return (
    <div className="avatars" aria-hidden="true">
      {shown.map((m) => (
        <Avatar key={m.id} member={m} small />
      ))}
      {rest > 0 && <span className="more">+{rest}</span>}
    </div>
  )
}

export function Money({
  amount,
  currency,
  signed,
}: {
  amount: Minor
  currency: Currency
  /** Colours the value green/red. Off for neutral totals like "trip spend". */
  signed?: boolean
}) {
  const tone = !signed ? '' : amount > 0 ? ' pos' : amount < 0 ? ' neg' : ' zero'
  return <span className={`money num${tone}`}>{formatMoney(amount, currency)}</span>
}

/**
 * A balance in words. A bare signed number ("−₹833.58") makes people stop
 * and work out which way the money flows; a sentence does not.
 */
export function verdict(netMinor: Minor): { tone: 'pos' | 'neg' | 'zero'; label: string } {
  if (netMinor > 0) return { tone: 'pos', label: 'You are owed' }
  if (netMinor < 0) return { tone: 'neg', label: 'You owe' }
  return { tone: 'zero', label: 'All settled' }
}

/**
 * Shown when a route names a trip or expense this phone does not hold — after
 * deleting it, or when a link arrives before the ledger it refers to. The
 * screens used to render a bare title bar over a blank page, which reads as a
 * crash rather than an explanation.
 */
export function NotFound({ what }: { what: 'trip' | 'expense' }) {
  return (
    <>
      <TopBar title={what === 'trip' ? 'Trip not found' : 'Expense not found'} onBack backTo="/" />
      <div className="content no-fab">
        <Empty icon="info" title={`That ${what} is not on this phone`}>
          It was deleted here, or it lives on someone else&apos;s phone and you have not imported
          their copy yet.
        </Empty>
        <button className="btn block" onClick={() => (window.location.hash = '/')}>
          Back to trips
        </button>
      </div>
    </>
  )
}

export function Empty({
  title,
  icon,
  children,
}: {
  title: string
  icon?: IconName
  children?: ReactNode
}) {
  return (
    <div className="empty">
      {icon && (
        <div className="glyph">
          <Icon name={icon} size={26} />
        </div>
      )}
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  )
}

/** One message with an icon that says what kind of message it is. */
export function Alert({
  tone,
  children,
}: {
  tone: 'info' | 'warn' | 'bad' | 'good'
  children: ReactNode
}) {
  const icon: IconName =
    tone === 'good' ? 'check' : tone === 'bad' ? 'alert' : tone === 'warn' ? 'alert' : 'info'
  return (
    <div className={`alert ${tone}`} role={tone === 'bad' ? 'alert' : undefined}>
      <Icon name={icon} size={18} />
      <div className="body">{children}</div>
    </div>
  )
}

export function Pill({
  tone,
  children,
}: {
  tone: 'live' | 'busy' | 'warn' | 'bad' | 'plain'
  children: ReactNode
}) {
  return (
    <span className={`pill ${tone}`}>
      <span className="dot" aria-hidden="true" />
      {children}
    </span>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** `2026-01-04` -> `4 Jan`. Short because it sits in a dense list. */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso || 'No date'
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d} ${months[m - 1]}`
}
