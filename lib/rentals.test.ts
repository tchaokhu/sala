import { describe, expect, it } from 'vitest'
import { EXPIRING_SOON_DAYS, getRentalStatus } from './rentals'

// Every case pins "today" rather than letting the clock supply it, so the
// assertions keep meaning something tomorrow.
const TODAY = '2026-07-28'

describe('getRentalStatus', () => {
  it('has nothing to say about a Rental with no end date', () => {
    expect(getRentalStatus(null, TODAY)).toEqual({ daysLeft: null, state: null })
    expect(getRentalStatus(undefined, TODAY)).toEqual({ daysLeft: null, state: null })
  })

  it('counts the days left', () => {
    expect(getRentalStatus('2026-08-27', TODAY)).toEqual({ daysLeft: 30, state: 'expiring' })
    expect(getRentalStatus('2026-12-31', TODAY)).toEqual({ daysLeft: 156, state: 'active' })
  })

  // The two boundaries the buckets turn on. A Rental ending today is not yet
  // expired — the tenancy runs to the end of its last day — and the thirtieth
  // day is inside the warning window, not past it.
  it('places the boundaries at today and at the last day of the window', () => {
    expect(getRentalStatus(TODAY, TODAY)).toEqual({ daysLeft: 0, state: 'expiring' })
    expect(getRentalStatus('2026-08-27', TODAY).state).toBe('expiring') // +30
    expect(getRentalStatus('2026-08-28', TODAY).state).toBe('active')   // +31
    expect(getRentalStatus('2026-07-27', TODAY)).toEqual({ daysLeft: -1, state: 'expired' })
  })

  it('keeps the window and the boundary in step', () => {
    const lastDayInside = getRentalStatus('2026-08-27', TODAY)
    expect(lastDayInside.daysLeft).toBe(EXPIRING_SOON_DAYS)
    expect(lastDayInside.state).toBe('expiring')
  })

  // Crossing a month, and a year. The arithmetic is on the date parts, so
  // neither month lengths nor the host timezone enter into it.
  it('counts across month and year ends', () => {
    expect(getRentalStatus('2027-01-01', '2026-12-31').daysLeft).toBe(1)
    expect(getRentalStatus('2026-03-01', '2026-02-28').daysLeft).toBe(1) // 2026 is not a leap year
    expect(getRentalStatus('2024-03-01', '2024-02-28').daysLeft).toBe(2) // 2024 is
  })

  it('refuses a date it cannot read rather than guessing', () => {
    expect(() => getRentalStatus('28/07/2026', TODAY)).toThrow(/YYYY-MM-DD/)
  })
})
