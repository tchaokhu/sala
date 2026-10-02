// The Add Rental form's shape while the Property and Tenant pickers load:
// Property, Tenant, Term, Money, then the buttons.

import { PageHeader } from '@/components/PageHeader'
import { BackLinkSkeleton, CardSkeleton, FormButtonsSkeleton } from '@/components/FormSkeleton'

export default function NewRentalLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLinkSkeleton label="Back to the Rentals list" />
        <PageHeader
          title="Add Rental"
          summary="Pick the Property and the Tenant, set the term and the money — the Payments follow from them"
        />
      </div>

      <div className="flex flex-col gap-6">
        <CardSkeleton title="Property" note="Only Properties with no active Rental can be picked" fields={2} cols="" />
        <CardSkeleton title="Tenant" note="Pick someone already on file, or type a new name to add them" fields={1} cols="" />
        <CardSkeleton title="Term" fields={3} cols="sm:grid-cols-2 lg:grid-cols-3" />
        <CardSkeleton
          title="Money"
          note="The Tenant pays the rent and the Deposit to the Owner; the Commission is ours"
          fields={3}
          cols="sm:grid-cols-2 lg:grid-cols-3"
        />
        <FormButtonsSkeleton />
      </div>

      <span className="sr-only">Loading the form</span>
    </div>
  )
}
