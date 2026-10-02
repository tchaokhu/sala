// One Building in full: where it is, its map, what it offers, and the
// Properties named after it. `?edit=1` turns the same page into its editor —
// the form and the delete card on top, everything else still below — so the
// Edit button, the back button and a shared link all mean the same thing.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Check, Eye, MapPin, Pencil } from 'lucide-react'
import { requireMember } from '@/lib/supabase-server'
import { BUILDING_PROPERTIES_LIMIT, getBuilding, listBuildingProperties } from '@/lib/buildings'
import { formatBaht } from '@/lib/format'
import { BackLink } from '@/components/BackLink'
import { PageHeader } from '@/components/PageHeader'
import { MapPreview } from '@/components/MapPreview'
import { StatusPill } from '@/components/StatusPill'
import { addressInitial, provinceList } from '@/lib/thai-places'
import { DeleteBuildingForm, EditBuildingForm } from '../building-forms'
import { TableFrame } from '@/components/TableFrame'
import { HEAD_CELL, PANEL } from '@/components/styles'

export default async function BuildingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>
  searchParams: Promise<{ edit?: string }>
}) {
  const { slug, id } = await params
  const { edit } = await searchParams
  const editing = edit === '1'

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
  const here = `/o/${slug}/buildings/${id}`

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink href={`/o/${slug}/buildings`}>Back to the Buildings list</BackLink>
        <PageHeader
          title={building.name}
          summary={[building.nameEn, area].filter(Boolean).join(' · ') || 'No area set yet'}
          actions={
            <Link
              href={editing ? here : `${here}?edit=1`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent bg-accent px-3 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
            >
              {editing ? <Check size={16} aria-hidden /> : <Pencil size={16} aria-hidden />}
              {editing ? 'Done' : 'Edit'}
            </Link>
          }
        />
      </div>

      {editing && (
        <>
          <EditBuildingForm
            slug={slug}
            building={building}
            address={{ provinces: provinceList(), initial: addressInitial(building) }}
          />
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
        </>
      )}

      <section className={`flex flex-col gap-3 ${PANEL}`}>
        <h2 className="font-semibold">Map</h2>
        {building.googleMapUrl ? (
          <MapPreview url={building.googleMapUrl} title={`Map of ${building.name}`} />
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted">
            <MapPin size={16} aria-hidden />
            No map link yet —{' '}
            <Link href={`${here}?edit=1`} className="text-accent underline-offset-4 hover:underline">
              add one
            </Link>
          </p>
        )}
      </section>

      {(building.facilities.length > 0 || building.nearby.length > 0) && (
        <section className={`grid gap-4 sm:grid-cols-2 ${PANEL}`}>
          <ChipList title="Facilities" items={building.facilities} />
          <ChipList title="Nearby" items={building.nearby} />
        </section>
      )}

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

function ChipList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted">None listed</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <li key={item} className="rounded-full border border-border px-2.5 py-0.5 text-xs">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
