// How much of a removed Org's recovery window is left, for the console to say.
//
// Pure and free of I/O, so the Orgs list and one Org's page count down from the
// same arithmetic rather than each doing the subtraction in JSX. The window
// itself is ORG_RECOVERY_DAYS in lib/org-input.ts, which the purge script
// measures in SQL against `deleted_at` — this file renders that window, it does
// not decide it.

import { daysBetween, todayBangkok } from '@/lib/dates'
import { ORG_RECOVERY_DAYS } from '@/lib/org-input'

/** The Bangkok calendar day a timestamptz falls on, as YYYY-MM-DD. */
export function bangkokDay(timestamp: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(
    new Date(timestamp),
  )
}

/** Days left before the purge script would take this Org, counted in whole
 *  Bangkok days: an Org removed at 23:00 reads as the full window all evening
 *  instead of losing a day to UTC (CLAUDE.md). Never negative — past the window
 *  it is 0, "gone at the next run", because nothing deletes it on a schedule. */
export function recoveryDaysLeft(deletedAt: string): number {
  const elapsed = daysBetween(bangkokDay(deletedAt), todayBangkok())
  return Math.max(ORG_RECOVERY_DAYS - elapsed, 0)
}
