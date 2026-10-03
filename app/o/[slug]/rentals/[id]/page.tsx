// One Rental: its facts, its Payments with Settle / Correct on each, its
// Documents, and the transitions it can still take.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Home, PenLine } from 'lucide-react'
import { requireMember } from '@/lib/supabase-server'
import { todayBangkok } from '@/lib/dates'
import { formatBaht, formatDateThai } from '@/lib/format'
import { getPaymentStatus, outstanding } from '@/lib/payments'
import { getRental, getRentalStatus, listPaymentsForRental } from '@/lib/rentals'
import { listRentalDocuments, signedDocumentUrls, type RentalDocument } from '@/lib/rental-documents'
import { BackLink } from '@/components/BackLink'
import { Fact } from '@/components/Fact'
import { PageHeader } from '@/components/PageHeader'
import { BUTTON, HEAD_CELL, PANEL } from '@/components/styles'
import { PaymentSettle } from '@/components/PaymentSettle'
import { PAYMENT_TYPE_LABELS, PaymentStatusPill, RentalStatePill, Tag } from '@/components/StatusPill'
import { RentalManage } from './rental-forms'
import { RentalDocuments, type ShownDocument } from './document-forms'
import { TableFrame } from '@/components/TableFrame'

const bangkokDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' })

export default async function RentalPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const org = await requireMember(slug)

  const [rental, { payments, capped }, documents] = await Promise.all([
    getRental(org.id, id),
    listPaymentsForRental(org.id, id),
    listRentalDocuments(org.id, id),
  ])
  if (!rental) notFound()

  const urls = await signedDocumentUrls([...documents.own, ...documents.earlier])
  // storagePath stays on the server: the id is all Delete needs.
  const shown = (d: RentalDocument): ShownDocument => ({
    id: d.id,
    kind: d.kind,
    fileName: d.fileName,
    sizeBytes: d.sizeBytes,
    addedOn: bangkokDate.format(new Date(d.createdAt)),
    url: urls[d.storagePath]?.url ?? null,
    downloadUrl: urls[d.storagePath]?.downloadUrl ?? null,
  })

  const today = todayBangkok()
  const { state, daysLeft } = getRentalStatus(rental.endDate, today)
  const anySettled = payments.some((p) => p.settled_date !== null || (p.settled_amount ?? 0) > 0)
  // A capped list cannot prove nothing further down is settled, so no offer.
  const deletable = !anySettled && rental.documentCount === 0 && !capped

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink href={`/o/${slug}/rentals`}>Back to the Rentals list</BackLink>
        <PageHeader
          title={rental.propertyTitle}
          summary={
            <span className="flex items-center gap-1.5">
              <RentalStatePill status={rental.status} state={state} daysLeft={daysLeft} />
              {!rental.rentTrackedByUs && <Tag>Rent not followed</Tag>}
            </span>
          }
          actions={
            <>
              <Link
                href={`/o/${slug}/templates?rental=${rental.id}`}
                className={`${BUTTON} inline-flex items-center gap-1.5`}
              >
                <PenLine size={14} aria-hidden />
                Create from template
              </Link>
              <Link
                href={`/o/${slug}/properties/${rental.propertyId}`}
                className={`${BUTTON} inline-flex items-center gap-1.5`}
              >
                <Home size={14} aria-hidden />
                View the Property
              </Link>
            </>
          }
        />
      </div>

      <section className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${PANEL}`}>
        <Fact label="Tenant" value={rental.tenantName} />
        <Fact label="Phone" value={rental.tenantPhone ?? '—'} tabular />
        <Fact
          label="Term"
          value={`${formatDateThai(rental.startDate)} – ${formatDateThai(rental.endDate)}`}
          tabular
        />
        <Fact
          label="Rent/month"
          value={formatBaht(rental.monthlyRent)}
          tabular
        />
        <Fact label="Deposit" value={formatBaht(rental.deposit)} tabular />
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
            No Payments on this Rental — the rent is not followed and there is no Deposit or Commission
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

      <RentalDocuments
        slug={slug}
        rentalId={rental.id}
        own={documents.own.map(shown)}
        earlier={documents.earlier.map((d) => ({
          ...shown(d),
          rentalId: d.rentalId,
          rentalStartDate: d.rentalStartDate,
          rentalEndDate: d.rentalEndDate,
        }))}
        capped={documents.capped}
      />

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
        }}
        payments={payments.map((p) => ({ due_date: p.due_date, settled_date: p.settled_date }))}
        today={today}
        deletable={deletable}
      />
    </div>
  )
}


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
    <TableFrame
      minWidth="min-w-[52rem]"
      head={
        <>
          <th scope="col" className={HEAD_CELL}>Type</th>
          <th scope="col" className={HEAD_CELL}>Due</th>
          <th scope="col" className={`${HEAD_CELL} text-right`}>Amount</th>
          <th scope="col" className={`${HEAD_CELL} text-right`}>Outstanding</th>
          <th scope="col" className={HEAD_CELL}>Status</th>
          <th scope="col" className={HEAD_CELL}>Settled</th>
          <th scope="col" className={`${HEAD_CELL} text-right`}>Manage</th>
        </>
      }
    >
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
    </TableFrame>
  )
}

