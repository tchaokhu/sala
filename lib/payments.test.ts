import { describe, it, expect } from 'vitest'
import { buildPaymentSchedule, futureUnpaid, getPaymentStatus, outstanding, settleThrough } from './payments'
import { addMonthsIso } from './dates'
import type { Payment, Rental } from '@/types'

// Ported from the-cozy-keys. Two changes:
//   - `today` is now an argument rather than the host clock, so these no longer
//     need fake timers to be deterministic.
//   - `paid_*` became `settled_*`; with Payments now having a direction,
//     "paid" was ambiguous on money going back out to a Tenant.

const rental = (overrides: Partial<Rental> = {}): Rental => ({
  id: 'r1',
  org_id: 'org1',
  property_id: 'p1',
  tenant_id: 't1',
  tenant_name_snapshot: 'Test Tenant',
  start_date: '2026-01-15',
  end_date: '2027-01-14',
  monthly_rent: 12000,
  deposit: 0,
  commission: 0,
  rented_by_us: false,
  // True so every case below written before the rent gate keeps its meaning.
  rent_tracked_by_us: true,
  status: 'active',
  created_at: '2026-01-15T00:00:00Z',
  updated_at: '2026-01-15T00:00:00Z',
  ...overrides,
})

const payment = (overrides: Partial<Payment> = {}): Payment => ({
  id: 'pay1',
  org_id: 'org1',
  rental_id: 'r1',
  property_id: 'p1',
  direction: 'in',
  type: 'rent',
  due_date: '2026-04-15',
  amount: 12000,
  created_at: '2026-01-15T00:00:00Z',
  updated_at: '2026-01-15T00:00:00Z',
  ...overrides,
})

const TODAY = '2026-04-19'

describe('addMonthsIso', () => {
  it('adds whole months for same day-of-month', () => {
    expect(addMonthsIso('2026-01-15', 0)).toBe('2026-01-15')
    expect(addMonthsIso('2026-01-15', 1)).toBe('2026-02-15')
    expect(addMonthsIso('2026-01-15', 11)).toBe('2026-12-15')
  })

  it('rolls year when month overflows December', () => {
    expect(addMonthsIso('2026-12-10', 1)).toBe('2027-01-10')
    expect(addMonthsIso('2026-12-10', 13)).toBe('2028-01-10')
  })

  it('clamps Jan 31 to Feb 28 in a non-leap year', () => {
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28')
  })

  it('clamps Jan 31 to Feb 29 in a leap year', () => {
    expect(addMonthsIso('2028-01-31', 1)).toBe('2028-02-29')
  })

  it('clamps Jan 31 to Apr 30', () => {
    expect(addMonthsIso('2026-01-31', 3)).toBe('2026-04-30')
  })

  it('does not drift when stepping through short months repeatedly', () => {
    // Jan 31 + 2 is Mar 31, not Mar 28 — the February clamp must not carry.
    expect(addMonthsIso('2026-01-31', 2)).toBe('2026-03-31')
  })

  it('rejects anything that is not a YYYY-MM-DD date', () => {
    expect(() => addMonthsIso('2026-1-5', 1)).toThrow()
    expect(() => addMonthsIso('2026-01-15T00:00:00Z', 1)).toThrow()
  })
})

