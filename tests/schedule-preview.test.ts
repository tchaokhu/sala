import { describe, expect, it } from 'vitest'
import { buildPaymentSchedule, settleThrough } from '@/lib/payments'
import { describeSchedule, previewAmount } from '@/components/SchedulePreview'

const terms = {
  id: '',
  org_id: '',
  property_id: '',
  start_date: '2026-03-01',
  end_date: '2027-02-28',
  monthly_rent: 8000,
  deposit: 16000,
  commission: 8000,
  rented_by_us: true,
  rent_tracked_by_us: true,
}

describe('describeSchedule', () => {
  it('counts rent, paid rent and the one-offs', () => {
    const rows = settleThrough(buildPaymentSchedule(terms), '2026-08-01')
    expect(describeSchedule(rows)).toBe(
      '12 rent Payments of ฿8,000, 6 already paid · Deposit ฿16,000, already paid · Commission ฿8,000, already paid',
    )
  })

  it('drops the Deposit line on a renewal and says nothing for an empty schedule', () => {
    expect(describeSchedule(buildPaymentSchedule(terms, { depositHeld: true }))).toBe(
      '12 rent Payments of ฿8,000 · Commission ฿8,000',
    )
    expect(describeSchedule([])).toBeNull()
  })

  it('reads a money box the way the parser does', () => {
    expect(previewAmount('16,000')).toBe(16000)
    expect(previewAmount('abc')).toBe(0)
    expect(previewAmount('-5')).toBe(0)
  })
})
