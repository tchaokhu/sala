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

/** The part of a Rental its schedule is computed from. Narrower than `Rental`
 *  so the new-Rental form can preview a schedule for a Rental that has no row
 *  yet — the same function, not a second copy in the browser. */
export type ScheduleTerms = Pick<
  Rental,
  | 'id'
  | 'org_id'
  | 'property_id'
  | 'start_date'
  | 'end_date'
  | 'monthly_rent'
  | 'deposit'
  | 'commission'
  | 'rented_by_us'
  | 'rent_tracked_by_us'
>

/**
 * Build the Payments owed over the life of a Rental:
 *
 * - one `rent` record per month from `start_date` through `end_date`, inclusive
 *   when a due date lands exactly on `end_date` — but only when the Org follows
 *   the rent for this Rental (ADR 0011). Where nobody follows it, twelve rent
 *   rows would be a year of overdue money nobody expects to receive.
 * - one `deposit` on `start_date`, when there is a deposit and it is not
 *   already with the Owner from the Rental this one renews (`depositHeld`)
 * - one `commission` on `start_date`, but only when we brokered the deal —
 *   never bill a commission on a Rental we merely administer
 *
 * Deposit refunds are deliberately absent. The amount owed back is not known
 * until the Rental closes and deductions are agreed, so it is created then.
 */
export function buildPaymentSchedule(
  rental: ScheduleTerms,
  opts: { depositHeld?: boolean } = {},
): NewPayment[] {
  const records: NewPayment[] = []
  const base = {
    org_id: rental.org_id,
    rental_id: rental.id,
    property_id: rental.property_id,
    direction: 'in' as const,
  }

  if (rental.rent_tracked_by_us) {
    for (let i = 0; i < MAX_RENT_RECORDS; i++) {
      // Always step from the original anchor: Jan 31 + 2 months is Mar 31, not
      // Mar 28. Clamping a short month must not carry forward.
      const due = addMonthsIso(rental.start_date, i)
      if (due > rental.end_date) break
      records.push({ ...base, type: 'rent', due_date: due, amount: rental.monthly_rent })
    }
  }

  if (rental.deposit > 0 && !opts.depositHeld) {
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
 * The schedule with everything due on or before `paidThrough` written settled
 * in full — for a tenancy that started before anyone entered it. Without it,
 * backfilling a March tenancy in September puts six paid months on the
 * Overview as overdue. The paid-through day itself is included. Null leaves the
 * schedule untouched.
 */
export function settleThrough<T extends Pick<NewPayment, 'due_date' | 'amount'>>(
  schedule: T[],
  paidThrough: string | null,
): (T & { settled_date: string | null; settled_amount: number | null })[] {
  return schedule.map((p) =>
    paidThrough && p.due_date <= paidThrough
      ? { ...p, settled_date: p.due_date, settled_amount: p.amount }
      : { ...p, settled_date: null, settled_amount: null },
  )
}

/**
 * What ending a Rental on `onDate` deletes: unsettled Payments due after that
 * day. The end day itself is kept — a rent due on the day the Tenant leaves is
 * still owed. Same predicate as `end_rental` (0017), so the number a
 * confirmation shows is the number that goes.
 */
export function futureUnpaid<T extends { due_date: string; settled_date?: string | null }>(
  payments: T[],
  onDate: string,
): T[] {
  return payments.filter((p) => p.settled_date == null && p.due_date > onDate)
}

/**
 * Where a Payment stands today.
 *
 * Order matters: a partially settled Payment reports `partial` even when it is
 * past due. That is deliberate — someone needs to see the remainder, and
 * flagging it `overdue` hides the fact that money already arrived.
 */
export function getPaymentStatus(
  p: { amount: number; settled_amount?: number | null; due_date: string },
  today: string = todayBangkok(),
): PaymentStatus {
  const settled = p.settled_amount ?? 0
  if (settled >= p.amount) return 'settled'
  if (settled > 0) return 'partial'
  // ISO dates sort lexicographically, so this needs no Date objects.
  if (p.due_date < today) return 'overdue'
  return 'pending'
}

/** Total still owed on a Payment. Never negative — an overpayment is not a debt
 *  in the other direction. */
export function outstanding(p: { amount: number; settled_amount?: number | null }): number {
  return Math.max(0, p.amount - (p.settled_amount ?? 0))
}