describe('buildPaymentSchedule', () => {
  it('generates exactly N rent records for an N-month lease', () => {
    const records = buildPaymentSchedule(rental())
    const rents = records.filter(r => r.type === 'rent')
    expect(rents).toHaveLength(12)
    expect(rents[0].due_date).toBe('2026-01-15')
    expect(rents[11].due_date).toBe('2026-12-15')
  })

  it('includes the end-date month when due_date lands on end_date exactly', () => {
    const records = buildPaymentSchedule(rental({ start_date: '2026-01-15', end_date: '2026-04-15' }))
    const rents = records.filter(r => r.type === 'rent')
    expect(rents.map(r => r.due_date)).toEqual([
      '2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15',
    ])
  })

  it('excludes rents whose due_date falls after end_date', () => {
    const records = buildPaymentSchedule(rental({ start_date: '2026-01-15', end_date: '2026-04-14' }))
    const rents = records.filter(r => r.type === 'rent')
    expect(rents.map(r => r.due_date)).toEqual(['2026-01-15', '2026-02-15', '2026-03-15'])
  })

  it('sets each rent record amount to monthly_rent', () => {
    const records = buildPaymentSchedule(rental({ monthly_rent: 15500 }))
    expect(records.filter(r => r.type === 'rent').every(r => r.amount === 15500)).toBe(true)
  })

  it('does not include deposit record when deposit is 0', () => {
    expect(buildPaymentSchedule(rental({ deposit: 0 })).find(r => r.type === 'deposit')).toBeUndefined()
  })

  it('includes a single deposit record on start_date when deposit > 0', () => {
    const deposits = buildPaymentSchedule(rental({ deposit: 24000 })).filter(r => r.type === 'deposit')
    expect(deposits).toHaveLength(1)
    expect(deposits[0]).toMatchObject({ due_date: '2026-01-15', amount: 24000 })
  })

  it('skips commission when rented_by_us is false, even if commission > 0', () => {
    const records = buildPaymentSchedule(rental({ commission: 5000, rented_by_us: false }))
    expect(records.find(r => r.type === 'commission')).toBeUndefined()
  })

  it('includes commission on start_date when rented_by_us and commission > 0', () => {
    const records = buildPaymentSchedule(rental({ commission: 5000, rented_by_us: true }))
    const commissions = records.filter(r => r.type === 'commission')
    expect(commissions).toHaveLength(1)
    expect(commissions[0]).toMatchObject({ due_date: '2026-01-15', amount: 5000 })
  })

  it('includes both deposit and commission when both apply', () => {
    const types = buildPaymentSchedule(
      rental({ deposit: 24000, commission: 5000, rented_by_us: true }),
    ).map(r => r.type)
    expect(types.filter(t => t === 'deposit')).toHaveLength(1)
    expect(types.filter(t => t === 'commission')).toHaveLength(1)
  })

  it('handles Jan 31 start by clamping to last-day-of-month for short months', () => {
    const records = buildPaymentSchedule(rental({ start_date: '2026-01-31', end_date: '2026-05-30' }))
    const rents = records.filter(r => r.type === 'rent')
    // May 31 would overflow end_date, so it is excluded.
    expect(rents.map(r => r.due_date)).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',
    ])
  })

  it('propagates org_id, rental_id and property_id to every record', () => {
    const records = buildPaymentSchedule(rental({
      id: 'rental-xyz',
      org_id: 'org-xyz',
      property_id: 'prop-xyz',
      deposit: 1000,
      commission: 500,
      rented_by_us: true,
    }))
    expect(records.every(r =>
      r.org_id === 'org-xyz' && r.rental_id === 'rental-xyz' && r.property_id === 'prop-xyz',
    )).toBe(true)
  })

  it('marks every scheduled record as money coming in', () => {
    const records = buildPaymentSchedule(rental({ deposit: 1000, commission: 500, rented_by_us: true }))
    expect(records.every(r => r.direction === 'in')).toBe(true)
  })

  it('never schedules a deposit refund — the amount is not known until closing', () => {
    const records = buildPaymentSchedule(rental({ deposit: 24000 }))
    expect(records.find(r => r.type === 'deposit_refund')).toBeUndefined()
  })

  it('returns a single rent plus deposit when start_date equals end_date', () => {
    const records = buildPaymentSchedule(rental({
      start_date: '2026-01-15',
      end_date: '2026-01-15',
      deposit: 1000,
    }))
    expect(records.filter(r => r.type === 'rent')).toHaveLength(1)
    expect(records.find(r => r.type === 'deposit')).toBeDefined()
  })
})

describe('buildPaymentSchedule — the rent gate (ADR 0011)', () => {
  it('writes no rent when the Org does not follow it, and still the Deposit and Commission', () => {
    const types = buildPaymentSchedule(
      rental({ rent_tracked_by_us: false, deposit: 24000, commission: 12000, rented_by_us: true }),
    ).map(r => r.type)
    expect(types).toEqual(['deposit', 'commission'])
  })

  it('writes nothing at all for a Rental let by another agent', () => {
    expect(buildPaymentSchedule(rental({
      rent_tracked_by_us: false, rented_by_us: false, deposit: 0, commission: 0,
    }))).toEqual([])
  })
})

describe('buildPaymentSchedule — renewal (depositHeld)', () => {
  it('leaves the Deposit out: it is still with the Owner from the Rental before', () => {
    const records = buildPaymentSchedule(
      rental({ deposit: 24000, commission: 12000, rented_by_us: true }),
      { depositHeld: true },
    )
    expect(records.find(r => r.type === 'deposit')).toBeUndefined()
    expect(records.filter(r => r.type === 'commission')).toHaveLength(1)
    expect(records.filter(r => r.type === 'rent')).toHaveLength(12)
  })
})

