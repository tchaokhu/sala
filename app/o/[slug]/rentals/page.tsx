// The Rental list: the counts from one aggregate (org_rental_counts), then a
// bounded keyset page. Filter and cursor live in the URL, as on Properties.

import Link from 'next/link'
import { ChevronRight, ChevronsLeft, Plus, Trash2 } from 'lucide-react'
import { requireMember } from '@/lib/supabase-server'
import { todayBangkok } from '@/lib/dates'
import {
  getRentalCounts,
  isRentalFilter,
  listRentals,
  RENTALS_PAGE_SIZE,
  type RentalCounts,
  type RentalFilter,
} from '@/lib/rentals'
import { LET_ELSEWHERE_NAME } from '@/lib/rental-input'
import { PageHeader } from '@/components/PageHeader'
import { FilterChip, PagerLink } from '@/components/ListControls'
import { RentalTable } from '@/components/RentalTable'

const CHIPS: { filter: RentalFilter; label: string; count: keyof RentalCounts; tone?: 'warn' }[] = [
  { filter: 'active', label: 'Active', count: 'active' },
  { filter: 'let_elsewhere', label: LET_ELSEWHERE_NAME, count: 'letElsewhere' },
  { filter: 'ending_this_month', label: 'Ending this month', count: 'endingThisMonth' },
  { filter: 'past_end_date', label: 'Past end date', count: 'pastEndDate', tone: 'warn' },
  { filter: 'ended', label: 'Ended', count: 'ended' },
]

export default async function RentalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ filter?: string; cursor?: string; deleted?: string }>
}) {
  const { slug } = await params
  const { filter: rawFilter, cursor, deleted } = await searchParams
  const filter: RentalFilter | null = isRentalFilter(rawFilter) ? rawFilter : null

  const org = await requireMember(slug)
  // One "today" for the counts, the filter and every row's pill, so a chip's
  // number and the rows under it cannot straddle midnight.
  const today = todayBangkok()

  const [counts, page] = await Promise.all([
    getRentalCounts(org.id, today),
    listRentals(org.id, { filter, cursor, today }),
  ])

  const base = `/o/${slug}/rentals`
  function link(opts: { filter?: RentalFilter | null; cursor?: string } = {}) {
    const q = new URLSearchParams()
    if (opts.filter) q.set('filter', opts.filter)
    if (opts.cursor) q.set('cursor', opts.cursor)
    const qs = q.toString()
    return qs ? `${base}?${qs}` : base
  }

  // Every Rental is active (ours or let elsewhere) or ended; `cancelled` is
  // never written (TASK decision 8).
  const total = counts.active + counts.letElsewhere + counts.ended
  const matching = filter ? counts[CHIPS.find((c) => c.filter === filter)!.count] : total
  const showing = page.rows.length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Rentals"
        summary={
          <>
            <span className="tabular mr-1 font-semibold text-ink">{counts.active}</span> active
          </>
        }
        actions={
          <Link
            href={`${base}/new`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent bg-accent px-3 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
          >
            <Plus size={16} aria-hidden />
            Add Rental
          </Link>
        }
      />

      {deleted && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted"
        >
          <Trash2 size={16} aria-hidden />
          Rental deleted. Its Property is Available again.
        </p>
      )}

      <nav aria-label="Filter Rentals" className="flex flex-wrap gap-2">
        <FilterChip href={link()} active={filter === null} label="All" count={total} />
        {CHIPS.map((c) => (
          <FilterChip
            key={c.filter}
            href={link({ filter: c.filter })}
            active={filter === c.filter}
            label={c.label}
            count={counts[c.count]}
            tone={c.tone}
          />
        ))}
      </nav>

      <RentalTable rows={page.rows} slug={slug} today={today} />

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <span>
          {showing > 0 ? (
            <>
              Showing <span className="tabular font-semibold text-ink">{showing}</span> of{' '}
              <span className="tabular font-semibold text-ink">{matching}</span>
            </>
          ) : (
            'Nothing to show'
          )}
        </span>
        <div className="flex items-center gap-2">
          <PagerLink href={link({ filter })} disabled={!cursor} icon={ChevronsLeft} label="First page" />
          <PagerLink
            href={link({ filter, cursor: page.nextCursor ?? undefined })}
            disabled={!page.nextCursor}
            icon={ChevronRight}
            iconSide="right"
            label={`Next ${RENTALS_PAGE_SIZE}`}
          />
        </div>
      </div>
    </div>
  )
}
