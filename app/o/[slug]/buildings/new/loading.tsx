// The Add Building form's shape while the Membership check runs: one box with
// its fields, then the Save button.

import { PageHeader } from '@/components/PageHeader'
import { BackLinkSkeleton } from '@/components/FormSkeleton'

// Name; English name, District; Province; Maps link; Facilities, Nearby.
const FIELDS = ['sm:col-span-2', '', '', '', 'sm:col-span-2', 'list', 'list']

export default function NewBuildingLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLinkSkeleton label="Back to the Buildings list" />
        <PageHeader
          title="Add Building"
          summary="The Building name becomes the Property name — “Lumpini Park Rama 9 12/34”, for example"
        />
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4" aria-hidden>
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((field, i) => (
            <div key={i} className={`flex flex-col gap-1.5 ${field}`}>
              <span className="block h-3 w-28 animate-pulse rounded bg-border" />
              <span className={`block w-full animate-pulse rounded-lg bg-border ${field === 'list' ? 'h-32' : 'h-9'}`} />
            </div>
          ))}
        </div>
        <span className="block h-9 w-32 animate-pulse rounded-lg bg-border" aria-hidden />
      </div>

      <span className="sr-only">Loading the form</span>
    </div>
  )
}
