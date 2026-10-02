// Adding a Building — its own page, like adding a Property or a Rental. Saving
// lands on the new Building's page.

import { requireMember } from '@/lib/supabase-server'
import { BackLink } from '@/components/BackLink'
import { PageHeader } from '@/components/PageHeader'
import { CreateBuildingForm } from '../building-forms'

export default async function NewBuildingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  await requireMember(slug)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink href={`/o/${slug}/buildings`}>Back to the Buildings list</BackLink>
        <PageHeader
          title="Add Building"
          summary="The Building name becomes the Property name — “Lumpini Park Rama 9 12/34”, for example"
        />
      </div>

      <CreateBuildingForm slug={slug} />
    </div>
  )
}
