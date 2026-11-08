import type { Id, Member } from '../domain/types'

/** The first word of a name: "Rahul Sharma" is "Rahul". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

const key = (s: string) => s.toLocaleLowerCase()

/** "Rahul Sharma" is "Rahul S."; a one-word name has no initial form. */
function withInitial(name: string): string | null {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length < 2) return null
  return `${words[0]} ${Array.from(words[words.length - 1]!)[0]!.toLocaleUpperCase()}.`
}

/**
 * The shortest name that still says who someone is in this group.
 *
 * The first name, unless someone else in the group has the same one: "Pay
 * Rahul and Rahul" tells nobody whom to pay. Then the first name and last
 * initial ("Rahul S."), and the full name if that clashes too. Removed members
 * count, because old expenses still show them.
 *
 * Identical full names are left as they are; the avatar colours differ.
 */
export function shortName(group: Record<Id, Member>, id: Id): string {
  const member = group[id]
  if (!member) return ''
  const others = Object.values(group).filter((m) => m.id !== id)
  const first = firstName(member.name)
  if (!others.some((m) => key(firstName(m.name)) === key(first))) return first
  const initial = withInitial(member.name)
  if (initial && !others.some((m) => withInitial(m.name) !== null && key(withInitial(m.name)!) === key(initial))) {
    return initial
  }
  return member.name.trim()
}
