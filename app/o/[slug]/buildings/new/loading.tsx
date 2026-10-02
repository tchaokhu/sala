// The Add Building form's shape while the Membership check runs: one box with
// its fields, then the Save button.

import { PageHeader } from '@/components/PageHeader'
import { BackLink } from '@/components/BackLink'
import { Bar } from '@/components/Skeleton'
import { PANEL } from '@/components/styles'

// Name; English name, District; Province; Maps link; Facilities, Nearby.
const FIELDS = ['sm:col-span-2', '', '', '', 'sm:col-span-2', 'list', 'list']

export default function NewBuildingLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink>Back to the Buildings list</BackLink>
        <PageHeader
          title="Add Building"
          summary="The Building name becomes the Property name — “Lumpini Park Rama 9 12/34”, for example"
        />
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

      <span className="sr-only">Loading the form</span>
    </div>
  )
}
