/**
 * Who, exactly, a person pays or is paid by.
 *
 * "You owe the group ₹11.50" is true and useless: nobody can act on it.
 * The settlement plan already decides who pays whom; this reads one
 * person's lines out of it, so every screen can name the counterparty and
 * the amount in the same words the Settle up screen uses. Pure, so it is
 * tested without a browser.
 */
import type { Currency, Id, Minor } from './types'
import type { Transfer } from './settle'
import { formatMoney } from './money'

export interface Obligations {
  /** What this person hands over, largest first. */
  pay: { to: Id; amountMinor: Minor }[]
  /** What this person receives, largest first. */
  receive: { from: Id; amountMinor: Minor }[]
}

export function obligationsOf(plan: Transfer[], member: Id): Obligations {
  const byAmount = (a: { amountMinor: Minor }, b: { amountMinor: Minor }) => b.amountMinor - a.amountMinor
  return {
    pay: plan
      .filter((t) => t.fromMember === member)
      .map((t) => ({ to: t.toMember, amountMinor: t.amountMinor }))
      .sort(byAmount),
    receive: plan
      .filter((t) => t.toMember === member)
      .map((t) => ({ from: t.fromMember, amountMinor: t.amountMinor }))
      .sort(byAmount),
  }
}

/** "Asha", "Asha and Chirag", "Asha, Chirag and Dev", "Asha, Chirag and 3 others". */
export function listNames(names: string[], max = 3): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]!
  if (names.length <= max) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  const shown = names.slice(0, max - 1)
  const rest = names.length - shown.length
  return `${shown.join(', ')} and ${rest} others`
}

/** "Bhavya ₹11.50", "Bhavya ₹500 and Chirag ₹200", "Bhavya ₹500, Chirag ₹200 and 2 others". */
function listWithAmounts(items: { name: string; amountMinor: Minor }[], currency: Currency): string {
  return listNames(items.map((i) => `${i.name} ${formatMoney(i.amountMinor, currency)}`))
}

/**
 * The one sentence under the reader's balance: who to pay, or who owes them,
 * in the same words the Settle up screen uses. Never "the group".
 */
export function standingSentence(
  ob: Obligations,
  nameOf: (id: Id) => string,
  currency: Currency,
): string {
  if (ob.pay.length > 0) {
    const items = ob.pay.map((p) => ({ name: nameOf(p.to), amountMinor: p.amountMinor }))
    return ob.pay.length === 1
      ? `Pay ${listWithAmounts(items, currency)} and you are square.`
      : `Pay ${listWithAmounts(items, currency)}.`
  }
  if (ob.receive.length > 0) {
    const [first, ...rest] = ob.receive
    const head = `${nameOf(first!.from)} owes you ${formatMoney(first!.amountMinor, currency)}`
    if (rest.length === 0) return `${head}.`
    const tail = listWithAmounts(rest.map((r) => ({ name: nameOf(r.from), amountMinor: r.amountMinor })), currency)
    return `${head}, ${tail}.`
  }
  return 'You have paid exactly your share.'
}

/** The short label beside a person in the balances list: "pays Bhavya", "is owed by Urvashi and Roshni". */
export function counterpartyLabel(ob: Obligations, nameOf: (id: Id) => string): string {
  if (ob.pay.length > 0) return `pays ${listNames(ob.pay.map((p) => nameOf(p.to)))}`
  if (ob.receive.length > 0) return `is owed by ${listNames(ob.receive.map((r) => nameOf(r.from)))}`
  return 'all square'
}

/**
 * The trip card's one line: "You owe Bhavya" + amount, "Bhavya owes you" +
 * amount, or, with several people, "You owe" + amount + "to 2 people".
 */
export function cardVerdict(
  ob: Obligations,
  netMinor: Minor,
  nameOf: (id: Id) => string,
): { tone: 'pos' | 'neg' | 'zero'; before: string; after: string } {
  if (netMinor < 0) {
    if (ob.pay.length === 1) return { tone: 'neg', before: `You owe ${nameOf(ob.pay[0]!.to)}`, after: '' }
    return { tone: 'neg', before: 'You owe', after: ob.pay.length > 1 ? `to ${ob.pay.length} people` : '' }
  }
  if (netMinor > 0) {
    if (ob.receive.length === 1) return { tone: 'pos', before: `${nameOf(ob.receive[0]!.from)} owes you`, after: '' }
    return { tone: 'pos', before: 'You are owed', after: ob.receive.length > 1 ? `by ${ob.receive.length} people` : '' }
  }
  return { tone: 'zero', before: 'All settled', after: '' }
}
