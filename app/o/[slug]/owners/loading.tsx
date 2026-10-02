// Skeletons, not spinners, and the same geometry as the real page — the
// heading, the search row and a table of short rows.

import { PageHeader } from '@/components/PageHeader'
import { Bar } from '@/components/Skeleton'

export default function OwnersLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Owners"
        summary="The people who own the Properties on your books, and how to reach them"
      />

      <Bar className="h-10 w-full rounded-lg sm:w-80" />

      <div className="overflow-hidden rounded-xl border border-border bg-surface" aria-hidden>
        <div className="h-10 border-b border-border bg-bg/60" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex h-14 items-center gap-6 border-b border-border px-4 last:border-0">
            <Bar className="h-4 w-44" />
            <Bar className="h-3 w-24" />
            <Bar className="h-3 w-28" />
            <Bar className="ml-auto h-4 w-10" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading the Owners list</span>
    </div>
  )
}
