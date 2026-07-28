// Display formatting. Pure, no I/O.

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
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount)
}
