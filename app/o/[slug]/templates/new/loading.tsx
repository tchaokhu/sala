import { BackLink } from '@/components/BackLink'
import { PageHeader } from '@/components/PageHeader'
import { Bar } from '@/components/Skeleton'
import { PANEL } from '@/components/styles'

export default function NewTemplateLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink>Back to the Document Templates</BackLink>
        <PageHeader title="Add Template" summary="A blank contract or form, uploaded once and reused" />
      </div>
      <div className={`flex flex-col gap-4 ${PANEL}`} aria-hidden>
        <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
          {['', '', 'sm:col-span-full'].map((span, i) => (
            <div key={i} className={`flex flex-col gap-1.5 ${span}`}>
              <Bar className="h-3 w-24" />
              <Bar className="h-9 w-full rounded-lg" />
            </div>
          ))}
        </div>
        <Bar className="h-9 w-28 rounded-lg" />
      </div>
      <span className="sr-only">Loading the form</span>
    </div>
  )
}
