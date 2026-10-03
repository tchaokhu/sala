// A Building's page before its data lands: back link, name and area, the edit
// form, the Delete box, then the map.

import { BackLink } from '@/components/BackLink'
import { Bar } from '@/components/Skeleton'
import { PANEL } from '@/components/styles'

// Name; English name; Province, District; Subdistrict, Postcode; Maps link;
// Facilities, Nearby.
const FIELDS = ['sm:col-span-2', 'sm:col-span-2', '', '', '', '', 'sm:col-span-2', 'list', 'list']

export default function BuildingLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink>Back to the Buildings list</BackLink>
        <div aria-hidden>
          <Bar className="h-8 w-64" />
          <Bar className="mt-1 h-5 w-52" />
        </div>
      </div>

      <div className={`flex flex-col gap-4 ${PANEL}`} aria-hidden>
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((field, i) => (
            <div key={i} className={`flex flex-col gap-1.5 ${field}`}>
              <Bar className="h-3 w-28" />
              <Bar className={`w-full rounded-lg ${field === 'list' ? 'h-32' : 'h-9'}`} />
            </div>
          ))}
        </div>
        <Bar className="h-9 w-32 rounded-lg" />
      </div>

      <div className="h-28 animate-pulse rounded-xl border border-border bg-surface" aria-hidden />
      <div className="h-72 animate-pulse rounded-xl border border-border bg-surface" aria-hidden />

      <span className="sr-only">Loading the Building</span>
    </div>
  )
}
