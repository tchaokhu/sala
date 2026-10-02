// Bars in the shape of the form pieces in components/form.tsx, for the
// loading.tsx of every page that is mostly a form. Header text that does not
// depend on data is drawn for real by the loader itself, so it lands in place.

import { ChevronLeft } from 'lucide-react'

/** The back link above a page heading, as text — a loader has no slug to link. */
export function BackLinkSkeleton({ label }: { label: string }) {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 text-sm text-muted">
      <ChevronLeft size={16} aria-hidden />
      {label}
    </span>
  )
}

/** A Card: its title (real text when it is static, else a bar) and note, then
 *  `fields` label-and-input pairs in a grid. */
export function CardSkeleton({
  title,
  note,
  titleWidth = 'w-24',
  fields,
  cols = 'sm:grid-cols-2',
}: {
  title?: string
  note?: string
  titleWidth?: string
  fields: number
  cols?: string
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
      <div>
        {title ? (
          <h2 className="font-semibold">{title}</h2>
        ) : (
          <span className={`block h-4 animate-pulse rounded bg-border ${titleWidth}`} aria-hidden />
        )}
        {note && <p className="mt-1 text-sm text-muted">{note}</p>}
      </div>
      <div className={`grid gap-4 ${cols}`} aria-hidden>
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <span className="block h-3 w-24 animate-pulse rounded bg-border" />
            <span className="block h-9 w-full animate-pulse rounded-lg bg-border" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** The submit-and-cancel row under a form. */
export function FormButtonsSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-3" aria-hidden>
      <span className="block h-9 w-32 animate-pulse rounded-lg bg-border" />
      <span className="block h-9 w-20 animate-pulse rounded-lg bg-border" />
    </div>
  )
}
