// One Building, viewed or edited on one page (user, 2026-10-03): the same form
// either way, disabled to view and live with `?edit=1`, which also brings
// Delete. Saving goes back to the list. The map its link draws and the
// Properties named after it sit below.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Eye, MapPin, Pencil, X } from 'lucide-react'
import { requireMember } from '@/lib/supabase-server'
import { BUILDING_PROPERTIES_LIMIT, getBuilding, listBuildingProperties } from '@/lib/buildings'
import { formatBaht } from '@/lib/format'
import { addressInitial, provinceList } from '@/lib/thai-places'
import { BackLink } from '@/components/BackLink'
import { PageHeader } from '@/components/PageHeader'
import { MapPreview } from '@/components/MapPreview'
import { StatusPill } from '@/components/StatusPill'
import { TableFrame } from '@/components/TableFrame'
import { BUTTON, HEAD_CELL, PANEL, PRIMARY_BUTTON } from '@/components/styles'
import { DeleteBuildingForm, EditBuildingForm } from '../building-forms'

export default async function BuildingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>
  searchParams: Promise<{ edit?: string }>
}) {
  const { slug, id } = await params
  const editing = (await searchParams).edit === '1'
  const here = `/o/${slug}/buildings/${id}`

  const org = await requireMember(slug)
  // Both keyed by the id from the URL and read under the Org, so they do not
  // wait on each other; a foreign id finds nothing in either.
  const [building, properties] = await Promise.all([
    getBuilding(org.id, id),
    listBuildingProperties(org.id, id),
  ])
  if (!building) notFound()

  const area = [
    building.subdistrict,
    building.district,
    [building.province, building.postcode].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink href={`/o/${slug}/buildings`}>Back to the Buildings list</BackLink>
        <PageHeader
          title={building.name}
          summary={[building.nameEn, area].filter(Boolean).join(' · ') || 'No area set yet'}
          actions={
            editing ? (
              <Link href={here} className={`${BUTTON} inline-flex items-center gap-1.5`}>
                <X size={14} aria-hidden />
                Cancel
              </Link>
            ) : (
              <Link href={`${here}?edit=1`} className={`${PRIMARY_BUTTON} inline-flex items-center gap-1.5`}>
                <Pencil size={14} aria-hidden />
                Edit
              </Link>
            )
          }
        />
      </div>

      <EditBuildingForm
        slug={slug}
        building={building}
        address={{ provinces: provinceList(), initial: addressInitial(building) }}
        readOnly={!editing}
      />

      {editing && (
        <section className={`flex flex-col gap-3 ${PANEL}`}>
          <div>
            <h2 className="font-semibold">Delete Building</h2>
            <p className="mt-1 text-sm text-muted">
              Its Properties stay, but lose their Building and its map. Renaming, above, does not
              rename them either.
            </p>
          </div>
          <DeleteBuildingForm slug={slug} building={building} />
        </section>
      )}

      <section className={`flex flex-col gap-3 ${PANEL}`}>
        <h2 className="font-semibold">Map</h2>
        {building.googleMapUrl ? (
          <MapPreview url={building.googleMapUrl} title={`Map of ${building.name}`} />
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted">
            <MapPin size={16} aria-hidden />
            No map link yet — paste one in the form above, under Edit
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">
          Properties <span className="tabular text-muted">{building.propertyCount}</span>
        </h2>
        {properties.rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted">
            No Properties in this Building yet. Choose it as the Building when
            <Link
              href={`/o/${slug}/properties/new`}
              className="ml-1 text-accent underline-offset-4 hover:underline"
            >
              adding a Property
            </Link>
            .
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
                  <span className="block text-xs text-muted">
                    {[
                      p.roomNumber && `Room ${p.roomNumber}`,
                      p.floor != null && `Floor ${p.floor}`,
                      p.ownerName,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'No room number or Owner'}
                  </span>
                </td>
                <td className="tabular whitespace-nowrap px-4 py-2 text-right">{formatBaht(p.priceMonthly)}</td>
                <td className="px-4 py-2">
                  <StatusPill status={p.status} />
                </td>
                <td className="px-4 py-2 text-right">
                  <Link
                    href={`/o/${slug}/properties/${p.id}`}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted transition-colors hover:text-ink"
                  >
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
