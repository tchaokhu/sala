// Date helpers. Pure, no I/O.
//
// Everything here is anchored to Asia/Bangkok, and everything works on
// YYYY-MM-DD strings rather than Date objects wherever it can.
//
// The reason is a bug carried by the code this was ported from:
// `new Date('2026-01-15')` parses as UTC midnight, but `getDate()` and
// `setDate()` then operate in the *host* timezone. In UTC+7 the round trip
// happens to come out right, which is why it survived — but in any negative
// offset it lands a day early. Doing the arithmetic on the parts sidesteps the
// question entirely.

const pad = (n: number) => String(n).padStart(2, '0')

/** Today in Asia/Bangkok as YYYY-MM-DD. */
export function todayBangkok(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())
}

/** Split a YYYY-MM-DD string. Throws on anything else — silent coercion here
 *  is how off-by-one date bugs get into production. */
export function parseIsoDate(iso: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new Error(`Expected a YYYY-MM-DD date, got: ${iso}`)
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

/** Number of days in a given month. `month` is 1-based. */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one. UTC throughout, so
  // the host timezone never enters into it.
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Add N months to a YYYY-MM-DD string, clamping to the last day of the target
 * month — so Jan 31 + 1 month is Feb 28 (or 29), never Mar 3.
 *
 * Callers should always step from the original anchor rather than from the
 * previous result: Jan 31 + 1 is Feb 28, but Jan 31 + 2 is Mar 31, not Mar 28.
 * Clamping does not propagate.
 */
export function addMonthsIso(iso: string, n: number): string {
  const { year, month, day } = parseIsoDate(iso)
  const zeroBased = month - 1 + n
  const targetYear = year + Math.floor(zeroBased / 12)
  const targetMonth = ((zeroBased % 12) + 12) % 12 + 1
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth))
  return `${targetYear}-${pad(targetMonth)}-${pad(clampedDay)}`
}

/** Whole days from `fromIso` to `toIso`. Negative when `toIso` is in the past. */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = parseIsoDate(fromIso)
  const b = parseIsoDate(toIso)
  const from = Date.UTC(a.year, a.month - 1, a.day)
  const to = Date.UTC(b.year, b.month - 1, b.day)
  return Math.round((to - from) / 86_400_000)
}
