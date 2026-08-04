// Skeletons, not spinners, and the same geometry as the real page — the
// heading and its summary line sit where they will sit when the rows land.

import { PageHeader } from '@/components/PageHeader'

export default function BuildingsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="โครงการ"
        summary={<span className="block h-4 w-72 animate-pulse rounded bg-border" aria-hidden />}
      />

      <div className="h-44 animate-pulse rounded-xl border border-border bg-surface" aria-hidden />

      <div className="flex flex-col gap-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
            <span className="block h-4 w-52 animate-pulse rounded bg-border" />
            <span className="block h-3 w-32 animate-pulse rounded bg-border" />
            <span className="block h-40 w-full animate-pulse rounded-lg bg-border" />
          </div>
        ))}
      </div>

      <span className="sr-only">กำลังโหลดรายการโครงการ</span>
    </div>
  )
}
