// Adding a Building — its own page, like adding a Property or a Rental. Saving
// lands on the new Building's page.

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireMember } from '@/lib/supabase-server'
import { PageHeader } from '@/components/PageHeader'
import { CreateBuildingForm } from '../building-forms'

export default async function NewBuildingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  await requireMember(slug)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`/o/${slug}/buildings`}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
        >
          <ChevronLeft size={16} aria-hidden />
          Back to the Buildings list
        </Link>
        <PageHeader
          title="Add Building"
          summary="The Building name becomes the Property name — “Lumpini Park Rama 9 12/34”, for example"
        />
      </div>

      <CreateBuildingForm slug={slug} />
    </div>
  )
}
