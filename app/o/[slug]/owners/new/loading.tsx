// The Add Owner form's shape while the Membership check runs.

import { BackLink } from '@/components/BackLink'
import { PageHeader } from '@/components/PageHeader'
import { Bar } from '@/components/Skeleton'
import { PANEL } from '@/components/styles'

// Name, Phone; Email, LINE ID; Facebook link; Note.
const FIELDS = ['', '', '', '', 'sm:col-span-2', 'sm:col-span-2 note']

export default function NewOwnerLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink>Back to the Owners list</BackLink>
        <PageHeader
          title="Add Owner"
          summary="The person who owns a Property and entrusts it to you — only the name is needed"
        />
      </div>

      <div className={`flex flex-col gap-4 ${PANEL}`} aria-hidden>
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((field, i) => (
            <div key={i} className={`flex flex-col gap-1.5 ${field}`}>
              <Bar className="h-3 w-24" />
              <Bar className={`w-full rounded-lg ${field.endsWith('note') ? 'h-20' : 'h-9'}`} />
            </div>
          ))}
        </div>
        <Bar className="h-9 w-28 rounded-lg" />
      </div>

      <span className="sr-only">Loading the form</span>
    </div>
  )
}
