// Every list table: a scrolling rounded frame, the header row, and the
// `sticky-manage` last column (app/globals.css) that keeps Manage in view while
// a wide table scrolls sideways.

import { TABLE_HEAD_ROW } from './styles'

export function TableFrame({
  minWidth,
  head,
  children,
}: {
  /** A literal Tailwind class, "min-w-[40rem]" — where sideways scroll begins. */
  minWidth: string
  /** The `<th>` cells. */
  head: React.ReactNode
  /** The `<tr>` rows. */
  children: React.ReactNode
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className={`sticky-manage w-full ${minWidth} text-sm`}>
        <thead>
          <tr className={TABLE_HEAD_ROW}>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
