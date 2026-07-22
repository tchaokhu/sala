import { describe, it, expect } from 'vitest'
import { safeHttpUrl, requireHttpUrl, cleanText, isPhone, isEmail, maskTrailing } from './validate'

describe('safeHttpUrl', () => {
  it('accepts https URLs', () => {
    expect(safeHttpUrl('https://example.com')).toBe('https://example.com/')
    expect(safeHttpUrl('https://maps.google.com/?q=condo')).toBe('https://maps.google.com/?q=condo')
  })

  it('accepts http URLs', () => {
    expect(safeHttpUrl('http://example.com')).toBe('http://example.com/')
  })

  it('rejects javascript: URLs', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(safeHttpUrl('JavaScript:alert(1)')).toBeNull()
  })

  it('rejects data: URLs', () => {
    expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
  })

  it('rejects other dangerous schemes', () => {
    expect(safeHttpUrl('vbscript:msgbox')).toBeNull()
    expect(safeHttpUrl('file:///etc/passwd')).toBeNull()
    expect(safeHttpUrl('ftp://example.com')).toBeNull()
  })

  it('rejects malformed input', () => {
    expect(safeHttpUrl('not a url')).toBeNull()
    expect(safeHttpUrl('')).toBeNull()
    expect(safeHttpUrl(null)).toBeNull()
    expect(safeHttpUrl(undefined)).toBeNull()
  })

  it('trims whitespace before parsing', () => {
    expect(safeHttpUrl('  https://example.com  ')).toBe('https://example.com/')
  })
})

describe('requireHttpUrl', () => {
  it('returns the url when valid', () => {
    expect(requireHttpUrl('https://example.com')).toBe('https://example.com/')
  })

  it('throws with field label on invalid', () => {
    expect(() => requireHttpUrl('javascript:alert(1)', 'Map URL')).toThrowError(/Map URL/)
  })
})

describe('cleanText', () => {
  it('trims and caps length', () => {
    expect(cleanText('  hello  ', 100)).toBe('hello')
    expect(cleanText('abcdefghij', 5)).toBe('abcde')
  })

  it('returns empty string for non-string input', () => {
    expect(cleanText(null, 10)).toBe('')
    expect(cleanText(undefined, 10)).toBe('')
    expect(cleanText(42, 10)).toBe('')
  })
})

describe('isPhone', () => {
  it('accepts Thai mobile formats', () => {
    expect(isPhone('0876706436')).toBe(true)
    expect(isPhone('087-670-6436')).toBe(true)
    expect(isPhone('087 670 6436')).toBe(true)
    expect(isPhone('+66876706436')).toBe(true)
  })

  it('rejects garbage', () => {
    expect(isPhone('abc')).toBe(false)
    expect(isPhone('123')).toBe(false)              // too short
    expect(isPhone('1'.repeat(16))).toBe(false)     // too long
    expect(isPhone('087-abc-6436')).toBe(false)
  })
})

describe('isEmail', () => {
  it('accepts well-formed addresses', () => {
    expect(isEmail('a@b.co')).toBe(true)
    expect(isEmail('user.name+tag@example.com')).toBe(true)
  })

  it('rejects garbage', () => {
    expect(isEmail('notanemail')).toBe(false)
    expect(isEmail('a@b')).toBe(false)
    expect(isEmail('a @b.co')).toBe(false)
  })
})

describe('maskTrailing', () => {
  it('masks all but last N digits, preserves separators', () => {
    // 13 digits total → last 4 are 0,1,2,3 (from "...7890-12-3")
    expect(maskTrailing('1-2345-67890-12-3', 4)).toBe('•-••••-••••0-12-3')
  })

  it('returns input unchanged when shorter than visible', () => {
    expect(maskTrailing('123', 4)).toBe('123')
  })

  it('handles empty / nullish', () => {
    expect(maskTrailing('')).toBe('')
    expect(maskTrailing(null)).toBe('')
    expect(maskTrailing(undefined)).toBe('')
  })

  it('default visible is 4', () => {
    expect(maskTrailing('1234567890')).toBe('••••••7890')
  })
})
