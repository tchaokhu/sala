// The top of every page inside the Shell: what this is, one line of summary,
// and whatever the page can do about it on the right.
//
// The summary line keeps its height whether or not it has anything in it, so a
// page and its skeleton put the heading in exactly the same place and nothing
// moves when the data lands (CLAUDE.md).

export function PageHeader({
  title,
  summary,
  actions,
}: {
  title: string
  /** One line under the heading — the count a person came for, usually. */
  summary?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 flex h-5 items-center text-sm text-muted">{summary}</p>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
