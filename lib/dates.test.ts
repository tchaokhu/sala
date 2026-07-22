import { describe, it, expect, afterEach, vi } from 'vitest'
import { daysBetween, daysInMonth, parseIsoDate, todayBangkok } from './dates'

describe('parseIsoDate', () => {
  it('splits a well-formed date', () => {
    expect(parseIsoDate('2026-01-15')).toEqual({ year: 2026, month: 1, day: 15 })
  })

  it('rejects unpadded, timestamped and empty input rather than coercing it', () => {
    expect(() => parseIsoDate('2026-1-15')).toThrow()
    expect(() => parseIsoDate('2026-01-15T00:00:00Z')).toThrow()
    expect(() => parseIsoDate('')).toThrow()
  })
})

describe('daysInMonth', () => {
  it('knows the short months', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2026, 4)).toBe(30)
    expect(daysInMonth(2026, 12)).toBe(31)
  })
})

describe('daysBetween', () => {
  it('counts forward and backward', () => {
    expect(daysBetween('2026-04-19', '2026-04-19')).toBe(0)
    expect(daysBetween('2026-04-19', '2026-04-20')).toBe(1)
    expect(daysBetween('2026-04-20', '2026-04-19')).toBe(-1)
  })

  it('crosses a leap day', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
  })
})

describe('todayBangkok', () => {
  afterEach(() => { vi.useRealTimers() })

  it('is still on the previous UTC day during a Bangkok morning', () => {
    // 02:00 in Bangkok on the 20th is 19:00 UTC on the 19th. Anything reading
    // the UTC date here would be a day behind.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-19T19:00:00Z'))
    expect(todayBangkok()).toBe('2026-04-20')
  })

  it('has already rolled over before UTC midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-19T17:30:00Z'))
    expect(todayBangkok()).toBe('2026-04-20')
  })
})
