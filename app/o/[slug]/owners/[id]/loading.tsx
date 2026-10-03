// An Owner's page before the row lands: back link, name and count, the edit
// form, the Delete box, then the Properties table.

import { BackLink } from '@/components/BackLink'
import { Bar } from '@/components/Skeleton'
import { PANEL } from '@/components/styles'

// Name, Phone; Email, LINE ID; Facebook link; Note.
const FIELDS = ['', '', '', '', 'sm:col-span-2', 'sm:col-span-2 note']

export default function OwnerLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink>Back to the Owners list</BackLink>
        <div aria-hidden>
          <Bar className="h-8 w-56" />
          <Bar className="mt-1 h-5 w-24" />
        </div>
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
        <Bar className="h-9 w-32 rounded-lg" />
      </div>

      <div className={`flex flex-col gap-3 ${PANEL}`} aria-hidden>
        <Bar className="h-4 w-28" />
        <Bar className="h-3 w-64" />
        <Bar className="h-5 w-28" />
      </div>

      <span className="sr-only">Loading the Owner</span>
    </div>
  )
}
