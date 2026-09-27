// The Org landing. The counts a person came for sit above any table
// (CLAUDE.md), and they arrive with the render rather than after the bundle
// hydrates: this is a Server Component, and the four numbers are one aggregate
// query rather than four counts or a table download reduced in the browser.

import Link from 'next/link'
import { CircleAlert } from 'lucide-react'
import { requireMember } from '@/lib/supabase-server'
import { getOrgDashboard } from '@/lib/dashboard'
import { formatBaht } from '@/lib/format'
import { StatTile } from '@/components/StatTile'
import { PageHeader } from '@/components/PageHeader'
import { TILE_LABELS } from './tiles'

export default async function OrgHome({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  // The layout has already gated this route; the call is repeated because the
  // page needs the Org's id, and requireMember is memoised per request so the
  // repeat costs nothing.
  const org = await requireMember(slug)
  const summary = await getOrgDashboard(org.id)

  const [properties, active, ending, overdue] = TILE_LABELS

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Overview" summary="The summary before the detail" />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label={properties}>{summary.propertiesTotal}</StatTile>

        <StatTile label={active}>{summary.rentalsActive}</StatTile>

        <StatTile
          label={ending}
          tone={summary.rentalsEndingThisMonth > 0 ? 'ok' : 'plain'}
          hint={summary.rentalsEndingThisMonth > 0 ? 'Renew, or find a new Tenant' : null}
        >
          {summary.rentalsEndingThisMonth}
        </StatTile>

        {/* Colour marks a problem, so ฿0 owed stays plain — red on good news
            trains people to ignore red. The count repeats the state as words,
            so the tile does not rest on the shade alone. */}
        <StatTile
          label={overdue}
          tone={summary.overdueAmount > 0 ? 'warn' : 'plain'}
          hint={
            summary.overdueCount > 0
              ? `${summary.overdueCount} overdue`
              : 'Nothing outstanding'
          }
          more={
            // Owed out, so a count beside the figure rather than inside it — in
            // and out are never summed (0003).
            summary.refundsLate > 0 && (
              <Link
                href={`/o/${slug}/payments?filter=refunds`}
                className="inline-flex items-center gap-1 text-warn underline-offset-4 hover:underline"
              >
                <CircleAlert size={12} aria-hidden />
                {summary.refundsLate} Deposit {summary.refundsLate === 1 ? 'Refund' : 'Refunds'} late
              </Link>
            )
          }
        >
          {formatBaht(summary.overdueAmount)}
        </StatTile>
      </section>
    </div>
  )
}
