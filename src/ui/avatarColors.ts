import type { Id, Member } from '../domain/types'

/*
 * Hues in the order they are handed out, each as far as possible from the
 * ones before it: blue, lime, pink, teal, violet, green, sky, purple. A group
 * of three gets three colours from opposite sides of the wheel, rather than
 * two neighbours like lime and green. All sit in 90..320: the band around
 * gold is the brand and the band around red is "you owe", so a person wears
 * neither.
 */
const HUES = [225, 95, 320, 165, 270, 130, 195, 290] as const

/** Lightness by rank, four people per step. All light enough for the dark initials. */
const SHADES = [64, 80, 72, 87] as const

const cache = new WeakMap<Record<Id, Member>, Map<Id, string>>()

/**
 * A colour per member, different for everyone in the group up to eight
 * people, and as different as possible for small groups.
 *
 * Colour is derived, not stored, so every phone computes the same answer from
 * the same member list without it having to be replicated and merged: members
 * are ranked by id and take hues in the order above. Removed members keep
 * their rank, so removing someone recolours nobody. The trade-off: a newcomer
 * slots into the ranking, so someone's colour can change when a person
 * joins. Telling people apart on screen matters more than that. Past eight
 * people the hues repeat at another shade.
 */
export function groupColors(group: Record<Id, Member>): Map<Id, string> {
  const hit = cache.get(group)
  if (hit) return hit
  const out = new Map<Id, string>()
  Object.keys(group)
    .sort()
    .forEach((id, rank) => {
      const hue = HUES[rank % HUES.length]
      // The second four hues sit between the first four on the wheel, so
      // they also step in lightness: the sixth person's green must not pass
      // for the second person's lime.
      out.set(id, `hsl(${hue} 62% ${SHADES[Math.floor(rank / 4) % SHADES.length]}%)`)
    })
  cache.set(group, out)
  return out
}

/** For a member the group record does not hold yet: a fixed colour, not a guess. */
export function memberColor(group: Record<Id, Member>, id: Id): string {
  return groupColors(group).get(id) ?? `hsl(${HUES[0]} 62% ${SHADES[0]}%)`
}
