// The Property page's geometry with bars in it: the back link, the title with
// its pill and the Rental button, three Cards the height of Building and Room, Size and Photos,
// and the delete section under them — so nothing moves when the row lands.

import { BackLink } from '@/components/BackLink'
import { Bar, CardSkeleton, FormButtonsSkeleton } from '@/components/Skeleton'
import { PANEL } from '@/components/styles'

export default function PropertyLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink>Back to the Properties list</BackLink>
        <div className="flex flex-wrap items-start justify-between gap-3" aria-hidden>
          <div>
            <Bar className="h-8 w-64" />
            <Bar className="mt-1 h-5 w-20 rounded-full" />
          </div>
          <Bar className="h-9 w-40 rounded-lg" />
        </div>
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
