// The Property list itself. A Server Component — nothing here is interactive,
// so none of it needs to reach the browser as JavaScript.
//
// Money is tabular and right-aligned, so a column of rents can be compared at a
// glance. The Rental behind an occupied Property is shown where it matters —
// who is in it and when that ends — because "Rented" on its own does not tell
// an agent whether this row needs work this month.
//
// The leading cell carries a tile with the Property's type in it. It is the
// row's anchor for the eye scanning down the column, and it is drawn from data
// the row already has rather than from an image the list query does not fetch.

import { Building, Building2, Eye, Home, Pencil, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { getRentalStatus } from '@/lib/rentals'
import { formatBaht, formatDateThai } from '@/lib/format'
import { PROPERTY_TYPE_LABELS as TYPE_LABELS } from '@/lib/property-input'
import { StatusPill } from './StatusPill'
import { PropertyDeleteAction } from './PropertyDeleteAction'
import type { PropertyListRow } from '@/lib/properties'

const TYPE_ICONS: Record<PropertyListRow['propertyType'], LucideIcon> = {
  condo: Building2,
  house: Home,
  townhome: Building,
}

/** How much runway the tenancy has, as words rather than a colour alone. */
function RentalEnd({ endDate }: { endDate: string }) {
  const { daysLeft, state } = getRentalStatus(endDate)
  const tone =
    state === 'expired' ? 'text-warn' : state === 'expiring' ? 'text-hold' : 'text-muted'
  const note =
    state === 'expired'
      ? `${Math.abs(daysLeft ?? 0)} days overdue`
      : state === 'expiring'
        ? `${daysLeft} days left`
        : null

  return (
    <span className={`whitespace-nowrap text-xs ${tone}`}>
      to {formatDateThai(endDate)}
      {note ? ` · ${note}` : ''}
    </span>
  )
}

const HEAD_CELL = 'px-4 py-3 font-semibold'

export function PropertyTable({
  rows,
  slug,
  newHref,
}: {
  rows: PropertyListRow[]
  /** The Org this list belongs to — the edit link's other half. It comes from
   *  the route, not from a row. */
  slug: string
  newHref?: string
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
        <p className="font-semibold">No Properties found</p>
        {/* The advice was already here. Its second half is now a door rather
            than a suggestion. */}
        <p className="mt-1 text-sm text-muted">
          Try a different status filter, or
          {newHref ? (
            <Link href={newHref} className="ml-1 text-accent underline-offset-4 hover:underline">
              add a Property
            </Link>
          ) : (
            ' add a Property'
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="sticky-manage w-full min-w-[68rem] text-sm">
        <thead>
          <tr className="border-b border-border bg-bg/60 text-left text-[11px] tracking-wide text-muted">
            <th scope="col" className={HEAD_CELL}>Property</th>
            <th scope="col" className={HEAD_CELL}>Type</th>
            <th scope="col" className={HEAD_CELL}>Size</th>
            <th scope="col" className={`${HEAD_CELL} text-right`}>Rent/month</th>
            <th scope="col" className={HEAD_CELL}>Status</th>
            <th scope="col" className={HEAD_CELL}>Current Tenant</th>
            <th scope="col" className={HEAD_CELL}>Owner</th>
            <th scope="col" className={HEAD_CELL}>Posted</th>
            <th scope="col" className={`${HEAD_CELL} text-right`}>Manage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const TypeIcon = TYPE_ICONS[row.propertyType]
            return (
              <tr
                key={row.id}
                className="border-b border-border transition-colors last:border-0 hover:bg-bg/60"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent"
                    >
                      <TypeIcon size={18} />
                    </span>
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span className="truncate font-medium">{row.title}</span>
                      <span className="h-4 truncate text-xs text-muted">
                        {row.roomNumber ? `Room ${row.roomNumber}` : ''}
                      </span>
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">{TYPE_LABELS[row.propertyType]}</td>
                <td className="tabular whitespace-nowrap px-4 py-3 text-muted">
                  {row.bedrooms} bed · {row.bathrooms} bath · {row.areaSqm} sq m
                </td>
                <td className="tabular whitespace-nowrap px-4 py-3 text-right font-medium">
                  {formatBaht(row.priceMonthly)}
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={row.status} />
                </td>
                <td className="px-4 py-3">
                  {row.tenantName ? (
                    <div className="flex flex-col gap-0.5">
                      <span>{row.tenantName}</span>
                      {row.rentalEndDate && <RentalEnd endDate={row.rentalEndDate} />}
                    </div>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {row.ownerName ? (
                    <span className="block max-w-40 truncate">{row.ownerName}</span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {/* A room advertised nowhere gets a chip of its own rather
                      than an em dash: this is the state the list is scanned
                      for, so it reads as form and not only as colour
                      (CLAUDE.md). */}
                  {row.postedOn.length > 0 ? (
                    <div className="flex max-w-48 flex-wrap gap-1">
                      {row.postedOn.map((name) => (
                        <span
                          key={name}
                          className="rounded border border-border px-1.5 py-0.5 text-xs text-muted"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="inline-block rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-xs font-medium text-warn">
                      Nowhere
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {/* Named for a screen reader, which hears a column of
                      identical "View"/"Edit" links otherwise. */}
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      href={`/o/${slug}/properties/${row.id}`}
                      aria-label={`View ${row.title}`}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted transition-colors hover:text-ink"
                    >
                      <Eye size={14} aria-hidden />
                      View
                    </Link>
                    <Link
                      href={`/o/${slug}/properties/${row.id}/edit`}
                      aria-label={`Edit ${row.title}`}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted transition-colors hover:text-ink"
                    >
                      <Pencil size={14} aria-hidden />
                      Edit
                    </Link>
                    <PropertyDeleteAction slug={slug} propertyId={row.id} title={row.title} />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** The same table's geometry with bars in it. Rows are a fixed height here and
 *  in the real thing, so the list does not jump when the data lands. */
export function PropertyTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="border-b border-border bg-bg/60 px-4 py-3">
        <span className="block h-4 w-24 animate-pulse rounded bg-border" aria-hidden />
      </div>
      <div aria-hidden>
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0"
          >
            <span className="block h-9 w-9 shrink-0 animate-pulse rounded-lg bg-border" />
            <span className="block h-4 flex-1 animate-pulse rounded bg-border" />
            <span className="block h-4 w-16 animate-pulse rounded bg-border" />
            <span className="block h-4 w-20 animate-pulse rounded bg-border" />
            <span className="block h-5 w-16 animate-pulse rounded-full bg-border" />
            <span className="block h-4 w-24 animate-pulse rounded bg-border" />
            <span className="block h-5 w-20 animate-pulse rounded bg-border" />
            <span className="block h-4 w-12 animate-pulse rounded bg-border" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading the Properties list</span>
    </div>
  )
}
