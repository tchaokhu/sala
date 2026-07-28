// Skeletons, not spinners, for content whose shape is known — and the shape is
// the real table's, so nothing moves when the rows land.

import { PropertyTableSkeleton } from '@/components/PropertyTable'

export default function PropertiesLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">ทรัพย์</h1>
        <p className="mt-1 flex h-5 items-center text-sm text-muted">
          <span className="block h-4 w-56 animate-pulse rounded bg-border" aria-hidden />
        </p>
      </div>

      <div className="flex flex-wrap gap-2" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="block h-7 w-20 animate-pulse rounded-full bg-border" />
        ))}
      </div>

      <PropertyTableSkeleton />
    </div>
  )
}
