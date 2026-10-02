// The Rentals list. A Server Component — nothing here is interactive.

import Link from 'next/link'
import { Eye } from 'lucide-react'
import { getRentalStatus, type RentalListRow } from '@/lib/rentals'
import { formatBaht, formatDateThai } from '@/lib/format'
import { LET_ELSEWHERE_NAME } from '@/lib/rental-input'
import { RentalStatePill, Tag } from './StatusPill'
import { Bar } from '@/components/Skeleton'

const HEAD_CELL = 'px-4 py-3 font-semibold'

export function RentalTable({
  rows,
  slug,
  today,
}: {
  rows: RentalListRow[]
  slug: string
  today: string
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
        <p className="font-semibold">No Rentals found</p>
        <p className="mt-1 text-sm text-muted">
          Try a different filter, or
          <Link
            href={`/o/${slug}/rentals/new`}
            className="ml-1 text-accent underline-offset-4 hover:underline"
          >
            add a Rental
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="sticky-manage w-full min-w-[48rem] text-sm">
        <thead>
          <tr className="border-b border-border bg-bg/60 text-left text-[11px] tracking-wide text-muted">
            <th scope="col" className={HEAD_CELL}>Property</th>
            <th scope="col" className={HEAD_CELL}>Tenant</th>
            <th scope="col" className={HEAD_CELL}>Term</th>
            <th scope="col" className={`${HEAD_CELL} text-right`}>Rent/month</th>
            <th scope="col" className={HEAD_CELL}>State</th>
            <th scope="col" className={`${HEAD_CELL} text-right`}>Manage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { state, daysLeft } = getRentalStatus(row.endDate, today)
            return (
              <tr
                key={row.id}
                className="h-14 border-b border-border transition-colors last:border-0 hover:bg-bg/60"
              >
                <td className="px-4 py-3 font-medium">{row.propertyTitle}</td>
                <td className="px-4 py-3">
                  {row.letElsewhere ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <span className="block max-w-48 truncate">{row.tenantName}</span>
                  )}
                </td>
                <td className="tabular whitespace-nowrap px-4 py-3 text-muted">
                  {formatDateThai(row.startDate)} – {formatDateThai(row.endDate)}
                </td>
                <td className="tabular whitespace-nowrap px-4 py-3 text-right font-medium">
                  {row.letElsewhere ? <span className="text-muted">—</span> : formatBaht(row.monthlyRent)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <RentalStatePill status={row.status} state={state} daysLeft={daysLeft} />
                    {row.letElsewhere ? (
                      <Tag>{LET_ELSEWHERE_NAME}</Tag>
                    ) : (
                      !row.rentTrackedByUs && <Tag>Rent not followed</Tag>
                    )}
                    {row.status === 'active' && !row.letElsewhere && !row.hasContract && (
                      <Tag tone="warn">No contract</Tag>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/o/${slug}/rentals/${row.id}`}
                    aria-label={`View the Rental of ${row.propertyTitle}`}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted transition-colors hover:text-ink"
                  >
                    <Eye size={14} aria-hidden />
                    View
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function RentalTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="border-b border-border bg-bg/60 px-4 py-3">
        <Bar className="h-4 w-24" />
      </div>
      <div aria-hidden>
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="flex h-14 items-center gap-4 border-b border-border px-4 last:border-0"
          >
            <Bar className="h-4 flex-1" />
            <Bar className="h-4 w-28" />
            <Bar className="h-4 w-44" />
            <Bar className="h-4 w-20" />
            <Bar className="h-5 w-20 rounded-full" />
            <Bar className="h-4 w-12" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading the Rentals list</span>
    </div>
  )
}
