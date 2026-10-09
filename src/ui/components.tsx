import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { Currency, Id, Member, Minor } from '../domain/types'
import { memberColor } from './avatarColors'
import { formatMoney } from '../domain/money'
import { back, useOverlayEntry } from './router'
import { Icon, type IconName } from './icons'

/**
 * Two headers, so the reader always knows where they are.
 *
 * HOME is the only screen with the app's mark and wordmark, and it wears
 * the teal glow. It has no back arrow because there is nowhere back to go.
 *
 * Every SUB-SCREEN gets a compact sticky bar whose left side is a pill
 * naming the screen it came from ("‹ Goa Group"), then the screen's own
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
  /** The parent screen's name, shown in the back pill. Defaults to "Groups". */
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
            <span className="parent">{backLabel ?? 'Groups'}</span>
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

/** `group` is the trip's members: colours are picked to differ within it. */
export function Avatar({ member, group, small }: { member: Member; group: Record<Id, Member>; small?: boolean }) {
  return (
    <div
      className={`avatar${small ? ' sm' : ''}`}
      style={{ background: memberColor(group, member.id) }}
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
export function AvatarPair({
  from,
  to,
  group,
}: {
  from: Member | undefined
  to: Member | undefined
  group: Record<Id, Member>
}) {
  return (
    <div className="avatar-pair" aria-hidden="true">
      {from ? <Avatar member={from} group={group} small /> : <UnknownAvatar small />}
      {to ? <Avatar member={to} group={group} small /> : <UnknownAvatar small />}
    </div>
  )
}

/** Overlapping small avatars: "who is on this group" at a glance. */
export function AvatarStack({
  members,
  group,
  max = 4,
}: {
  members: Member[]
  group: Record<Id, Member>
  max?: number
}) {
  const shown = members.slice(0, max)
  const rest = members.length - shown.length
  return (
    <div className="avatars" aria-hidden="true">
      {shown.map((m) => (
        <Avatar key={m.id} member={m} group={group} small />
      ))}
      {rest > 0 && <span className="more">+{rest}</span>}
    </div>
  )
}

export function Money({
  amount,
  currency,
  signed,
  tone: forced,
}: {
  amount: Minor
  currency: Currency
  /** Colours the value green/red. Off for neutral totals like "group spend". */
  signed?: boolean
  /** Colours an unsigned amount when the words around it carry the direction ("owes ₹40"). */
  tone?: 'pos' | 'neg'
}) {
  const tone = forced ? ` ${forced}` : !signed ? '' : amount > 0 ? ' pos' : amount < 0 ? ' neg' : ' zero'
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
      <TopBar title={what === 'trip' ? 'Group not found' : 'Expense not found'} onBack backTo="/" />
      <div className="content no-fab">
        <Empty icon="info" title={`That ${what} is not on this phone`}>
          It was deleted here, or it lives on someone else&apos;s phone and you have not imported
          their copy yet.
        </Empty>
        <button className="btn block" onClick={() => (window.location.hash = '/')}>
          Back to groups
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
  error,
  anchor,
  actions,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  /**
   * What is wrong with THIS field, shown directly under it in red. A message
   * at the foot of a long form names a box the person then has to hunt for;
   * under the box, it needs no hunting.
   */
  error?: string | null
  /** Lets the form scroll this field into view when Save is refused. */
  anchor?: RefObject<HTMLDivElement>
  /** Rendered after the error: a one-tap way out of it, when there is one. */
  actions?: ReactNode
  /**
   * The id of the control this label names. Without it the label is just
   * text: tapping it does nothing and a screen reader announces an
   * unnamed box.
   */
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className={`field${error ? ' invalid' : ''}`} ref={anchor}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error && (
        <p className="field-error" role="alert">
          <Icon name="alert" size={14} />
          {error}
        </p>
      )}
      {actions}
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

/**
 * An explanation on demand. The screens used to carry every lesson in full;
 * now the lesson sits behind one small line and opens only when wanted.
 */
export function Why({ label = 'Why?', children }: { label?: string; children: ReactNode }) {
  return (
    <details className="why">
      <summary>
        <Icon name="info" size={14} />
        {label}
      </summary>
      <p>{children}</p>
    </details>
  )
}

export interface SheetAction {
  label: string
  icon: IconName
  onSelect: () => void
  danger?: boolean
}

/**
 * A menu that rises from the bottom, where the thumb already is. It closes
 * on the phone's back button, a tap outside, Escape or Cancel, and before
 * any action runs, so an action that navigates or shows a toast lands on a
 * clean screen. It is
 * rendered into <body> so no transformed ancestor can misplace it.
 */
export function ActionSheet({
  title,
  actions,
  onClose,
}: {
  title: string
  actions: SheetAction[]
  onClose: () => void
}) {
  const first = useRef<HTMLButtonElement>(null)
  // The phone's back button closes the sheet; so does everything else, via the same path.
  const { dismiss } = useOverlayEntry(onClose)
  useEffect(() => {
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
    // dismiss is stable in behaviour; the effect runs once per open sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return createPortal(
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss()
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-title">{title}</div>
        {actions.map((a, i) => (
          <button
            key={a.label}
            ref={i === 0 ? first : undefined}
            className={`sheet-item${a.danger ? ' danger' : ''}`}
            onClick={() => dismiss(a.onSelect)}
          >
            <Icon name={a.icon} size={20} />
            {a.label}
          </button>
        ))}
        <button className="sheet-item sheet-cancel" onClick={() => dismiss()}>
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  )
}
