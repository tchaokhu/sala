import { describe, expect, it } from 'vitest'
import { isPropertyStatus, keysetFilter, PAGE_SIZE } from './properties'

describe('keysetFilter', () => {
  const key = { createdAt: '2026-07-28T10:15:00.000Z', id: '0a000000-0000-0000-0000-0000000000a1' }

  // "Strictly after the last row" in a two-part sort order. Getting this wrong
  // in the `=` branch is what makes a page repeat its first row forever.
  it('asks for everything after the last row in the sort order', () => {
    expect(keysetFilter(key)).toBe(
      'created_at.lt.2026-07-28T10:15:00.000Z,' +
      'and(created_at.eq.2026-07-28T10:15:00.000Z,id.lt.0a000000-0000-0000-0000-0000000000a1)',
    )
  })

  // Postgres stores timestamptz to the microsecond; a JavaScript Date holds
  // milliseconds. Round-tripping the cursor through one drops the last three
  // digits, after which `eq` matches no row and `lt` excludes every row that
  // shared the cursor's timestamp — which, after a batch import, is all of
  // them. The timestamp must come back out exactly as it went in.
  it('preserves the timestamp Postgres wrote, to the microsecond', () => {
    const exact = { ...key, createdAt: '2026-07-28T10:15:00.123456+00:00' }
    expect(keysetFilter(exact)).toContain('created_at.lt.2026-07-28T10:15:00.123456+00:00')
    expect(keysetFilter(exact)).toContain('created_at.eq.2026-07-28T10:15:00.123456+00:00')
  })
})

describe('isPropertyStatus', () => {
  // The status arrives in a query string, so it is attacker-controlled and goes
  // straight into a filter. Anything unrecognised is dropped rather than sent.
  it('accepts only the three the schema defines', () => {
    expect(isPropertyStatus('available')).toBe(true)
    expect(isPropertyStatus('reserved')).toBe(true)
    expect(isPropertyStatus('rented')).toBe(true)
    expect(isPropertyStatus('deleted')).toBe(false)
    expect(isPropertyStatus('')).toBe(false)
    expect(isPropertyStatus(null)).toBe(false)
    expect(isPropertyStatus(['rented'])).toBe(false)
  })
})

describe('PAGE_SIZE', () => {
  it('is bounded', () => {
    expect(PAGE_SIZE).toBeGreaterThan(0)
    expect(PAGE_SIZE).toBeLessThanOrEqual(100)
  })
})
