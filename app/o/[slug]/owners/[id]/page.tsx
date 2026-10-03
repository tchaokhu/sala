// One Owner: the form that edits them, opened straight away — there is no
// separate read-only view (user, 2026-10-03) — then Delete, then the Properties
// they own. Saving goes back to the list.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Eye } from 'lucide-react'
import { requireMember } from '@/lib/supabase-server'
import { getOwner } from '@/lib/owners'
import { BUILDING_PROPERTIES_LIMIT, listOwnerProperties } from '@/lib/buildings'
import { formatBaht } from '@/lib/format'
import { BackLink } from '@/components/BackLink'
import { PageHeader } from '@/components/PageHeader'
import { StatusPill } from '@/components/StatusPill'
import { TableFrame } from '@/components/TableFrame'
import { HEAD_CELL, PANEL, ROW_LINK } from '@/components/styles'
import { DeleteOwnerForm, EditOwnerForm } from '../owner-forms'

export default async function OwnerPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params

  const org = await requireMember(slug)
  // Both keyed by the id from the URL and read under the Org, so neither waits
  // on the other; a foreign id finds nothing in either.
  const [owner, properties] = await Promise.all([getOwner(org.id, id), listOwnerProperties(org.id, id)])
  if (!owner) notFound()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink href={`/o/${slug}/owners`}>Back to the Owners list</BackLink>
        <PageHeader
          title={owner.name}
          summary={`${owner.propertyCount} ${owner.propertyCount === 1 ? 'Property' : 'Properties'}`}
        />
      </div>

      <EditOwnerForm slug={slug} owner={owner} />

      <section className={`flex flex-col gap-3 ${PANEL}`}>
        <div>
          <h2 className="font-semibold">Delete Owner</h2>
          <p className="mt-1 text-sm text-muted">Their Properties stay, with no Owner on file.</p>
        </div>
        <DeleteOwnerForm slug={slug} owner={owner} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">
          Properties <span className="tabular text-muted">{owner.propertyCount}</span>
        </h2>
        {properties.rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted">
            No Properties name this Owner yet. Pick them as the Owner on a Property.
          </div>
        ) : (
          <TableFrame
            minWidth="min-w-[32rem]"
            head={
              <>
                <th scope="col" className={HEAD_CELL}>Property</th>
                <th scope="col" className={`${HEAD_CELL} text-right`}>Rent/month</th>
                <th scope="col" className={HEAD_CELL}>Status</th>
                <th scope="col" className={`${HEAD_CELL} text-right`}>Manage</th>
              </>
            }
          >
            {properties.rows.map((p) => (
              <tr key={p.id} className="h-12 border-b border-border last:border-0">
                <td className="px-4 py-2">
                  <span className="font-medium">{p.title}</span>
                  {(p.roomNumber || p.floor != null) && (
                    <span className="block text-xs text-muted">
                      {[p.roomNumber && `Room ${p.roomNumber}`, p.floor != null && `Floor ${p.floor}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                </td>
                <td className="tabular whitespace-nowrap px-4 py-2 text-right">{formatBaht(p.priceMonthly)}</td>
                <td className="px-4 py-2">
                  <StatusPill status={p.status} />
                </td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/o/${slug}/properties/${p.id}`} className={ROW_LINK}>
                    <Eye size={14} aria-hidden />
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </TableFrame>
        )}
        {properties.capped && (
          <p className="text-xs text-muted">
            Showing the first {BUILDING_PROPERTIES_LIMIT}. The Properties list has all of them.
          </p>
        )}
      </section>
    </div>
  )
}
