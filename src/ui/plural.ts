/**
 * "1 person", "3 people", "0 expenses". Every count shown to people goes
 * through this, so no screen can say "1 people" or "1 expenses" again.
 */
export function countOf(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}
