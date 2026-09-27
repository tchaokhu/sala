// Editing one Property, and removing it.
//
// requireMember first, as every route under /o/[slug] does — it is what makes a
// hand-typed id under an Org the caller is not a Member of a refusal rather than
// a form. The read is org-scoped on top of that, and a row that belongs to
// somebody else comes back as null, which is the same notFound() as a row that
// never existed: a probe learns nothing from the difference.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { requireMember } from '@/lib/supabase-server'
import { listBuildingOptions } from '@/lib/buildings'
import { listOwnerOptions } from '@/lib/owners'
import { listActivePlatforms } from '@/lib/platforms'
import { listPostingsForProperty } from '@/lib/postings'
import { todayBangkok } from '@/lib/dates'
import { getPropertyForEdit } from '@/lib/properties'
import { signedPropertyImageUrls } from '@/lib/property-storage'
import { PageHeader } from '@/components/PageHeader'
import { PostingChecklist } from '@/components/PostingChecklist'
import { EditPropertyForm } from './edit-property-form'
import { PropertyDeleteForm } from './property-delete-form'

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const org = await requireMember(slug)

  // None of these depends on the others, so they go together. The Building,
  // Owner and Platform lists are small and bounded and get filtered in the
  // browser, as on the add form. The Postings read is keyed by an id that came
  // from the route, not from the Property row, so it does not have to wait for
  // it either (CLAUDE.md: never chain independent queries).
  const [property, buildings, owners, platforms, postings] = await Promise.all([
    getPropertyForEdit(org.id, id),
    listBuildingOptions(org.id),
    listOwnerOptions(org.id),
    listActivePlatforms(org.id),
    listPostingsForProperty(org.id, id),
  ])
  if (!property) notFound()

  // This one genuinely waits: the paths to sign are the ones the row just
  // returned. One batched call for all of them, not one per photo.
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
        <PageHeader title="Edit Property" summary={property.title} />
      </div>

      <EditPropertyForm
        slug={slug}
        property={property}
        photos={photos}
        buildings={buildings.options}
        buildingsCapped={buildings.capped}
        owners={owners.options}
        ownersCapped={owners.capped}
      />

      {/* Its own form for the same reason as the delete one below: ticking a
          channel posts to a different action, and it should not be able to fail
          on an unrelated field in the form above. */}
      <PostingChecklist
        slug={slug}
        propertyId={property.id}
        platforms={platforms.options}
        capped={platforms.capped}
        current={postings}
        today={todayBangkok()}
      />

      {/* Its own form below the edit one rather than a button inside it: the two
          post to different actions, and a nested <form> is not a thing. */}
      <PropertyDeleteForm
        slug={slug}
        propertyId={property.id}
        title={property.title}
        photoCount={property.images.length}
      />
    </div>
  )
}
