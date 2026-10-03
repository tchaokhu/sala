import { PageHeader } from '@/components/PageHeader'
import { Bar } from '@/components/Skeleton'
import { PANEL } from '@/components/styles'

export default function TemplatesLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Document Templates" summary={<Bar className="h-4 w-40" />} />
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4" aria-hidden>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex h-8 items-center justify-between gap-4">
            <Bar className="h-4 w-56" />
            <Bar className="h-4 w-32" />
          </div>
        ))}
      </div>
      <div className={`h-36 ${PANEL}`} aria-hidden />
      <span className="sr-only">Loading the Document Templates</span>
    </div>
  )
}
