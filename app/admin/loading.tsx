// Skeletons, not spinners — and the shape is the real list's, so nothing shifts
// when the Orgs land. The create-an-Org form below the list is static markup, so
// it gets a block of its own height rather than being left out and shoving the
// page around on arrival.

export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Orgs</h1>
        <p className="mt-1 flex h-5 items-center text-sm">
          <span className="block h-4 w-64 animate-pulse rounded bg-border" aria-hidden />
        </p>
      </div>

      <ul className="flex flex-col gap-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3"
          >
            <div className="flex flex-col gap-1.5">
              <span className="block h-4 w-32 animate-pulse rounded bg-border" />
              <span className="block h-3 w-20 animate-pulse rounded bg-border" />
            </div>
            <span className="block h-4 w-16 animate-pulse rounded bg-border" />
          </li>
        ))}
      </ul>

      <div
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
        aria-hidden
      >
        <div className="flex flex-col gap-1.5">
          <span className="block h-5 w-32 animate-pulse rounded bg-border" />
          <span className="block h-4 w-full max-w-lg animate-pulse rounded bg-border" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <span className="block h-4 w-24 animate-pulse rounded bg-border" />
              <span className="block h-[38px] w-full animate-pulse rounded-lg bg-border" />
            </div>
          ))}
        </div>
        <span className="block h-[38px] w-28 animate-pulse rounded-lg bg-border" />
      </div>
    </div>
  )
}
