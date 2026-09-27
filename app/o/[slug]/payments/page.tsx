// The Payments list: the counts from one aggregate (org_payment_counts), then a
// bounded keyset page. Opens on Overdue — both directions, oldest due first —
// because that is the one list of everyone to chase (TASK decision 5).

import Link from 'next/link'
import { ChevronRight, ChevronsLeft } from 'lucide-react'
import { requireMember } from '@/lib/supabase-server'
import { todayBangkok } from '@/lib/dates'
import { formatBaht } from '@/lib/format'
import {
  DUE_SOON_DAYS,
  getPaymentCounts,
  isPaymentFilter,
  listPayments,
  PAYMENTS_PAGE_SIZE,
  type PaymentFilter,
} from '@/lib/payments-data'
import { PageHeader } from '@/components/PageHeader'
import { FilterChip, PagerLink } from '@/components/ListControls'
import { PaymentTable } from '@/components/PaymentTable'

export default async function PaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ filter?: string; cursor?: string }>
}) {
  const { slug } = await params
  const { filter: rawFilter, cursor } = await searchParams
  const filter: PaymentFilter = isPaymentFilter(rawFilter) ? rawFilter : 'overdue'

  const org = await requireMember(slug)
  const today = todayBangkok()

  const [counts, page] = await Promise.all([
    getPaymentCounts(org.id, today),
    listPayments(org.id, { filter, cursor, today }),
  ])

  const base = `/o/${slug}/payments`
  function link(opts: { filter?: PaymentFilter; cursor?: string } = {}) {
    const q = new URLSearchParams()
    if (opts.filter && opts.filter !== 'overdue') q.set('filter', opts.filter)
    if (opts.cursor) q.set('cursor', opts.cursor)
    const qs = q.toString()
    return qs ? `${base}?${qs}` : base
  }

  // The badges are fixed whatever the filter. Where a count is narrower than
  // the list its chip opens — refunds late of all refunds, settled this month
  // of all settled — the badge says so in words.
  const chips: { filter: PaymentFilter; label: string; count?: React.ReactNode; tone?: 'warn' }[] = [
    {
      filter: 'overdue',
      label: 'Overdue',
      count:
        counts.overdueCount > 0
          ? `${counts.overdueCount} · ${formatBaht(counts.overdueAmount)}`
          : counts.overdueCount,
      tone: counts.overdueCount > 0 ? 'warn' : undefined,
    },
    {
      filter: 'refunds',
      label: 'Refunds',
      count:
        counts.refundsLateCount > 0
          ? `${counts.refundsLateCount} late · ${formatBaht(counts.refundsLateAmount)}`
          : undefined,
      tone: counts.refundsLateCount > 0 ? 'warn' : undefined,
    },
    { filter: 'due_soon', label: 'Due soon', count: counts.dueSoonCount },
    { filter: 'settled', label: 'Settled', count: `${counts.settledThisMonthCount} this month` },
    { filter: 'all', label: 'All' },
  ]

  const firstPage = !cursor
  const empty =
    filter === 'overdue' && firstPage ? (
      <>
        <p className="font-semibold">Nothing overdue</p>
        <p className="mt-1 text-sm text-muted">
          Every Payment past its due date is settled.
          <Link
            href={link({ filter: 'due_soon' })}
            className="ml-1 text-accent underline-offset-4 hover:underline"
          >
            See what is due in the next {DUE_SOON_DAYS} days
          </Link>
        </p>
      </>
    ) : (
      <>
        <p className="font-semibold">No Payments found</p>
        <p className="mt-1 text-sm text-muted">Try a different filter.</p>
      </>
    )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payments"
        summary={
          <>
            <span className="tabular mr-1 font-semibold text-ink">{formatBaht(counts.overdueAmount)}</span>
            overdue
          </>
        }
      />

      <nav aria-label="Filter Payments" className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <FilterChip
            key={c.filter}
            href={link({ filter: c.filter })}
            active={filter === c.filter}
            label={c.label}
            count={c.count}
            tone={c.tone}
          />
        ))}
      </nav>

      <PaymentTable rows={page.rows} slug={slug} today={today} empty={empty} />

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <span>
          {page.rows.length > 0 ? (
            <>
              Showing <span className="tabular font-semibold text-ink">{page.rows.length}</span>
              {page.nextCursor ? ' — more on the next page' : ''}
            </>
          ) : (
            'Nothing to show'
          )}
        </span>
        <div className="flex items-center gap-2">
          <PagerLink href={link({ filter })} disabled={firstPage} icon={ChevronsLeft} label="First page" />
          <PagerLink
            href={link({ filter, cursor: page.nextCursor ?? undefined })}
            disabled={!page.nextCursor}
            icon={ChevronRight}
            iconSide="right"
            label={`Next ${PAYMENTS_PAGE_SIZE}`}
          />
        </div>
      </div>
    </div>
  )
}
