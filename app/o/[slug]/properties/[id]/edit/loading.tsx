// The edit form's own geometry with bars in it: the back link, the heading and
// its summary line, three Cards the height of Building and Room, Size and Photos,
// and the delete section under them — so nothing moves when the row lands.

import { PageHeader } from '@/components/PageHeader'
import { CardSkeleton, FormButtonsSkeleton } from '@/components/FormSkeleton'

export default function EditPropertyLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <span className="block h-5 w-36 animate-pulse rounded bg-border" aria-hidden />
        <PageHeader
          title="Edit Property"
          summary={<span className="block h-4 w-56 animate-pulse rounded bg-border" aria-hidden />}
        />
      </div>

      <div className="flex flex-col gap-6" aria-hidden>
        <CardSkeleton titleWidth="w-40" fields={6} />
        <CardSkeleton titleWidth="w-16" fields={6} />
        <CardSkeleton titleWidth="w-20" fields={4} />

        <FormButtonsSkeleton />

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
          <span className="block h-4 w-24 animate-pulse rounded bg-border" />
          <span className="block h-3 w-72 animate-pulse rounded bg-border" />
          <span className="block h-5 w-28 animate-pulse rounded bg-border" />
        </div>
      </div>

      <span className="sr-only">Loading the Property</span>
    </div>
  )
}
