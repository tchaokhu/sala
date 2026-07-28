import { describe, expect, it } from 'vitest'
import { formatBaht } from './format'

describe('formatBaht', () => {
  it('groups thousands and drops the satang on a whole amount', () => {
    expect(formatBaht(3500)).toBe('฿3,500')
    expect(formatBaht(1250000)).toBe('฿1,250,000')
    expect(formatBaht(0)).toBe('฿0')
  })

  // Half a baht is ฿0.50, not ฿0.5 — a column of money with ragged decimals is
  // the thing tabular-nums exists to prevent.
  it('shows both satang digits when there are any', () => {
    expect(formatBaht(3500.5)).toBe('฿3,500.50')
    expect(formatBaht(0.05)).toBe('฿0.05')
  })

  // Rounds rather than truncates, and never renders a third decimal: the
  // database column is numeric(12,2), so anything longer is a bug upstream and
  // showing it half-formatted only hides that.
  it('rounds to satang', () => {
    expect(formatBaht(10.005)).toBe('฿10.01')
  })

  // Deposit refunds move outward. A caller that renders a direction as a sign
  // gets a leading minus, not a symbol stranded in the middle.
  it('puts the sign before the symbol', () => {
    expect(formatBaht(-1200)).toBe('-฿1,200')
  })

  // A missing number is not zero: zero overdue is good news, unknown is not.
  it('renders an absent amount as a dash', () => {
    expect(formatBaht(null)).toBe('—')
    expect(formatBaht(undefined)).toBe('—')
  })
})
