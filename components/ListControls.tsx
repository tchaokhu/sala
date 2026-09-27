// The filter chips and the keyset pager every bounded list page draws. They
// started on the Properties list; the Rentals list is the second caller.

import Link from 'next/link'
import type { ChevronRight } from 'lucide-react'

export function PagerLink({
  href,
  disabled,
  icon: Icon,
  label,
  iconSide = 'left',
}: {
  href: string
  disabled: boolean
  icon: typeof ChevronRight
  label: string
  iconSide?: 'left' | 'right'
}) {
  const shape =
    'inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 whitespace-nowrap'
  const icon = <Icon size={16} aria-hidden />

  if (disabled) {
    return (
      <span aria-disabled className={`${shape} opacity-40`}>
        {iconSide === 'left' && icon}
        {label}
        {iconSide === 'right' && icon}
      </span>
    )
  }

  return (
    <Link href={href} className={`${shape} transition-colors hover:text-ink`}>
      {iconSide === 'left' && icon}
      {label}
      {iconSide === 'right' && icon}
    </Link>
  )
}

export function FilterChip({
  href,
  active,
  label,
  count,
  tone = 'plain',
}: {
  href: string
  active: boolean
  label: string
  /** What the chip counts — a number, or words when the count is not the
   *  size of the list it opens ("2 late"). Absent draws no badge. */
  count?: React.ReactNode
  /** `warn` for a chip that names work waiting, never for one that names a
   *  status — semantic colour stays separate from the teak accent (CLAUDE.md). */
  tone?: 'plain' | 'warn'
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={
        // A fixed height rather than padding, so the skeleton's chips are the
        // same size as the real ones and the row below them does not move.
        `inline-flex h-8 items-center gap-2 rounded-full border pl-3 text-sm transition-colors ${count === undefined ? 'pr-3' : 'pr-2'} ` +
        (active
          ? tone === 'warn'
            ? 'border-warn bg-warn text-bg'
            : 'border-accent bg-accent text-on-accent'
          : tone === 'warn'
            ? 'border-warn/40 bg-warn/10 text-warn hover:border-warn'
            : 'border-border bg-surface text-muted hover:border-muted hover:text-ink')
      }
    >
      {label}
      {count !== undefined && (
        <span
          className={
            'tabular rounded-full px-1.5 text-xs ' +
            // The badge has to stay visible when the chip itself takes the hover
            // background, so it is tinted off the border rather than off bg.
            (active ? 'bg-on-accent/20' : tone === 'warn' ? 'bg-warn/20' : 'bg-border/50 text-muted')
          }
        >
          {count}
        </span>
      )}
    </Link>
  )
}
