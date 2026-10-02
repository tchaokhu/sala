// The Property page's shape before its row lands: back link, title with its
// pill and the two buttons, the facts grid, then the Building and Owner cards.

import { BackLink } from '@/components/BackLink'
import { Bar } from '@/components/Skeleton'
import { PANEL } from '@/components/styles'

export default function PropertyLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink>Back to the Properties list</BackLink>
        <div className="flex flex-wrap items-start justify-between gap-3" aria-hidden>
          <div>
            <Bar className="h-8 w-64" />
            <Bar className="mt-1 h-5 w-20 rounded-full" />
          </div>
          <div className="flex gap-2">
            <Bar className="h-9 w-36 rounded-lg" />
            <Bar className="h-9 w-20 rounded-lg" />
          </div>
        </div>
      </div>

      <div aria-hidden className="flex flex-col gap-6">
        <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${PANEL}`}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col gap-1">
              <Bar className="h-4 w-16" />
              <Bar className="h-6 w-32" />
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className={`flex h-72 flex-col gap-3 ${PANEL}`}>
            <Bar className="h-5 w-20" />
            <Bar className="h-4 w-40" />
            <Bar className="flex-1 rounded-lg" />
          </div>
          <div className={`flex flex-col gap-3 ${PANEL}`}>
            <Bar className="h-5 w-16" />
            <Bar className="h-4 w-36" />
            <Bar className="h-4 w-28" />
          </div>
        </div>
      </div>

      <span className="sr-only">Loading the Property</span>
    </div>
  )
}
