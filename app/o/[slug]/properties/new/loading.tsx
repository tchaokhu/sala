// The Add Property form's shape while the Building and Owner pickers load:
// Building and Room, Owner, Size, Photos, then the buttons.

import { PageHeader } from '@/components/PageHeader'
import { BackLinkSkeleton, CardSkeleton, FormButtonsSkeleton } from '@/components/FormSkeleton'

export default function NewPropertyLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLinkSkeleton label="Back to the Properties list" />
        <PageHeader
          title="Add Property"
          summary="Pick a Building, set the type and the rent — the rest can be filled in later"
        />
      </div>

      <div className="flex flex-col gap-6">
        <CardSkeleton
          title="Building and Room"
          note="A Property's name is its Building name followed by the room number, so there is no name to type"
          fields={6}
        />
        <CardSkeleton
          title="Owner"
          note="The person who owns this Property. Leave it blank if the Org has nobody on file for it"
          fields={1}
        />
        <CardSkeleton title="Size" fields={6} cols="sm:grid-cols-2 lg:grid-cols-3" />
        <CardSkeleton title="Photos" fields={1} cols="" />
        <FormButtonsSkeleton />
      </div>

      <span className="sr-only">Loading the form</span>
    </div>
  )
}
