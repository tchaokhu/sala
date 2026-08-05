// Adding a Property.
//
// Nothing is fetched here: the form has no data to hydrate, so the only server
// work is the gate. requireMember is memoised per request, so asking after the
// layout already asked costs nothing — and asking is what makes a hand-typed
// /o/some-other-agency/properties/new a refusal rather than a blank form.

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireMember } from '@/lib/supabase-server'
import { listBuildingOptions } from '@/lib/buildings'
import { PageHeader } from '@/components/PageHeader'
import { NewPropertyForm } from './new-property-form'

export default async function NewPropertyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const org = await requireMember(slug)

  // The Building list is small and bounded, so it is fetched once here and
  // filtered in the browser rather than costing a round trip per keystroke.
  const { options, capped } = await listBuildingOptions(org.id)

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
          title="Add Property"
          summary="Pick a Building, set the type and the rent — the rest can be filled in later"
        />
      </div>

      <NewPropertyForm slug={slug} buildings={options} buildingsCapped={capped} />
    </div>
  )
}
