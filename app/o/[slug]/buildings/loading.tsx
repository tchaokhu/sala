// Skeletons, not spinners, and the same geometry as the real page — the
// heading, the search row and a table of short rows.

import { PageHeader } from '@/components/PageHeader'

export default function BuildingsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Buildings"
        summary={<span className="block h-4 w-72 animate-pulse rounded bg-border" aria-hidden />}
      />

      <span className="block h-10 w-full animate-pulse rounded-lg bg-border sm:w-80" aria-hidden />

      <div className="overflow-hidden rounded-xl border border-border bg-surface" aria-hidden>
        <div className="h-10 border-b border-border bg-bg/60" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex h-14 items-center gap-6 border-b border-border px-4 last:border-0">
            <span className="block h-4 w-48 animate-pulse rounded bg-border" />
            <span className="block h-3 w-28 animate-pulse rounded bg-border" />
            <span className="ml-auto block h-4 w-10 animate-pulse rounded bg-border" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading the Buildings list</span>
    </div>
  )
}
