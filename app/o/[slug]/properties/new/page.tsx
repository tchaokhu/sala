// Adding a Property.
//
// Only the two pickers have anything to hydrate, and neither waits on the
// other. requireMember is memoised per request, so asking after the layout
// already asked costs nothing — and asking is what makes a hand-typed
// /o/some-other-agency/properties/new a refusal rather than a blank form.

import { requireMember } from '@/lib/supabase-server'
import { listBuildingOptions } from '@/lib/buildings'
import { listOwnerOptions } from '@/lib/owners'
import { BackLink } from '@/components/BackLink'
import { PageHeader } from '@/components/PageHeader'
import { NewPropertyForm } from './new-property-form'

export default async function NewPropertyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const org = await requireMember(slug)

  // Both lists are small and bounded, so each is fetched once here and filtered
  // in the browser rather than costing a round trip per keystroke. Neither
  // depends on the other, so they go together.
  const [buildings, owners] = await Promise.all([
    listBuildingOptions(org.id),
    listOwnerOptions(org.id),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink href={`/o/${slug}/properties`}>Back to the Properties list</BackLink>
        <PageHeader
          title="Add Property"
          summary="Pick a Building, set the type and the rent — the rest can be filled in later"
        />
      </div>

      <NewPropertyForm
        slug={slug}
        buildings={buildings.options}
        buildingsCapped={buildings.capped}
        owners={owners.options}
        ownersCapped={owners.capped}
      />
    </div>
  )
}
