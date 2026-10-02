// Skeletons, not spinners, for content whose shape is known — and the shape is
// the real table's, so nothing moves when the rows land.

import { PropertyTableSkeleton } from '@/components/PropertyTable'
import { PageHeader } from '@/components/PageHeader'
import { Bar } from '@/components/Skeleton'

export default function PropertiesLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Properties"
        summary={<Bar className="h-4 w-40" />}
      />

      <div className="flex flex-wrap gap-2" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <Bar key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>

      <PropertyTableSkeleton />
    </div>
  )
}
