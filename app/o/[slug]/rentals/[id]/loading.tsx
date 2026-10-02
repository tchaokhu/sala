// The detail page's geometry: back link, heading with its pill line, the facts
// grid, the Payments table, the Documents table and upload form, and the two
// cards under it.

import { PageHeader } from '@/components/PageHeader'
import { Bar } from '@/components/Skeleton'

export default function RentalLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Bar className="h-5 w-40" />
        <PageHeader
          title="Rental"
          summary={<Bar className="h-5 w-20 rounded-full" />}
        />
      </div>

      <div aria-hidden className="flex flex-col gap-6">
        <div className="grid gap-4 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex flex-col gap-1">
              <Bar className="h-4 w-16" />
              <Bar className="h-6 w-32" />
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <Bar className="h-6 w-28" />
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="border-b border-border bg-bg/60 px-4 py-3">
              <Bar className="h-4 w-24" />
            </div>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex h-12 items-center gap-4 border-b border-border px-4 last:border-0">
                <Bar className="h-4 w-24" />
                <Bar className="h-4 w-24" />
                <Bar className="ml-auto h-4 w-20" />
                <Bar className="h-4 w-20" />
                <Bar className="h-5 w-20 rounded-full" />
                <Bar className="h-4 w-32" />
                <Bar className="h-4 w-28" />
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Bar className="h-6 w-32" />
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="border-b border-border bg-bg/60 px-4 py-3">
              <Bar className="h-4 w-24" />
            </div>
            <div className="flex h-12 items-center gap-4 px-4">
              <Bar className="h-4 w-20" />
              <Bar className="h-4 flex-1" />
              <Bar className="h-4 w-16" />
              <Bar className="h-4 w-24" />
              <Bar className="h-4 w-40" />
            </div>
          </div>
          <div className="flex h-44 flex-col gap-4 rounded-xl border border-border bg-surface p-4">
            <Bar className="h-9 w-full rounded-lg" />
            <Bar className="h-4 w-2/3" />
            <Bar className="h-9 w-28 rounded-lg" />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="flex h-64 flex-col gap-4 rounded-xl border border-border bg-surface p-4">
              <Bar className="h-5 w-24" />
              <Bar className="h-4 w-3/4" />
              <Bar className="h-9 w-full rounded-lg" />
              <Bar className="h-9 w-32 rounded-lg" />
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only">Loading the Rental</span>
    </div>
  )
}
