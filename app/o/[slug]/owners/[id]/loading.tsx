// An Owner's page before the row lands: back link, name and count, the Contact
// and Note boxes side by side, then the Properties table.

import { BackLink } from '@/components/BackLink'
import { Bar } from '@/components/Skeleton'
import { PANEL } from '@/components/styles'

export default function OwnerLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink>Back to the Owners list</BackLink>
        <div className="flex flex-wrap items-start justify-between gap-3" aria-hidden>
          <div>
            <Bar className="h-8 w-56" />
            <Bar className="mt-1 h-5 w-24" />
          </div>
          <Bar className="h-9 w-20 rounded-lg" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2" aria-hidden>
        {[0, 1].map((i) => (
          <div key={i} className={`flex h-36 flex-col gap-3 ${PANEL}`}>
            <Bar className="h-5 w-20" />
            <Bar className="h-4 w-40" />
            <Bar className="h-4 w-32" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3" aria-hidden>
        <Bar className="h-6 w-28" />
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="h-10 border-b border-border bg-bg/60" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex h-12 items-center gap-6 border-b border-border px-4 last:border-0">
              <Bar className="h-4 w-48" />
              <Bar className="ml-auto h-4 w-20" />
              <Bar className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only">Loading the Owner</span>
    </div>
  )
}
