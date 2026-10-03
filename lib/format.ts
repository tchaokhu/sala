// Display formatting. Pure, no I/O.

import { parseIsoDate } from './dates'

/** Baht for the screen: grouped, symbol attached, satang only when there are
 *  any. Render it in a `.tabular` element and right-align it (CLAUDE.md) — the
 *  grouping is only half of what makes a column of money scannable.
 *
 *  Null and undefined are a dash rather than ฿0, because the two mean opposite
 *  things: nothing is owed, versus we have not worked out what is owed. */
export function formatBaht(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—'
  // Decide the digits from the rounded value, so 10.005 becomes ฿10.01 rather
  // than tripping the integer check on the way in and printing ฿10.
  const satang = Math.round(amount * 100) % 100
  const digits = satang === 0 ? 0 : 2
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'THB',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount)
}

/** A `date` column written out for the English UI: `31 Aug 2026` — day, short
 *  month name, Gregorian year.
 *
 *  Built from the date parts and formatted in UTC, never from
 *  `new Date('2026-12-31')` interpreted in the host zone — that is the ported
 *  bug in lib/dates.ts, and it moves a day backwards for any negative offset.
 *  A `date` has no time in it, so there is no instant to convert. */
export function formatDateThai(iso: string | null | undefined): string {
  if (!iso) return '—'
  const { year, month, day } = parseIsoDate(iso)
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

/** A file size the way a person reads it: KB under a megabyte, MB above. */
export function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`
}
