// Without this, /admin's own skeleton — an Orgs list and a create form — stands
// in for an Org's page, which is a different shape entirely. This one is the
// Member list's: back link, name, the counts line, then rows.
//
// It matches the live Org. The removed-Org state is not worth a second skeleton:
// it is a handful of Orgs at most, and it swaps the body out anyway.

export default function AdminOrgLoading() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div>
        <span className="block h-5 w-20 animate-pulse rounded bg-border" />
        <span className="mt-2 block h-7 w-56 animate-pulse rounded bg-border" />
        <span className="mt-1 block h-4 w-28 animate-pulse rounded bg-border" />
      </div>

      <div>
        <span className="block h-5 w-40 animate-pulse rounded bg-border" />

        <ul className="mt-3 flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3"
            >
              <div className="flex flex-col gap-1.5">
                <span className="block h-4 w-40 animate-pulse rounded bg-border" />
                <span className="block h-3 w-28 animate-pulse rounded bg-border" />
              </div>
              <div className="flex items-center gap-2">
                <span className="block h-5 w-16 animate-pulse rounded-full bg-border" />
                <span className="block h-[38px] w-20 animate-pulse rounded-lg bg-border" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
