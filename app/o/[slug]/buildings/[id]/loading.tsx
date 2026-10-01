// The Building page's shape before its data lands: header, map, chips, list.

export default function BuildingLoading() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-3">
        <span className="block h-4 w-44 animate-pulse rounded bg-border" />
        <span className="block h-7 w-64 animate-pulse rounded bg-border" />
        <span className="block h-4 w-52 animate-pulse rounded bg-border" />
      </div>
      <div className="h-72 animate-pulse rounded-xl border border-border bg-surface" />
      <div className="h-28 animate-pulse rounded-xl border border-border bg-surface" />
      <div className="h-48 animate-pulse rounded-xl border border-border bg-surface" />
      <span className="sr-only">Loading the Building</span>
    </div>
  )
}
