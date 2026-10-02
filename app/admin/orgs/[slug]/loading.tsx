// Without this, /admin's own skeleton — an Orgs list and a create form — stands
// in for an Org's page, which is a different shape entirely. This one is the
// Member list's: back link, name, the counts line, then rows.
//
// It matches the live Org. The removed-Org state is not worth a second skeleton:
// it is a handful of Orgs at most, and it swaps the body out anyway.

import { Bar } from '@/components/Skeleton'

export default function AdminOrgLoading() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div>
        <Bar className="h-5 w-20" />
        <Bar className="mt-2 h-7 w-56" />
        <Bar className="mt-1 h-4 w-28" />
      </div>

      <div>
        <Bar className="h-5 w-40" />

        <ul className="mt-3 flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3"
            >
              <div className="flex flex-col gap-1.5">
                <Bar className="h-4 w-40" />
                <Bar className="h-3 w-28" />
              </div>
              <div className="flex items-center gap-2">
                <Bar className="h-5 w-16 rounded-full" />
                <Bar className="h-[38px] w-20 rounded-lg" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
