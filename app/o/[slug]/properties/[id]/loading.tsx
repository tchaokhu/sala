// The Property page's shape before its row lands: back link, title with its
// pill and the two buttons, the facts grid, then the Building and Owner cards.

import { BackLinkSkeleton } from '@/components/FormSkeleton'

export default function PropertyLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLinkSkeleton label="Back to the Properties list" />
        <div className="flex flex-wrap items-start justify-between gap-3" aria-hidden>
          <div>
            <span className="block h-8 w-64 animate-pulse rounded bg-border" />
            <span className="mt-1 block h-5 w-20 animate-pulse rounded-full bg-border" />
          </div>
          <div className="flex gap-2">
            <span className="block h-9 w-36 animate-pulse rounded-lg bg-border" />
            <span className="block h-9 w-20 animate-pulse rounded-lg bg-border" />
          </div>
        </div>
      </div>

      <div aria-hidden className="flex flex-col gap-6">
        <div className="grid gap-4 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col gap-1">
              <span className="block h-4 w-16 animate-pulse rounded bg-border" />
              <span className="block h-6 w-32 animate-pulse rounded bg-border" />
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex h-72 flex-col gap-3 rounded-xl border border-border bg-surface p-4">
            <span className="block h-5 w-20 animate-pulse rounded bg-border" />
            <span className="block h-4 w-40 animate-pulse rounded bg-border" />
            <span className="block flex-1 animate-pulse rounded-lg bg-border" />
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
            <span className="block h-5 w-16 animate-pulse rounded bg-border" />
            <span className="block h-4 w-36 animate-pulse rounded bg-border" />
            <span className="block h-4 w-28 animate-pulse rounded bg-border" />
          </div>
        </div>
      </div>

      <span className="sr-only">Loading the Property</span>
    </div>
  )
}
