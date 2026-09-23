import { describe, expect, it } from 'vitest'
import { amountInWords } from './words'

const INR = { code: 'INR', symbol: '₹', decimals: 2 }
const USD = { code: 'USD', symbol: '$', decimals: 2 }
const JPY = { code: 'JPY', symbol: '¥', decimals: 0 }
const XYZ = { code: 'XYZ', symbol: 'X', decimals: 2 }

describe('amountInWords, rupees in the Indian system', () => {
  it.each([
    [100, 'one rupee'],
    [200, 'two rupees'],
    [150, 'one rupee and fifty paise'],
    [1, 'one paisa'],
    [50, 'fifty paise'],
    [1900, 'nineteen rupees'],
    [2100, 'twenty-one rupees'],
    [10000, 'one hundred rupees'],
    [101000, 'one thousand ten rupees'],
    [2500000, 'twenty-five thousand rupees'],
    [10000000, 'one lakh rupees'],
    [15000000, 'one lakh fifty thousand rupees'],
    [15000050, 'one lakh fifty thousand rupees and fifty paise'],
    [123456789, 'twelve lakh thirty-four thousand five hundred sixty-seven rupees and eighty-nine paise'],
    [1000000000, 'one crore rupees'],
    [12345678900, 'twelve crore thirty-four lakh fifty-six thousand seven hundred eighty-nine rupees'],
  ])('%i -> %s', (minor, words) => {
    expect(amountInWords(minor, INR)).toBe(words)
  })

  it('reads hundreds of crores', () => {
    expect(amountInWords(250000000000, INR)).toBe('two hundred fifty crore rupees')
    expect(amountInWords(25000000000000, INR)).toBe('twenty-five thousand crore rupees')
  })
})

describe('amountInWords, other currencies in thousands and millions', () => {
  it.each([
    [100, USD, 'one dollar'],
    [150000000, USD, 'one million five hundred thousand dollars'],
    [123456, USD, 'one thousand two hundred thirty-four dollars and fifty-six cents'],
    [1, USD, 'one cent'],
    [1500, JPY, 'one thousand five hundred yen'],
    [1, JPY, 'one yen'],
  ])('%i %s', (minor, cur, words) => {
    expect(amountInWords(minor, cur)).toBe(words)
  })

  it('falls back to the code for a currency it does not know', () => {
    expect(amountInWords(250, XYZ)).toBe('two XYZ and fifty hundredths')
  })
})

describe('amountInWords, nothing to say', () => {
  it('returns null for zero, negatives, non-integers and absurd sizes', () => {
    expect(amountInWords(0, INR)).toBeNull()
    expect(amountInWords(-100, INR)).toBeNull()
    expect(amountInWords(1.5, INR)).toBeNull()
    expect(amountInWords(1e15, INR)).toBeNull()
  })
})
