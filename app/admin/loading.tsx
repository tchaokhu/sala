// Skeletons, not spinners — and the shape is the real list's, so nothing shifts
// when the Orgs land. The create-an-Org form below the list is static markup, so
// it gets a block of its own height rather than being left out and shoving the
// page around on arrival.

import { Bar } from '@/components/Skeleton'

export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Orgs</h1>
        <p className="mt-1 flex h-5 items-center text-sm">
          <Bar className="h-4 w-64" />
        </p>
      </div>

      <ul className="flex flex-col gap-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3"
          >
            <div className="flex flex-col gap-1.5">
              <Bar className="h-4 w-32" />
              <Bar className="h-3 w-20" />
            </div>
            <Bar className="h-4 w-16" />
          </li>
        ))}
      </ul>

      <div
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
        aria-hidden
      >
        <div className="flex flex-col gap-1.5">
          <Bar className="h-5 w-32" />
          <Bar className="h-4 w-full max-w-lg" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Bar className="h-4 w-24" />
              <Bar className="h-[38px] w-full rounded-lg" />
            </div>
          ))}
        </div>
        <Bar className="h-[38px] w-28 rounded-lg" />
      </div>
    </div>
  )
}
