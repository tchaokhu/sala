// One line saying what a schedule from buildPaymentSchedule (+ settleThrough)
// will write — the new-Rental form and the Renew card show it before submitting.

import { CalendarClock } from 'lucide-react'
import { formatBaht } from '@/lib/format'
import type { PaymentType } from '@/types'

/** A money box as the preview reads it — the parser's comma rule, and 0 for
 *  anything it would refuse, since the refusal is the action's to word. */
export function previewAmount(value: string): number {
  const n = Number(value.replace(/,/g, '').trim())
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0
}

type Row = { type: PaymentType; amount: number; settled_date?: string | null }

export function describeSchedule(rows: Row[]): string | null {
  if (rows.length === 0) return null
  const parts: string[] = []
  const rent = rows.filter((r) => r.type === 'rent')
  if (rent.length > 0) {
    const paid = rent.filter((r) => r.settled_date).length
    parts.push(
      `${rent.length} rent ${rent.length === 1 ? 'Payment' : 'Payments'} of ${formatBaht(rent[0].amount)}` +
        (paid > 0 ? `, ${paid} already paid` : ''),
    )
  }
  for (const [type, label] of [
    ['deposit', 'Deposit'],
    ['commission', 'Commission'],
  ] as const) {
    const row = rows.find((r) => r.type === type)
    if (row) parts.push(`${label} ${formatBaht(row.amount)}${row.settled_date ? ', already paid' : ''}`)
  }
  return parts.join(' · ')
}

export function SchedulePreview({ rows, empty }: { rows: Row[]; empty: string }) {
  const text = describeSchedule(rows)
  return (
    <p
      aria-live="polite"
      className="tabular flex items-start gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-sm"
    >
      <CalendarClock size={16} aria-hidden className="mt-0.5 shrink-0 text-muted" />
      <span className={text ? '' : 'text-muted'}>{text ?? empty}</span>
    </p>
  )
}
