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
import { getPropertyForEdit } from '@/lib/properties'
import { signedPropertyImageUrls } from '@/lib/property-storage'
import { PageHeader } from '@/components/PageHeader'
import { EditPropertyForm } from './edit-property-form'

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const org = await requireMember(slug)

  // Neither depends on the other, so they go together. The โครงการ list is
  // small and bounded and gets filtered in the browser, as on the add form.
  const [property, buildings] = await Promise.all([
    getPropertyForEdit(org.id, id),
    listBuildingOptions(org.id),
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
          กลับไปรายการทรัพย์
        </Link>
        <PageHeader title="แก้ไขทรัพย์" summary={property.title} />
      </div>

      <EditPropertyForm
        slug={slug}
        property={property}
        photos={photos}
        buildings={buildings.options}
        buildingsCapped={buildings.capped}
      />
    </div>
  )
}
