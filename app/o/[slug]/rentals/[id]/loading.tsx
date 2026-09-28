// The detail page's geometry: back link, heading with its pill line, the facts
// grid, the Payments table, the Documents table and upload form, and the two
// cards under it.

import { PageHeader } from '@/components/PageHeader'

export default function RentalLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <span className="block h-5 w-40 animate-pulse rounded bg-border" aria-hidden />
        <PageHeader
          title="Rental"
          summary={<span className="block h-5 w-20 animate-pulse rounded-full bg-border" aria-hidden />}
        />
      </div>

      <div aria-hidden className="flex flex-col gap-6">
        <div className="grid gap-4 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex flex-col gap-1">
              <span className="block h-4 w-16 animate-pulse rounded bg-border" />
              <span className="block h-6 w-32 animate-pulse rounded bg-border" />
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <span className="block h-6 w-28 animate-pulse rounded bg-border" />
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="border-b border-border bg-bg/60 px-4 py-3">
              <span className="block h-4 w-24 animate-pulse rounded bg-border" />
            </div>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex h-12 items-center gap-4 border-b border-border px-4 last:border-0">
                <span className="block h-4 w-24 animate-pulse rounded bg-border" />
                <span className="block h-4 w-24 animate-pulse rounded bg-border" />
                <span className="ml-auto block h-4 w-20 animate-pulse rounded bg-border" />
                <span className="block h-4 w-20 animate-pulse rounded bg-border" />
                <span className="block h-5 w-20 animate-pulse rounded-full bg-border" />
                <span className="block h-4 w-32 animate-pulse rounded bg-border" />
                <span className="block h-4 w-28 animate-pulse rounded bg-border" />
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <span className="block h-6 w-32 animate-pulse rounded bg-border" />
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="border-b border-border bg-bg/60 px-4 py-3">
              <span className="block h-4 w-24 animate-pulse rounded bg-border" />
            </div>
            <div className="flex h-12 items-center gap-4 px-4">
              <span className="block h-4 w-20 animate-pulse rounded bg-border" />
              <span className="block h-4 flex-1 animate-pulse rounded bg-border" />
              <span className="block h-4 w-16 animate-pulse rounded bg-border" />
              <span className="block h-4 w-24 animate-pulse rounded bg-border" />
              <span className="block h-4 w-40 animate-pulse rounded bg-border" />
            </div>
          </div>
          <div className="flex h-44 flex-col gap-4 rounded-xl border border-border bg-surface p-4">
            <span className="block h-9 w-full animate-pulse rounded-lg bg-border" />
            <span className="block h-4 w-2/3 animate-pulse rounded bg-border" />
            <span className="block h-9 w-28 animate-pulse rounded-lg bg-border" />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="flex h-64 flex-col gap-4 rounded-xl border border-border bg-surface p-4">
              <span className="block h-5 w-24 animate-pulse rounded bg-border" />
              <span className="block h-4 w-3/4 animate-pulse rounded bg-border" />
              <span className="block h-9 w-full animate-pulse rounded-lg bg-border" />
              <span className="block h-9 w-32 animate-pulse rounded-lg bg-border" />
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only">Loading the Rental</span>
    </div>
  )
}
