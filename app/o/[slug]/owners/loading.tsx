// Skeletons, not spinners, and the same geometry as the real page — the heading
// and its summary line sit where they will sit when the rows land.

import { PageHeader } from '@/components/PageHeader'
import { Bar } from '@/components/Skeleton'
import { PANEL } from '@/components/styles'

export default function OwnersLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Owners"
        summary={<Bar className="h-4 w-72" />}
      />

      <div className="h-96 animate-pulse rounded-xl border border-border bg-surface" aria-hidden />

      <div className="flex flex-col gap-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className={`flex flex-col gap-3 ${PANEL}`}>
            <Bar className="h-4 w-52" />
            <Bar className="h-3 w-32" />
            <Bar className="h-3 w-64" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading the Owners list</span>
    </div>
  )
}
