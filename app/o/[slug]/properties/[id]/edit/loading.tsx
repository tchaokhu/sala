// The edit form's own geometry with bars in it: the back link, the heading and
// its summary line, three Cards the height of โครงการและห้อง, ขนาด and รูปภาพ,
// and the delete section under them — so nothing moves when the row lands.

import { PageHeader } from '@/components/PageHeader'

export default function EditPropertyLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <span className="block h-5 w-36 animate-pulse rounded bg-border" aria-hidden />
        <PageHeader
          title="แก้ไขทรัพย์"
          summary={<span className="block h-4 w-56 animate-pulse rounded bg-border" aria-hidden />}
        />
      </div>

      <div className="flex flex-col gap-6" aria-hidden>
        <CardSkeleton titleWidth="w-40" rows={3} />
        <CardSkeleton titleWidth="w-16" rows={3} />
        <CardSkeleton titleWidth="w-20" rows={2} />

        <div className="flex flex-wrap items-center gap-3">
          <span className="block h-9 w-32 animate-pulse rounded-lg bg-border" />
          <span className="block h-9 w-20 animate-pulse rounded-lg bg-border" />
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
          <span className="block h-4 w-24 animate-pulse rounded bg-border" />
          <span className="block h-3 w-72 animate-pulse rounded bg-border" />
          <span className="block h-5 w-28 animate-pulse rounded bg-border" />
        </div>
      </div>

      <span className="sr-only">กำลังโหลดทรัพย์</span>
    </div>
  )
}

function CardSkeleton({ titleWidth, rows }: { titleWidth: string; rows: number }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
      <span className={`block h-4 animate-pulse rounded bg-border ${titleWidth}`} />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: rows * 2 }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <span className="block h-3 w-24 animate-pulse rounded bg-border" />
            <span className="block h-9 w-full animate-pulse rounded-lg bg-border" />
          </div>
        ))}
      </div>
    </div>
  )
}
