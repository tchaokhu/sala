// Skeletons, not spinners, and the same geometry as the real page — the
// heading and its summary line sit where they will sit when the rows land.

import { PageHeader } from '@/components/PageHeader'

export default function PlatformsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Platforms"
        summary={<span className="block h-4 w-80 animate-pulse rounded bg-border" aria-hidden />}
      />

      <div className="h-40 animate-pulse rounded-xl border border-border bg-surface" aria-hidden />

      <div className="flex flex-col gap-3" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
          >
            <div className="flex items-baseline justify-between gap-4">
              <span className="block h-4 w-40 animate-pulse rounded bg-border" />
              <span className="block h-4 w-24 animate-pulse rounded bg-border" />
            </div>
            <span className="block h-3 w-56 animate-pulse rounded bg-border" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading the Platforms list</span>
    </div>
  )
}
