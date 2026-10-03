import { describe, expect, it } from 'vitest'
import {
  defaultEndDate,
  parseEndRentalForm,
  parseRenewForm,
  parseRentalForm,
} from './rental-input'

const form = (fields: Record<string, string>) => ({ get: (name: string) => fields[name] ?? null })

const TENANT = '11111111-1111-1111-1111-111111111111'

const OURS = {
  property_id: 'p1',
  tenant_id: TENANT,
  start_date: '2026-03-01',
  end_date: '2027-02-28',
  monthly_rent: '8,000',
  deposit: '16000',
  commission: '8000',
  rented_by_us: 'on',
  rent_tracked_by_us: 'on',
}

describe('parseRentalForm', () => {
  it('reads a Rental with an existing Tenant', () => {
    const result = parseRentalForm(form(OURS))
    expect(result).toEqual({
      ok: true,
      values: {
        property_id: 'p1',
        tenant_id: TENANT,
        new_tenant: null,
        start_date: '2026-03-01',
        end_date: '2027-02-28',
        monthly_rent: 8000,
        deposit: 16000,
        commission: 8000,
        rented_by_us: true,
        rent_tracked_by_us: true,
        paid_through: null,
      },
    })
  })

  it('reads a new Tenant when none was picked, and requires the name', () => {
    const { tenant_id: _, ...rest } = OURS
    const result = parseRentalForm(form({ ...rest, tenant_name: ' Somchai ', tenant_phone: '081 234 5678', tenant_line_id: 'sc' }))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.values.tenant_id).toBeNull()
      expect(result.values.new_tenant).toEqual({ name: 'Somchai', phone: '081 234 5678', line_id: 'sc', note: null })
    }
    expect(parseRentalForm(form(rest))).toMatchObject({ ok: false })
  })

  it('refuses a bad phone without repeating it', () => {
    const { tenant_id: _, ...rest } = OURS
    const result = parseRentalForm(form({ ...rest, tenant_name: 'A', tenant_phone: 'call-me-0812' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).not.toContain('call-me')
  })

  it('refuses an end before the start, and an impossible date', () => {
    expect(parseRentalForm(form({ ...OURS, end_date: '2026-02-28' }))).toMatchObject({ ok: false })
    expect(parseRentalForm(form({ ...OURS, start_date: '2026-02-30' }))).toMatchObject({ ok: false })
  })

  it('refuses a Commission on a Rental we did not let, rather than dropping it', () => {
    const { rented_by_us: _, ...rest } = OURS
    const result = parseRentalForm(form(rest))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('Commission')
    expect(parseRentalForm(form({ ...rest, commission: '0' })).ok).toBe(true)
  })

  it('refuses both flags unticked — that is another agent\'s room, a Property status now', () => {
    const { rented_by_us: _a, rent_tracked_by_us: _b, ...rest } = OURS
    const result = parseRentalForm(form({ ...rest, commission: '' }))
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.message).toContain('Let elsewhere')
    // Either one ticked is a Rental of ours.
    expect(parseRentalForm(form({ ...rest, commission: '', rent_tracked_by_us: 'on' }))).toMatchObject({ ok: true })
  })

  it('refuses a followed rent of 0 — it would be a Payment of nothing', () => {
    expect(parseRentalForm(form({ ...OURS, monthly_rent: '0' }))).toMatchObject({ ok: false })
  })

  it('keeps money within the column', () => {
    expect(parseRentalForm(form({ ...OURS, deposit: '99999999999' }))).toMatchObject({ ok: false })
  })

  it('takes Paid through inside the term, both ends included, and refuses it outside', () => {
    expect(parseRentalForm(form({ ...OURS, paid_through: '2026-03-01' }))).toMatchObject({ ok: true, values: { paid_through: '2026-03-01' } })
    expect(parseRentalForm(form({ ...OURS, paid_through: '2027-02-28' }))).toMatchObject({ ok: true })
    expect(parseRentalForm(form({ ...OURS, paid_through: '2026-02-28' }))).toMatchObject({ ok: false })
    expect(parseRentalForm(form({ ...OURS, paid_through: '2027-03-01' }))).toMatchObject({ ok: false })
  })
})

