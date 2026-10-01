// Viewing one Property, read-only.
//
// The same read the edit page uses — a view and an edit of the same row need
// the same columns, so this shares getPropertyForEdit rather than a second
// near-identical query. What differs is only the rendering: no form, no
// Server Action, nothing here can change the row.
//
// requireMember first, as every route under /o/[slug] does — a hand-typed id
// under an Org the caller is not a Member of is a refusal, not a page. The
// read is org-scoped on top of that: a row belonging to somebody else and a
// row that never existed both come back as null, and both become the same
// notFound() (CLAUDE.md — a probe learns nothing from the difference).

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, KeyRound, MapPin, Pencil, Phone, ScrollText } from 'lucide-react'
import { requireMember } from '@/lib/supabase-server'
import { getPropertyForEdit } from '@/lib/properties'
import { signedPropertyImageUrls } from '@/lib/property-storage'
import { formatBaht } from '@/lib/format'
import { PROPERTY_TYPE_LABELS } from '@/lib/property-input'
import { PageHeader } from '@/components/PageHeader'
import { MapPreview } from '@/components/MapPreview'
import { BUTTON, PRIMARY_BUTTON } from '@/components/styles'
import { StatusPill } from '@/components/StatusPill'
import { PropertyPhotoGallery } from './photo-gallery'

export default async function PropertyViewPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const org = await requireMember(slug)

  const property = await getPropertyForEdit(org.id, id)
  if (!property) notFound()

  const photos = await signedPropertyImageUrls(property.images)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`/o/${slug}/properties`}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
        >
          <ChevronLeft size={16} aria-hidden />
          Back to the Properties list
        </Link>
        <PageHeader
          title={property.title}
          summary={<StatusPill status={property.status} />}
          actions={
            <>
              {property.activeRentalId ? (
                <Link
                  href={`/o/${slug}/rentals/${property.activeRentalId}`}
                  className={`${BUTTON} inline-flex items-center gap-1.5`}
                >
                  <ScrollText size={14} aria-hidden />
                  View the Rental
                </Link>
              ) : (
                <Link
                  href={`/o/${slug}/rentals/new?property=${id}`}
                  className={`${BUTTON} inline-flex items-center gap-1.5`}
                >
                  <KeyRound size={14} aria-hidden />
                  Rent this Property
                </Link>
              )}
              <Link
                href={`/o/${slug}/properties/${id}/edit`}
                className={`${PRIMARY_BUTTON} inline-flex items-center gap-1.5`}
              >
                <Pencil size={14} aria-hidden />
                Edit
              </Link>
            </>
          }
        />
      </div>

      <section className="grid gap-4 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Type" value={PROPERTY_TYPE_LABELS[property.propertyType]} />
        <Fact
          label="Size"
          value={`${property.bedrooms} bed · ${property.bathrooms} bath · ${property.areaSqm} sq m`}
        />
        <Fact label="Floor" value={property.floor != null ? String(property.floor) : '—'} />
        <Fact label="Rent/month" value={formatBaht(property.priceMonthly)} tabular />
      </section>

      {property.description && (
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="font-semibold">Description</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{property.description}</p>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
          <h2 className="font-semibold">Building</h2>
          {property.building ? (
            <>
              <p className="text-sm">{property.building.name}</p>
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <MapPin size={14} aria-hidden />
                {property.building.district}
              </p>
              <MapPreview url={property.building.googleMapUrl} title={`Map of ${property.building.name}`} />
            </>
          ) : (
            <p className="text-sm text-muted">No Building on file — this Property came from the import.</p>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
          <h2 className="font-semibold">Owner</h2>
          {property.owner ? (
            <>
              <p className="text-sm">{property.owner.name}</p>
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <Phone size={14} aria-hidden />
                {property.owner.phone}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">No Owner on file.</p>
          )}
          {property.contactLine && (
            <p className="text-sm text-muted">LINE: {property.contactLine}</p>
          )}
        </section>
      </div>

      {photos.length > 0 && (
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="font-semibold">Photos</h2>
          <div className="mt-3">
            <PropertyPhotoGallery photos={photos} />
          </div>
        </section>
      )}
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
