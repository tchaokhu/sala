// Skeletons, not spinners — and the shape is the real list's, so nothing shifts
// when the Orgs land.

export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">เอเจนซี่</h1>
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
    </div>
  )
}