describe('defaultEndDate', () => {
  it('is twelve months on, less a day', () => {
    expect(defaultEndDate('2026-03-01')).toBe('2027-02-28')
    expect(defaultEndDate('2026-01-31')).toBe('2027-01-30')
  })
})

describe('parseEndRentalForm', () => {
  const rental = { startDate: '2026-03-01', deposit: 16000 }
  // Fixed, so the cases do not depend on the day the suite runs.
  const TODAY = '2026-09-30'

  it('reads an end with a lowered refund and its due date', () => {
    expect(parseEndRentalForm(form({ ended_on: '2026-09-30', reason: ' moved out ', refund: '12000', refund_due: '2026-10-30' }), rental, TODAY))
      .toEqual({ ok: true, values: { ended_on: '2026-09-30', reason: 'moved out', refund: 12000, refund_due: '2026-10-30' } })
  })

  it('refuses a date before the start', () => {
    expect(parseEndRentalForm(form({ ended_on: '2026-02-28', refund: '0' }), rental, TODAY)).toMatchObject({ ok: false })
    expect(parseEndRentalForm(form({ ended_on: '2026-03-01', refund: '0' }), rental, TODAY)).toMatchObject({ ok: true })
  })

  it('refuses a refund above the Deposit', () => {
    const result = parseEndRentalForm(form({ ended_on: '2026-09-30', refund: '16001', refund_due: '2026-10-30' }), rental, TODAY)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('16,000')
  })

  it('refuses a refund due before the end, and accepts the end day itself', () => {
    expect(parseEndRentalForm(form({ ended_on: '2026-09-30', refund: '100', refund_due: '2026-09-29' }), rental, TODAY)).toMatchObject({ ok: false })
    expect(parseEndRentalForm(form({ ended_on: '2026-09-30', refund: '100', refund_due: '2026-09-30' }), rental, TODAY)).toMatchObject({ ok: true })
  })

  it('needs no due date when there is no refund', () => {
    expect(parseEndRentalForm(form({ ended_on: '2026-09-30', refund: '' }), rental, TODAY))
      .toEqual({ ok: true, values: { ended_on: '2026-09-30', reason: null, refund: 0, refund_due: null } })
  })

  it('refuses a reason past 500 characters', () => {
    expect(parseEndRentalForm(form({ ended_on: '2026-09-30', reason: 'x'.repeat(501) }), rental, TODAY)).toMatchObject({ ok: false })
  })

  it('refuses an end after today, and accepts today itself', () => {
    // A Tenant who has given notice is still in the room; ending is immediate.
    expect(parseEndRentalForm(form({ ended_on: '2026-10-01', refund: '0' }), rental, TODAY)).toMatchObject({ ok: false })
    expect(parseEndRentalForm(form({ ended_on: TODAY, refund: '0' }), rental, TODAY)).toMatchObject({ ok: true })
  })
})

describe('parseRenewForm', () => {
  const rental = { endDate: '2027-02-28', rentedByUs: true, rentTrackedByUs: true }

  it('starts the next Rental the day after the current one ends', () => {
    expect(parseRenewForm(form({ end_date: '2028-02-29', monthly_rent: '8500', commission: '8500' }), rental))
      .toEqual({ ok: true, values: { start_date: '2027-03-01', end_date: '2028-02-29', monthly_rent: 8500, commission: 8500 } })
  })

  it('needs the new end after the old one', () => {
    expect(parseRenewForm(form({ end_date: '2027-02-28', monthly_rent: '8500' }), rental)).toMatchObject({ ok: false })
  })

  it('refuses a Commission on a Rental we did not let', () => {
    expect(parseRenewForm(form({ end_date: '2028-02-29', monthly_rent: '8500', commission: '1' }), { ...rental, rentedByUs: false }))
      .toMatchObject({ ok: false })
  })
})
