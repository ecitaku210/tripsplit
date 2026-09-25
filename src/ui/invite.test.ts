import { describe, expect, it } from 'vitest'
import { codeFrom, inviteLink } from './invite'

const CODE = 'H4sIAAAAAAAA_-2WS0_bQBDHv0rk8yYy-wDXt5Y-'

describe('codeFrom', () => {
  it('returns a bare code unchanged, trimmed', () => {
    expect(codeFrom(`  ${CODE}\n`)).toBe(CODE)
  })
  it('pulls the code out of an invitation link', () => {
    expect(codeFrom(`https://ecitaku210.github.io/tripsplit/#/import?d=${CODE}`)).toBe(CODE)
  })
  it('survives the text a chat app wraps around the link', () => {
    const msg = `Join "Goa Trip" on TripSplit. Open this link on your phone:\nhttps://x.test/app/#/import?d=${CODE}\nSent from WhatsApp`
    expect(codeFrom(msg)).toBe(CODE)
  })
  it('does not mistake a d= inside the code itself', () => {
    expect(codeFrom('abcd=ef')).toBe('abcd=ef')
  })
})

describe('inviteLink', () => {
  it('builds the import route on the current deployment', () => {
    Object.defineProperty(globalThis, 'window', {
      value: { location: { origin: 'https://ecitaku210.github.io', pathname: '/tripsplit/' } },
      configurable: true,
    })
    expect(inviteLink(CODE)).toBe(`https://ecitaku210.github.io/tripsplit/#/import?d=${CODE}`)
  })
})
