// Class strings, readable from Server and client components alike. They cannot come from components/form
// .tsx: that module is 'use client', and a plain value exported from a client
// module reaches a Server Component as a client reference, not as the string.

/** A search box sits on the page background rather than in a card, where
 *  INPUT's bg-bg would vanish into it — so it takes the card colour and a
 *  stronger edge. */
export const SEARCH_INPUT =
  'rounded-lg border border-muted/60 bg-surface px-3 py-2 text-sm text-ink shadow-sm outline-none placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent'

export const INPUT =
  'rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-60'

export const BUTTON =
  'rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:text-ink disabled:opacity-60'

/** The one filled button on a page — the action the person came to take. Teak,
 *  which is the accent and never a status (CLAUDE.md). */
export const PRIMARY_BUTTON =
  'rounded-lg border border-accent bg-accent px-3 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60'

/** The button that destroys or undoes — warn, never the accent. */
export const WARN_BUTTON =
  'rounded-lg border border-warn px-3 py-2 text-sm font-medium text-warn transition-colors hover:bg-warn/10 disabled:opacity-60'

/** The box most content sits in. Callers add the layout: `${PANEL} flex flex-col gap-3`. */
export const PANEL = 'rounded-xl border border-border bg-surface p-4'

/** A table's header cell; TableFrame draws the row it sits in. */
export const HEAD_CELL = 'px-4 py-3 font-semibold'

/** A table's header row, also drawn by the skeletons that stand in for one. */
export const TABLE_HEAD_ROW = 'border-b border-border bg-bg/60 text-left text-[11px] tracking-wide text-muted'
