import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { Member } from '../domain/types'
import { groupColors } from './avatarColors'

const member = (id: string, deletedAt: number | null = null): Member => ({
  id,
  name: id,
  updatedAt: 1,
  updatedBy: 'dev',
  deletedAt,
})
const groupOf = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, member(id)]))

describe('groupColors', () => {
  it('gives everyone in a group of up to eight a different colour', () => {
    for (let run = 0; run < 500; run += 1) {
      const size = 2 + (run % 7)
      const colors = groupColors(groupOf(Array.from({ length: size }, () => randomUUID())))
      expect(new Set(colors.values()).size).toBe(size)
    }
  })

  it('keeps colours distinct past eight people, at another shade', () => {
    const colors = groupColors(groupOf(Array.from({ length: 16 }, () => randomUUID())))
    expect(new Set(colors.values()).size).toBe(16)
  })

  it('gives the same answer whatever order the phone holds members in', () => {
    const ids = Array.from({ length: 6 }, () => randomUUID())
    const forward = groupColors(groupOf(ids))
    const backward = groupColors(groupOf([...ids].reverse()))
    for (const id of ids) expect(backward.get(id)).toBe(forward.get(id))
  })

  it('recolours nobody when someone is removed', () => {
    const ids = Array.from({ length: 5 }, () => randomUUID())
    const before = groupColors(groupOf(ids))
    const after = groupColors({ ...groupOf(ids), [ids[2]!]: member(ids[2]!, 99) })
    for (const id of ids) expect(after.get(id)).toBe(before.get(id))
  })

  it('spreads a small group across the wheel instead of using neighbours', () => {
    const hueOf = (c: string) => Number(/hsl\((\d+)/.exec(c)![1])
    for (let run = 0; run < 50; run += 1) {
      const hues = [...groupColors(groupOf([randomUUID(), randomUUID(), randomUUID()])).values()].map(hueOf)
      for (let i = 0; i < hues.length; i += 1)
        for (let j = i + 1; j < hues.length; j += 1) expect(Math.abs(hues[i]! - hues[j]!)).toBeGreaterThanOrEqual(90)
    }
  })
  it('keeps the dark initials readable on every colour (WCAG 4.5:1)', () => {
    const lum = (r: number, g: number, b: number) => {
      const c = [r, g, b].map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
    }
    const hsl = (h: number, s: number, l: number) => {
      const k = (n: number) => (n + h / 30) % 12
      const a = s * Math.min(l, 1 - l)
      const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
      return [f(0), f(8), f(4)] as const
    }
    // The initials colour in styles.css (.avatar).
    const ink = lum(0x06 / 255, 0x12 / 255, 0x1c / 255)
    const colors = groupColors(groupOf(Array.from({ length: 16 }, () => randomUUID())))
    const weak = [...colors.values()].filter((c) => {
      const [h, s, l] = /hsl\((\d+) (\d+)% (\d+)%\)/.exec(c)!.slice(1).map(Number) as [number, number, number]
      const bg = lum(...hsl(h, s / 100, l / 100))
      return (bg + 0.05) / (ink + 0.05) < 4.5
    })
    expect(weak).toEqual([])
  })
})