describe('settleThrough', () => {
  const schedule = buildPaymentSchedule(rental({ deposit: 24000 }))

  it('settles everything due on or before the date, the day itself included', () => {
    const rows = settleThrough(schedule, '2026-03-15')
    const settled = rows.filter(r => r.settled_date !== null)
    // Jan, Feb and Mar rent, plus the Deposit on the start date.
    expect(settled).toHaveLength(4)
    expect(settled.every(r => r.settled_date === r.due_date && r.settled_amount === r.amount)).toBe(true)
    expect(rows.find(r => r.due_date === '2026-04-15')).toMatchObject({ settled_date: null, settled_amount: null })
  })

  it('stops the day before the next due date', () => {
    expect(settleThrough(schedule, '2026-03-14').filter(r => r.settled_date).length).toBe(3)
  })

  it('settles nothing when no date is given', () => {
    expect(settleThrough(schedule, null).every(r => r.settled_date === null)).toBe(true)
  })
})

describe('futureUnpaid', () => {
  const rows = [
    payment({ id: 'a', due_date: '2026-09-30' }),
    payment({ id: 'b', due_date: '2026-10-01' }),
    payment({ id: 'c', due_date: '2026-11-01', settled_date: '2026-09-01', settled_amount: 12000 }),
    payment({ id: 'd', due_date: '2026-12-01' }),
  ]

  it('is what ending on a date deletes: unsettled, due after that day', () => {
    expect(futureUnpaid(rows, '2026-09-30').map(p => p.id)).toEqual(['b', 'd'])
  })

  it('keeps the end day itself and never counts a settled row', () => {
    expect(futureUnpaid(rows, '2026-09-29').map(p => p.id)).toEqual(['a', 'b', 'd'])
    expect(futureUnpaid(rows, '2026-12-01')).toEqual([])
  })

  it('treats a null settled_date as unpaid, the way the database returns it', () => {
    expect(futureUnpaid([{ due_date: '2026-10-01', settled_date: null }], '2026-09-30')).toHaveLength(1)
  })
})

describe('getPaymentStatus', () => {
  it('returns "settled" when settled_amount equals amount', () => {
    expect(getPaymentStatus(payment({ amount: 12000, settled_amount: 12000 }), TODAY)).toBe('settled')
  })

  it('returns "settled" when settled_amount exceeds amount (overpayment)', () => {
    expect(getPaymentStatus(payment({ amount: 12000, settled_amount: 15000 }), TODAY)).toBe('settled')
  })

  it('returns "partial" when 0 < settled_amount < amount', () => {
    expect(getPaymentStatus(payment({ amount: 12000, settled_amount: 6000 }), TODAY)).toBe('partial')
  })

  it('returns "overdue" when unsettled and due_date is before today', () => {
    expect(getPaymentStatus(payment({ due_date: '2026-04-15' }), TODAY)).toBe('overdue')
  })

  it('returns "pending" when unsettled and due_date is today', () => {
    expect(getPaymentStatus(payment({ due_date: '2026-04-19' }), TODAY)).toBe('pending')
  })

  it('returns "pending" when unsettled and due_date is in the future', () => {
    expect(getPaymentStatus(payment({ due_date: '2026-05-15' }), TODAY)).toBe('pending')
  })

  it('treats settled_amount = 0 the same as undefined', () => {
    expect(getPaymentStatus(payment({ due_date: '2026-04-15', settled_amount: 0 }), TODAY)).toBe('overdue')
    expect(getPaymentStatus(payment({ due_date: '2026-05-15', settled_amount: 0 }), TODAY)).toBe('pending')
  })

  it('reports "partial" ahead of "overdue" so the remainder stays visible', () => {
    expect(
      getPaymentStatus(payment({ due_date: '2026-04-15', amount: 12000, settled_amount: 6000 }), TODAY),
    ).toBe('partial')
  })

  it('applies the same rules to money going back out', () => {
    const refund = payment({ direction: 'out', type: 'deposit_refund', due_date: '2026-04-15' })
    expect(getPaymentStatus(refund, TODAY)).toBe('overdue')
    expect(getPaymentStatus({ ...refund, settled_amount: 12000 }, TODAY)).toBe('settled')
  })
})

describe('outstanding', () => {
  it('reports the remainder on a partly settled Payment', () => {
    expect(outstanding(payment({ amount: 12000, settled_amount: 6000 }))).toBe(6000)
  })

  it('reports zero — never a negative — on an overpayment', () => {
    expect(outstanding(payment({ amount: 12000, settled_amount: 15000 }))).toBe(0)
  })
})
