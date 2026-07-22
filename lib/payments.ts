// Payment scheduling and status. Pure, no I/O — this file must stay importable
// from a test with no database in sight.
//
// Ported from the-cozy-keys, where it lived inside a 1,400-line module that also
// held the Supabase client. The maths is unchanged and its tests came across
// with it; the date handling moved to lib/dates.ts to get off host-timezone
// arithmetic.

import { addMonthsIso, todayBangkok } from './dates'
import type { Payment, PaymentStatus, Rental } from '@/types'

/** A Payment as it looks before the database assigns it an id. */
export type NewPayment = Pick<
  Payment,
  'org_id' | 'rental_id' | 'property_id' | 'direction' | 'type' | 'due_date' | 'amount'
>

/** Safety guard on the rent loop — 50 years of monthly payments. A Rental that
 *  long is a data-entry error, and we would rather truncate than hang. */
const MAX_RENT_RECORDS = 600

/**
 * Build the Payments owed over the life of a Rental:
 *
 * - one `rent` record per month from `start_date` through `end_date`, inclusive
 *   when a due date lands exactly on `end_date`
 * - one `deposit` on `start_date`, when there is a deposit
 * - one `commission` on `start_date`, but only when we brokered the deal —
 *   never bill a commission on a Rental we merely administer
 *
 * Deposit refunds are deliberately absent. The amount owed back is not known
 * until the Rental closes and deductions are agreed, so it is created then.
 */
export function buildPaymentSchedule(rental: Rental): NewPayment[] {
  const records: NewPayment[] = []
  const base = {
    org_id: rental.org_id,
    rental_id: rental.id,
    property_id: rental.property_id,
    direction: 'in' as const,
  }

  for (let i = 0; i < MAX_RENT_RECORDS; i++) {
    // Always step from the original anchor: Jan 31 + 2 months is Mar 31, not
    // Mar 28. Clamping a short month must not carry forward.
    const due = addMonthsIso(rental.start_date, i)
    if (due > rental.end_date) break
    records.push({ ...base, type: 'rent', due_date: due, amount: rental.monthly_rent })
  }

  if (rental.deposit > 0) {
    records.push({
      ...base,
      type: 'deposit',
      due_date: rental.start_date,
      amount: rental.deposit,
    })
  }

  if (rental.rented_by_us && rental.commission > 0) {
    records.push({
      ...base,
      type: 'commission',
      due_date: rental.start_date,
      amount: rental.commission,
    })
  }

  return records
}

/**
 * Where a Payment stands today.
 *
 * Order matters: a partially settled Payment reports `partial` even when it is
 * past due. That is deliberate — someone needs to see the remainder, and
 * flagging it `overdue` hides the fact that money already arrived.
 */
export function getPaymentStatus(p: Payment, today: string = todayBangkok()): PaymentStatus {
  const settled = p.settled_amount ?? 0
  if (settled >= p.amount) return 'settled'
  if (settled > 0) return 'partial'
  // ISO dates sort lexicographically, so this needs no Date objects.
  if (p.due_date < today) return 'overdue'
  return 'pending'
}

/** Total still owed on a Payment. Never negative — an overpayment is not a debt
 *  in the other direction. */
export function outstanding(p: Payment): number {
  return Math.max(0, p.amount - (p.settled_amount ?? 0))
}
