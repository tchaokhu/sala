// One Rental: its facts, its Payments with Settle / Correct on each, and the
// transitions it can still take.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Home } from 'lucide-react'
import { requireMember } from '@/lib/supabase-server'
import { todayBangkok } from '@/lib/dates'
import { formatBaht, formatDateThai } from '@/lib/format'
import { getPaymentStatus, outstanding } from '@/lib/payments'
import { LET_ELSEWHERE_NAME } from '@/lib/rental-input'
import { getRental, getRentalStatus, listPaymentsForRental } from '@/lib/rentals'
import { PageHeader } from '@/components/PageHeader'
import { BUTTON } from '@/components/form'
import { PaymentSettle } from '@/components/PaymentSettle'
import { PAYMENT_TYPE_LABELS, PaymentStatusPill, RentalStatePill, Tag } from '@/components/StatusPill'
import { RentalManage } from './rental-forms'

const bangkokDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' })

export default async function RentalPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const org = await requireMember(slug)

  const [rental, { payments, capped }] = await Promise.all([
    getRental(org.id, id),
    listPaymentsForRental(org.id, id),
  ])
  if (!rental) notFound()

  const today = todayBangkok()
  const { state, daysLeft } = getRentalStatus(rental.endDate, today)
  const anySettled = payments.some((p) => p.settled_date !== null || (p.settled_amount ?? 0) > 0)
  // A capped list cannot prove nothing further down is settled, so no offer.
  const deletable = !anySettled && rental.documentCount === 0 && !capped

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`/o/${slug}/rentals`}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
        >
          <ChevronLeft size={16} aria-hidden />
          Back to the Rentals list
        </Link>
        <PageHeader
          title={rental.propertyTitle}
          summary={
            <span className="flex items-center gap-1.5">
              <RentalStatePill status={rental.status} state={state} daysLeft={daysLeft} />
              {rental.letElsewhere ? (
                <Tag>{LET_ELSEWHERE_NAME}</Tag>
              ) : (
                !rental.rentTrackedByUs && <Tag>Rent not followed</Tag>
              )}
            </span>
          }
          actions={
            <Link
              href={`/o/${slug}/properties/${rental.propertyId}`}
              className={`${BUTTON} inline-flex items-center gap-1.5`}
            >
              <Home size={14} aria-hidden />
              View the Property
            </Link>
          }
        />
      </div>

      <section className="grid gap-4 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Tenant" value={rental.letElsewhere ? '—' : rental.tenantName} />
        <Fact label="Phone" value={rental.tenantPhone ?? '—'} tabular />
        <Fact
          label="Term"
          value={`${formatDateThai(rental.startDate)} – ${formatDateThai(rental.endDate)}`}
          tabular
        />
        <Fact
          label="Rent/month"
          value={rental.letElsewhere ? '—' : formatBaht(rental.monthlyRent)}
          tabular
        />
        <Fact label="Deposit" value={rental.letElsewhere ? '—' : formatBaht(rental.deposit)} tabular />
        <Fact
          label="Commission"
          value={rental.rentedByUs ? formatBaht(rental.commission) : '—'}
          tabular
        />
        <Fact label="Let by" value={rental.rentedByUs ? 'Us' : 'Another agent'} />
        <Fact label="Rent" value={rental.rentTrackedByUs ? 'Followed by us' : 'Not followed'} />
        {rental.status !== 'active' && (
          <>
            <Fact
              label="Ended on"
              value={rental.endedAt ? formatDateThai(bangkokDate.format(new Date(rental.endedAt))) : '—'}
              tabular
            />
            <div className="flex flex-col gap-1 sm:col-span-1 lg:col-span-3">
              <span className="text-xs text-muted">Reason</span>
              <span className="font-medium whitespace-pre-wrap">{rental.endedReason ?? '—'}</span>
            </div>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">
          Payments <span className="tabular ml-1 text-sm font-normal text-muted">{payments.length}</span>
        </h2>
        {payments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted">
            {rental.letElsewhere
              ? `No Payments: ${LET_ELSEWHERE_NAME.toLowerCase()}`
              : 'No Payments on this Rental — the rent is not followed and there is no Deposit or Commission'}
          </p>
        ) : (
          <PaymentsTable slug={slug} payments={payments} today={today} />
        )}
        {capped && (
          <p className="text-xs text-warn">
            Showing the first {payments.length} Payments — this Rental has more, which usually means
            its term was entered wrong. Delete it and enter it again if nothing is settled.
          </p>
        )}
      </section>

      <RentalManage
        slug={slug}
        rental={{
          id: rental.id,
          status: rental.status,
          startDate: rental.startDate,
          endDate: rental.endDate,
          monthlyRent: rental.monthlyRent,
          deposit: rental.deposit,
          commission: rental.commission,
          rentedByUs: rental.rentedByUs,
          rentTrackedByUs: rental.rentTrackedByUs,
          letElsewhere: rental.letElsewhere,
        }}
        payments={payments.map((p) => ({ due_date: p.due_date, settled_date: p.settled_date }))}
        today={today}
        deletable={deletable}
      />
    </div>
  )
}

const HEAD_CELL = 'px-4 py-3 font-semibold'

function PaymentsTable({
  slug,
  payments,
  today,
}: {
  slug: string
  payments: Awaited<ReturnType<typeof listPaymentsForRental>>['payments']
  today: string
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[52rem] text-sm">
        <thead>
          <tr className="border-b border-border bg-bg/60 text-left text-[11px] tracking-wide text-muted">
            <th scope="col" className={HEAD_CELL}>Type</th>
            <th scope="col" className={HEAD_CELL}>Due</th>
            <th scope="col" className={`${HEAD_CELL} text-right`}>Amount</th>
            <th scope="col" className={`${HEAD_CELL} text-right`}>Outstanding</th>
            <th scope="col" className={HEAD_CELL}>Status</th>
            <th scope="col" className={HEAD_CELL}>Settled</th>
            <th scope="col" className={`${HEAD_CELL} text-right`}>Manage</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => {
            const left = outstanding(p)
            return (
              <tr key={p.id} className="h-12 border-b border-border last:border-0">
                <td className="px-4 py-2">{PAYMENT_TYPE_LABELS[p.type]}</td>
                <td className="tabular whitespace-nowrap px-4 py-2 text-muted">{formatDateThai(p.due_date)}</td>
                <td className="tabular whitespace-nowrap px-4 py-2 text-right font-medium">
                  {formatBaht(p.amount)}
                </td>
                <td className="tabular whitespace-nowrap px-4 py-2 text-right">
                  {left > 0 ? formatBaht(left) : <span className="text-muted">—</span>}
                </td>
                <td className="px-4 py-2">
                  <PaymentStatusPill status={getPaymentStatus(p, today)} />
                </td>
                <td className="tabular whitespace-nowrap px-4 py-2 text-muted">
                  {p.settled_date
                    ? `${formatDateThai(p.settled_date)} · ${formatBaht(p.settled_amount)}`
                    : '—'}
                </td>
                <td className="px-4 py-2 text-right">
                  <PaymentSettle
                    slug={slug}
                    payment={{
                      id: p.id,
                      amount: p.amount,
                      settled_amount: p.settled_amount,
                      settled_date: p.settled_date,
                      method: p.method,
                      note: p.note,
                      outstanding: left,
                    }}
                    today={today}
                    title={`${PAYMENT_TYPE_LABELS[p.type]} due ${formatDateThai(p.due_date)}`}
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

function Fact({ label, value, tabular }: { label: string; value: string; tabular?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <span className={tabular ? 'tabular font-medium' : 'font-medium'}>{value}</span>
    </div>
  )
}
