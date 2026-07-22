// Rental lifecycle helpers. Pure, no I/O.

import { daysBetween, todayBangkok } from './dates'

export const EXPIRING_SOON_DAYS = 30

export type RentalState = 'expired' | 'expiring' | 'active' | null

/**
 * How much runway a Rental has left, and which bucket that puts it in.
 *
 * Anchored to Asia/Bangkok rather than the host clock, so a job running on a
 * UTC server and an agent looking at their laptop in Bangkok agree on what
 * "today" means. Cozy Keys used the host clock here and Asia/Bangkok elsewhere,
 * which is the kind of split that produces a rental that looks expired on one
 * screen and active on another.
 */
export function getRentalStatus(
  endDate?: string | null,
  today: string = todayBangkok(),
): { daysLeft: number | null; state: RentalState } {
  if (!endDate) return { daysLeft: null, state: null }
  const daysLeft = daysBetween(today, endDate)
  if (daysLeft < 0) return { daysLeft, state: 'expired' }
  if (daysLeft <= EXPIRING_SOON_DAYS) return { daysLeft, state: 'expiring' }
  return { daysLeft, state: 'active' }
}
