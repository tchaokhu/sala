// The Payments list. A Server Component; the Settle / Correct control in the
// last column is the only client part.

import Link from 'next/link'
import { formatBaht, formatDateThai } from '@/lib/format'
import { getPaymentStatus, payerOf } from '@/lib/payments'
import type { PaymentListRow } from '@/lib/payments-data'
import { PaymentSettle } from './PaymentSettle'
import { PAYMENT_TYPE_LABELS, PaymentStatusPill } from './StatusPill'
import { Bar } from '@/components/Skeleton'

const HEAD_CELL = 'px-4 py-3 font-semibold'

export function PaymentTable({
  rows,
  slug,
  today,
  empty,
}: {
  rows: PaymentListRow[]
  slug: string
  today: string
  /** What an empty page says — it depends on the filter. */
  empty: React.ReactNode
}) {
  if (rows.length === 0) {
    return <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">{empty}</div>
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="sticky-manage w-full min-w-[64rem] text-sm">
        <thead>
          <tr className="border-b border-border bg-bg/60 text-left text-[11px] tracking-wide text-muted">
            <th scope="col" className={HEAD_CELL}>Due</th>
            <th scope="col" className={HEAD_CELL}>Property</th>
            <th scope="col" className={HEAD_CELL}>Who pays</th>
            <th scope="col" className={HEAD_CELL}>Type</th>
            <th scope="col" className={`${HEAD_CELL} text-right`}>Amount</th>
            <th scope="col" className={`${HEAD_CELL} text-right`}>Outstanding</th>
            <th scope="col" className={HEAD_CELL}>Status</th>
            <th scope="col" className={`${HEAD_CELL} text-right`}>Manage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const type = PAYMENT_TYPE_LABELS[row.type]
            return (
              <tr
                key={row.id}
                className="h-14 border-b border-border transition-colors last:border-0 hover:bg-bg/60"
              >
                <td className="tabular whitespace-nowrap px-4 py-3 text-muted">{formatDateThai(row.due_date)}</td>
                <td className="px-4 py-3 font-medium">
                  <Link
                    href={`/o/${slug}/rentals/${row.rental_id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {row.property_title}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {payerOf(row.type) === 'tenant' ? (
                    <span className="block max-w-48 truncate">{row.tenant_name}</span>
                  ) : (
                    <span className="text-muted">Owner</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">{type}</td>
                <td className="tabular whitespace-nowrap px-4 py-3 text-right">{formatBaht(row.amount)}</td>
                <td className="tabular whitespace-nowrap px-4 py-3 text-right font-medium">
                  {row.outstanding > 0 ? formatBaht(row.outstanding) : <span className="text-muted">—</span>}
                </td>
                <td className="px-4 py-3">
                  <PaymentStatusPill status={getPaymentStatus(row, today)} />
                </td>
                <td className="px-4 py-3 text-right">
                  <PaymentSettle
                    slug={slug}
                    payment={{
                      id: row.id,
                      amount: row.amount,
                      settled_amount: row.settled_amount,
                      settled_date: row.settled_date,
                      method: row.method,
                      note: row.note,
                      outstanding: row.outstanding,
                    }}
                    today={today}
                    title={`${type} due ${formatDateThai(row.due_date)} · ${row.property_title}`}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function PaymentTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="border-b border-border bg-bg/60 px-4 py-3">
        <Bar className="h-4 w-24" />
      </div>
      <div aria-hidden>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex h-14 items-center gap-4 border-b border-border px-4 last:border-0">
            <Bar className="h-4 w-24" />
            <Bar className="h-4 flex-1" />
            <Bar className="h-4 w-28" />
            <Bar className="h-4 w-16" />
            <Bar className="h-4 w-20" />
            <Bar className="h-4 w-20" />
            <Bar className="h-5 w-20 rounded-full" />
            <Bar className="h-4 w-24" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading the Payments list</span>
    </div>
  )
}
