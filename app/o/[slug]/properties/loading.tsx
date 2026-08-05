// Skeletons, not spinners, for content whose shape is known — and the shape is
// the real table's, so nothing moves when the rows land.

import { PropertyTableSkeleton } from '@/components/PropertyTable'
import { PageHeader } from '@/components/PageHeader'

export default function PropertiesLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Properties"
        summary={<span className="block h-4 w-40 animate-pulse rounded bg-border" aria-hidden />}
      />

      <div className="flex flex-wrap gap-2" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="block h-8 w-24 animate-pulse rounded-full bg-border" />
        ))}
      </div>

      <PropertyTableSkeleton />
    </div>
  )
}
