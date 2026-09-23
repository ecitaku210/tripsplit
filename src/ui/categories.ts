import type { IconName } from './icons'

/**
 * Expense categories, guessed from the description.
 *
 * Nothing is stored: the description stays the source of truth, so the
 * guess costs nothing in the ledger and every phone derives the same one.
 * The quick-pick chips in the editor use the same list, so a person who taps
 * "Taxi" gets the taxi glyph for certain, and a person who types "auto to
 * the beach" gets it by inference.
 */
export interface Category {
  id: string
  label: string
  icon: IconName
  /** Hue for the spend bar. Kept off gold (brand) and red (you owe). */
  hue: number
  words: string[]
}

export function categoryColor(c: Category): string {
  // "Other" is the absence of a category, so it is drawn in a neutral slate
  // rather than competing with the real ones for a hue.
  if (c.id === 'other') return 'hsl(215 12% 58%)'
  return `hsl(${c.hue} 60% 62%)`
}

export const CATEGORIES: Category[] = [
  {
    id: 'food',
    hue: 150,
    label: 'Food',
    icon: 'utensils',
    words: ['food', 'dinner', 'lunch', 'breakfast', 'brunch', 'meal', 'restaurant', 'pizza', 'biryani', 'thali', 'snack', 'snacks', 'dhaba', 'cafe', 'café', 'shack', 'kitchen', 'burger', 'dosa', 'tiffin', 'sushi', 'bbq', 'buffet'],
  },
  {
    id: 'drinks',
    hue: 190,
    label: 'Drinks',
    icon: 'cup',
    words: ['drink', 'drinks', 'beer', 'beers', 'wine', 'bar', 'pub', 'coffee', 'chai', 'tea', 'juice', 'cocktail', 'cocktails', 'whisky', 'whiskey', 'vodka', 'rum', 'kingfisher', 'shots', 'water'],
  },
  {
    id: 'travel',
    hue: 215,
    label: 'Taxi',
    icon: 'car',
    words: ['taxi', 'cab', 'uber', 'ola', 'auto', 'rickshaw', 'scooter', 'scooty', 'bike', 'rental', 'rent', 'car', 'toll', 'parking', 'bus', 'metro', 'train', 'ferry', 'boat', 'transfer'],
  },
  {
    id: 'stay',
    hue: 255,
    label: 'Stay',
    icon: 'bed',
    words: ['hotel', 'villa', 'stay', 'room', 'rooms', 'airbnb', 'hostel', 'resort', 'homestay', 'guesthouse', 'lodge', 'night', 'nights', 'booking', 'accommodation'],
  },
  {
    id: 'tickets',
    hue: 285,
    label: 'Tickets',
    icon: 'ticket',
    words: ['ticket', 'tickets', 'flight', 'flights', 'entry', 'entrance', 'museum', 'fort', 'show', 'concert', 'movie', 'cinema', 'pass', 'passes', 'cruise', 'safari', 'park'],
  },
  {
    id: 'shopping',
    hue: 315,
    label: 'Shopping',
    icon: 'cart',
    words: ['shopping', 'groceries', 'grocery', 'supermarket', 'market', 'shop', 'store', 'souvenir', 'souvenirs', 'gift', 'gifts', 'clothes', 'pharmacy', 'medicine', 'sunscreen'],
  },
  {
    id: 'fuel',
    hue: 175,
    label: 'Fuel',
    icon: 'fuel',
    words: ['fuel', 'petrol', 'diesel', 'gas', 'charging', 'ev'],
  },
  {
    id: 'activity',
    hue: 120,
    label: 'Activity',
    icon: 'sparkle',
    words: ['activity', 'surf', 'surfing', 'dive', 'diving', 'snorkel', 'snorkelling', 'kayak', 'trek', 'trekking', 'hike', 'yoga', 'massage', 'spa', 'pickleball', 'golf', 'club', 'party', 'game', 'games', 'bowling', 'karaoke'],
  },
]

export const OTHER: Category = { id: 'other', label: 'Other', icon: 'tag', hue: 220, words: [] }

const INDEX = new Map<string, Category>()
for (const c of CATEGORIES) for (const w of c.words) INDEX.set(w, c)
// An exact label match wins outright: "Taxi" typed or tapped is travel.
for (const c of CATEGORIES) INDEX.set(c.label.toLowerCase(), c)

/**
 * Whole-word match, first word that hits wins, so "Taxi to dinner" is travel
 * (the trip was the thing paid for). Unknown descriptions are `OTHER`.
 */
export function categoryOf(description: string): Category {
  const words = description.toLowerCase().split(/[^a-zé]+/).filter(Boolean)
  for (const w of words) {
    const hit = INDEX.get(w)
    if (hit) return hit
  }
  return OTHER
}
