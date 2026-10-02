// Skeleton pieces for loading.tsx files. Skeletons, not spinners, for content
// whose shape is known (CLAUDE.md). Header text that does not depend on data is
// drawn for real by the loader itself, so it lands in place.

/** One pulsing bar. Size and placement come in `className` ("h-4 w-24");
 *  corners default to `rounded` unless it names its own. Decorative — the
 *  loader's sr-only line is what a screen reader hears. */
export function Bar({ className }: { className: string }) {
  const corners = /\brounded/.test(className) ? '' : 'rounded '
  return <span aria-hidden className={`block animate-pulse bg-border ${corners}${className}`} />
}

/** The shapes of the form pieces in components/form.tsx. */

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
          <Bar className={`h-4 ${titleWidth}`} />
        )}
        {note && <p className="mt-1 text-sm text-muted">{note}</p>}
      </div>
      <div className={`grid gap-4 ${cols}`} aria-hidden>
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Bar className="h-3 w-24" />
            <Bar className="h-9 w-full rounded-lg" />
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
      <Bar className="h-9 w-32 rounded-lg" />
      <Bar className="h-9 w-20 rounded-lg" />
    </div>
  )
}
