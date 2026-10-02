// One number from the summary row, and the skeleton that stands in for it.
//
// Both live here so they cannot drift: the skeleton is the same box with the
// same padding and the same value height, so nothing moves when the data lands
// (CLAUDE.md). The value is a slot rather than a prop because a count and a
// baht amount are formatted differently and the tile does not care which it is.

import { Bar } from './Skeleton'
import { PANEL } from './styles'

const TONE_CLASS = {
  plain: 'text-ink',
  ok: 'text-ok',
  warn: 'text-warn',
} as const

export type Tone = keyof typeof TONE_CLASS

export function StatTile({
  label,
  tone = 'plain',
  hint,
  more,
  children,
}: {
  label: string
  tone?: Tone
  /** A second line under the number — the count behind a sum, say. Reserved
   *  even when absent, so a tile that gains one does not shove its neighbours. */
  hint?: React.ReactNode
  /** A line under the hint, only when there is something to say. */
  more?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className={PANEL}>
      <p className="text-sm text-muted">{label}</p>
      <p className={`tabular mt-2 flex h-8 items-center text-2xl font-bold ${TONE_CLASS[tone]}`}>
        {children}
      </p>
      <p className="mt-1 flex h-5 items-center text-xs text-muted">{hint}</p>
      {more && <p className="mt-0.5 flex min-h-5 items-center text-xs">{more}</p>}
    </div>
  )
}

/** The same tile with a bar where the number goes. Used by loading.tsx, which
 *  is why the shape is defined once. */
export function StatTileSkeleton({ label }: { label: string }) {
  return (
    <StatTile label={label}>
      <Bar className="h-6 w-16" />
      <span className="sr-only">Loading</span>
    </StatTile>
  )
}
