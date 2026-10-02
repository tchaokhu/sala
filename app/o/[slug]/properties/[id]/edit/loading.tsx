// The edit form's own geometry with bars in it: the back link, the heading and
// its summary line, three Cards the height of Building and Room, Size and Photos,
// and the delete section under them — so nothing moves when the row lands.

import { BackLink } from '@/components/BackLink'
import { PageHeader } from '@/components/PageHeader'
import { Bar, CardSkeleton, FormButtonsSkeleton } from '@/components/Skeleton'
import { PANEL } from '@/components/styles'

export default function EditPropertyLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink>Back to the Properties list</BackLink>
        <PageHeader
          title="Edit Property"
          summary={<Bar className="h-4 w-56" />}
        />
      </div>

      <div className="flex flex-col gap-6" aria-hidden>
        <CardSkeleton titleWidth="w-40" fields={6} />
        <CardSkeleton titleWidth="w-16" fields={6} />
        <CardSkeleton titleWidth="w-20" fields={4} />

        <FormButtonsSkeleton />

        <div className={`flex flex-col gap-3 ${PANEL}`}>
          <Bar className="h-4 w-24" />
          <Bar className="h-3 w-72" />
          <Bar className="h-5 w-28" />
        </div>
      </div>

      <span className="sr-only">Loading the Property</span>
    </div>
  )
}
